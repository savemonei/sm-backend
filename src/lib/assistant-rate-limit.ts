/**
 * Simple in-memory per-user rate limit for assistant OpenRouter routes.
 * Suitable for single-instance / Vercel warm invocations; resets on cold start.
 */

type Bucket = {
  count: number;
  windowStartMs: number;
};

const buckets = new Map<string, Bucket>();

const DEFAULT_LIMIT = 20;
const WINDOW_MS = 60_000;

function getLimit(): number {
  const raw = Number(process.env.OPENROUTER_RATE_LIMIT_PER_MIN);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return DEFAULT_LIMIT;
}

export type RateLimitResult =
  | { allowed: true; remaining: number; limit: number }
  | { allowed: false; remaining: 0; limit: number; retryAfterSec: number };

/**
 * @param key typically `userId` or `userId:route`
 */
export function checkAssistantRateLimit(key: string): RateLimitResult {
  const limit = getLimit();
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStartMs >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return { allowed: true, remaining: limit - 1, limit };
  }

  if (existing.count >= limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((existing.windowStartMs + WINDOW_MS - now) / 1000)
    );
    return { allowed: false, remaining: 0, limit, retryAfterSec };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, limit };
}

/** Test helper */
export function resetAssistantRateLimits(): void {
  buckets.clear();
}
