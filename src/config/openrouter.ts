/**
 * OpenRouter configuration for the SaveMonei assistant proxy.
 * API key stays server-side only — never expose via EXPO_PUBLIC_* or client bundles.
 */

export type OpenRouterRole = "planner" | "reasoner";

const DEFAULT_FREE_CHAIN = [
  "openrouter/free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-26b-a4b-it:free",
] as const;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

function parseModelList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Merge primary + fallbacks, de-dupe while preserving order. */
function mergeModelChain(primary: string[], fallbacks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [...primary, ...fallbacks]) {
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

function resolveChain(role: OpenRouterRole): string[] {
  const legacyFallbacks = parseModelList(process.env.OPENROUTER_FALLBACK_MODELS);

  if (role === "planner") {
    const multi = parseModelList(process.env.OPENROUTER_PLANNER_MODELS);
    const single = parseModelList(process.env.OPENROUTER_PLANNER_MODEL);
    const chain = mergeModelChain(multi.length ? multi : single, legacyFallbacks);
    return chain.length > 0 ? chain : [...DEFAULT_FREE_CHAIN];
  }

  const multi = parseModelList(process.env.OPENROUTER_REASONER_MODELS);
  const single = parseModelList(process.env.OPENROUTER_REASONER_MODEL);
  const chain = mergeModelChain(multi.length ? multi : single, legacyFallbacks);
  return chain.length > 0 ? chain : [...DEFAULT_FREE_CHAIN];
}

export type OpenRouterConfig = {
  apiKey: string | null;
  baseUrl: string;
  httpReferer: string;
  appTitle: string;
  timeoutMs: number;
  /** Retries on the *same* model for transient errors before advancing. */
  maxRetriesPerModel: number;
  plannerModels: string[];
  reasonerModels: string[];
};

export function getOpenRouterConfig(): OpenRouterConfig {
  const timeoutRaw = Number(process.env.OPENROUTER_TIMEOUT_MS);
  const retriesRaw = Number(process.env.OPENROUTER_MAX_RETRIES);
  const rawKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  // Strip accidental "Bearer " / quotes if pasted into the env var
  const apiKey =
    rawKey
      .replace(/^Bearer\s+/i, "")
      .replace(/^["']+|["']+$/g, "")
      .trim() || null;

  return {
    apiKey,
    baseUrl: OPENROUTER_BASE_URL,
    httpReferer:
      process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://savemonei.app",
    appTitle: process.env.OPENROUTER_APP_TITLE?.trim() || "SaveMonei",
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 20_000,
    maxRetriesPerModel:
      Number.isFinite(retriesRaw) && retriesRaw >= 0 ? Math.floor(retriesRaw) : 1,
    plannerModels: resolveChain("planner"),
    reasonerModels: resolveChain("reasoner"),
  };
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(getOpenRouterConfig().apiKey);
}

export function getModelsForRole(role: OpenRouterRole): string[] {
  const cfg = getOpenRouterConfig();
  return role === "planner" ? cfg.plannerModels : cfg.reasonerModels;
}

export { DEFAULT_FREE_CHAIN };
