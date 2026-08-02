/**
 * Dump subscription catalog tables from Supabase → src/data/catalog/raw/*.json
 *
 * Usage (from sm-backend):
 *   node scripts/dump-catalog.mjs
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "src", "data", "catalog", "raw");

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || key === "your_service_role_key") {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (real service_role secret required)."
  );
  process.exit(1);
}

const TABLES = [
  "regions",
  "subscription_services",
  "service_availability",
  "subscription_plans",
  "subscription_prices",
];

const PAGE = 1000;

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAll(table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await sb.from(table).select("*").range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

mkdirSync(outDir, { recursive: true });

const summary = {};
for (const table of TABLES) {
  process.stdout.write(`Dumping ${table}… `);
  const data = await fetchAll(table);
  const path = join(outDir, `${table}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  summary[table] = data.length;
  console.log(`${data.length} rows → ${path}`);
}

writeFileSync(
  join(outDir, "_summary.json"),
  JSON.stringify(
    {
      dumpedAt: new Date().toISOString(),
      tables: summary,
    },
    null,
    2
  ) + "\n"
);

console.log("\nDone. Raw dumps in src/data/catalog/raw/");
