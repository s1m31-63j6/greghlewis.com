// In-memory per-IP token bucket. Ephemeral; resets on cold start. Fine
// for a portfolio site — production-grade abuse prevention would back
// this with Redis or DynamoDB.
//
// Shared by every chat route on the site. `scope` keeps each route's
// bucket separate, so a visitor who spends their questions on one project
// still has a full allowance on another.

const CAPACITY = 20;
const REFILL_PER_SEC = CAPACITY / (60 * 60); // 20 tokens / hour

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(ip: string, scope = "default"): { allowed: boolean; retryAfter?: number } {
  const key = `${scope}:${ip}`;
  const now = Date.now() / 1000;
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: CAPACITY, lastRefill: now };
    buckets.set(key, b);
  } else {
    b.tokens = Math.min(CAPACITY, b.tokens + (now - b.lastRefill) * REFILL_PER_SEC);
    b.lastRefill = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true };
  }
  const retryAfter = Math.max(1, Math.ceil((1 - b.tokens) / REFILL_PER_SEC));
  return { allowed: false, retryAfter };
}
