// Per-IP token bucket for the telemetry beacon. Deliberately separate from
// the Bedrock chat limiter in src/lib/religious-voices/rate-limit.ts: that
// one allows 20 requests/hour, which is right for a $0.04 model call and far
// too tight here, where one engaged session legitimately flushes a few dozen
// batches. Ephemeral, resets on cold start — this exists to bound abuse, not
// to be an accurate quota.

const CAPACITY = 120; // burst
const REFILL_PER_SEC = 1; // steady state

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/** Keeps the map from growing without bound on a long-lived Lambda. */
const MAX_TRACKED = 5000;

export function checkRateLimit(ip: string): boolean {
  const now = Date.now() / 1000;
  let b = buckets.get(ip);
  if (!b) {
    if (buckets.size >= MAX_TRACKED) buckets.clear();
    b = { tokens: CAPACITY, lastRefill: now };
    buckets.set(ip, b);
  } else {
    b.tokens = Math.min(CAPACITY, b.tokens + (now - b.lastRefill) * REFILL_PER_SEC);
    b.lastRefill = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return true;
  }
  return false;
}
