#!/usr/bin/env node
/**
 * Backend API test suite – run before deployment.
 *
 * Usage:
 *   Set in script or env: BASE_URL, TEST_EMAIL, TEST_PASSWORD
 *   node scripts/test-api.mjs
 *   BASE_URL=http://localhost:4000 TEST_EMAIL=you@example.com TEST_PASSWORD=secret node scripts/test-api.mjs
 *
 * Or copy scripts/test-api.config.example.env to scripts/test-api.config.env and fill in values,
 * then run: node scripts/test-api.mjs
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config: env vars override config file
function loadConfig() {
  const configPath = join(__dirname, "test-api.config.env");
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) process.env[key] = value;
        }
      }
    }
  }
  const baseUrl = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
  const email = process.env.TEST_EMAIL || "";
  const password = process.env.TEST_PASSWORD || "";
  return { baseUrl, email, password };
}

const { baseUrl, email, password } = loadConfig();

let accessToken = null;
let refreshToken = null;
let userId = null;
const results = { passed: 0, failed: 0, skipped: 0 };

function log(name, ok, detail = "") {
  const isSkip = ok === null;
  const symbol = ok === true ? "✓" : isSkip ? "○" : "✗";
  console.log(`  ${symbol} ${name} ${detail ? `– ${detail}` : ""}`);
  if (ok === true) results.passed++;
  else if (isSkip) results.skipped++;
  else results.failed++;
}

async function request(path, options = {}) {
  const url = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body, headers: res.headers };
}

async function run() {
  console.log("\n--- Savemonei Backend API Tests ---");
  console.log(`BASE_URL: ${baseUrl}`);
  console.log(`TEST_EMAIL: ${email ? email.replace(/^(.{2}).*@/, "$1***@") : "(not set)"}\n`);

  // --- Health (no auth) ---
  try {
    const res = await request("/health");
    const ok = res.ok && res.body?.status === "ok";
    log("GET /health", ok, ok ? "" : `status=${res.status} body=${JSON.stringify(res.body)}`);
  } catch (e) {
    log("GET /health", false, e.message);
  }

  // --- Auth: login (required for protected routes) ---
  if (!email || !password) {
    log("POST /auth/login", null, "SKIP (set TEST_EMAIL and TEST_PASSWORD)");
  } else {
    try {
      const res = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (res.ok && res.body?.session?.access_token) {
        accessToken = res.body.session.access_token;
        refreshToken = res.body.session.refresh_token;
        userId = res.body.user?.id;
        log("POST /auth/login", true);
      } else {
        log("POST /auth/login", false, res.body?.error?.message || `status=${res.status}`);
      }
    } catch (e) {
      log("POST /auth/login", false, e.message);
    }
  }

  const token = accessToken;

  // --- Me (auth) ---
  try {
    if (!token) {
      log("GET /me", null, "SKIP (no token)");
    } else {
      const res = await request("/me", { token });
      const ok = res.ok && res.body?.user?.id;
      log("GET /me", !!ok, ok ? "" : `status=${res.status}`);
    }
  } catch (e) {
    log("GET /me", token ? false : null, token ? e.message : "SKIP (no token)");
  }

  // --- Profile GET/PUT (auth) ---
  try {
    const getRes = await request("/profile", { token });
    if (!token) {
      log("GET /profile", null, "SKIP (no token)");
    } else {
      const ok = getRes.status === 200 && (getRes.body?.profile === null || typeof getRes.body?.profile === "object");
      const unconfigured = getRes.status === 503;
      log("GET /profile", ok || unconfigured, ok ? "" : unconfigured ? "unconfigured" : `status=${getRes.status}`);
    }
  } catch (e) {
    log("GET /profile", token ? false : null, token ? e.message : "SKIP");
  }

  if (token && userId) {
    try {
      const putRes = await request("/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({
          user_id: userId,
          life_stages: ["building_career"],
          primary_goals: ["emergency_fund"],
          use_case: "spending_goals",
          profile_completed_at: new Date().toISOString(),
        }),
      });
      const ok = putRes.ok && (putRes.body?.profile != null || putRes.body?.profile === null);
      const unconfigured = putRes.status === 503;
      log("PUT /profile", ok || unconfigured, ok ? "" : unconfigured ? "unconfigured" : `status=${putRes.status}`);
    } catch (e) {
      log("PUT /profile", false, e.message);
    }
  } else {
    log("PUT /profile", null, "SKIP (no token)");
  }

  // --- Auth refresh ---
  if (!refreshToken) {
    log("POST /auth/refresh", null, "SKIP (no refresh token)");
  } else {
    try {
      const res = await request("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const ok = res.ok && res.body?.session?.access_token;
      log("POST /auth/refresh", !!ok, ok ? "" : `status=${res.status}`);
    } catch (e) {
      log("POST /auth/refresh", false, e.message);
    }
  }

  // --- Subscription prices (no auth) ---
  try {
    const res = await request("/subscription-prices?region=US");
    const ok = res.status === 200 || res.status === 503;
    const detail = res.status === 503 ? "unconfigured (expected if no Supabase)" : "";
    log("GET /subscription-prices?region=US", ok, detail);
  } catch (e) {
    log("GET /subscription-prices", false, e.message);
  }

  // --- Import: money-manager-category-map (no auth) ---
  try {
    const res = await request("/import/money-manager-category-map");
    const ok = res.ok && typeof res.body?.map === "object";
    log("GET /import/money-manager-category-map", ok, ok ? "" : `status=${res.status}`);
  } catch (e) {
    log("GET /import/money-manager-category-map", false, e.message);
  }

  // --- Import: merge-categories valid body (no auth) ---
  try {
    const res = await request("/import/merge-categories", {
      method: "POST",
      body: JSON.stringify({
        backupData: {
          data: {
            categories: [
              { id: "cat_1", name: "Food", type: "expense", parent_id: null },
              { id: "cat_2", name: "Sub", type: "expense", parent_id: null },
            ],
          },
        },
        existingCategories: [
          { id: "existing_1", name: "Groceries", type: "expense", parent_id: null },
        ],
      }),
    });
    const hasBackupData = res.body?.backupData && (res.body.backupData.data?.categories != null || Array.isArray(res.body.backupData.categories));
    const ok = res.ok && hasBackupData;
    log("POST /import/merge-categories (valid)", ok, ok ? "" : `status=${res.status}`);
  } catch (e) {
    log("POST /import/merge-categories (valid)", false, e.message);
  }

  // --- Import: merge-categories invalid body → 400 ---
  try {
    const res = await request("/import/merge-categories", {
      method: "POST",
      body: JSON.stringify({ backupData: {}, existingCategories: "not-array" }),
    });
    const ok = res.status === 400 && res.body?.error;
    log("POST /import/merge-categories (invalid → 400)", !!ok, ok ? "" : `status=${res.status}`);
  } catch (e) {
    log("POST /import/merge-categories (invalid)", false, e.message);
  }

  // --- Sync tokens GET (auth) ---
  try {
    const res = await request("/sync/tokens", { token });
    const ok = res.status === 200 || res.status === 503;
    if (!token) log("GET /sync/tokens", null, "SKIP (no token)");
    else log("GET /sync/tokens", ok, res.status === 503 ? "unconfigured" : "");
  } catch (e) {
    log("GET /sync/tokens", token ? false : null, token ? e.message : "SKIP");
  }

  // --- Sync tokens PUT (auth) ---
  if (token) {
    try {
      const res = await request("/sync/tokens", {
        method: "PUT",
        token,
        body: JSON.stringify({
          provider: "google",
          encrypted_access_token: "test-token",
          encrypted_refresh_token: "test-refresh",
        }),
      });
      const ok = res.status === 200 || res.status === 503;
      log("PUT /sync/tokens", ok, res.status === 503 ? "unconfigured" : "");
    } catch (e) {
      log("PUT /sync/tokens", false, e.message);
    }
  } else {
    log("PUT /sync/tokens", null, "SKIP (no token)");
  }

  // --- Sync tokens DELETE (auth) ---
  if (token) {
    try {
      const res = await request("/sync/tokens?provider=google", { method: "DELETE", token });
      const ok = res.status === 200 || res.status === 503;
      log("DELETE /sync/tokens", ok, res.status === 503 ? "unconfigured" : "");
    } catch (e) {
      log("DELETE /sync/tokens", false, e.message);
    }
  } else {
    log("DELETE /sync/tokens", null, "SKIP (no token)");
  }

  // --- AI ask (auth, may 503 if no OpenAI key) ---
  if (token) {
    try {
      const res = await request("/ai/ask", {
        method: "POST",
        token,
        body: JSON.stringify({
          intent: "monthly_insight",
          context: { summary: "Spent 500 on food this month." },
        }),
      });
      const ok = res.status === 200 || res.status >= 502;
      const detail = res.status === 503 ? "unconfigured" : res.status === 502 ? "empty/error" : res.status > 200 ? "optional" : "";
      log("POST /ai/ask", ok, ok ? detail : `status=${res.status}`);
    } catch (e) {
      log("POST /ai/ask", false, e.message);
    }
  } else {
    log("POST /ai/ask", null, "SKIP (no token)");
  }

  // --- Logout ---
  try {
    const res = await request("/auth/logout", { method: "POST", token });
    log("POST /auth/logout", res.ok, res.ok ? "" : `status=${res.status}`);
  } catch (e) {
    log("POST /auth/logout", false, e.message);
  }

  // --- Summary ---
  console.log("\n--- Summary ---");
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  if (results.failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
