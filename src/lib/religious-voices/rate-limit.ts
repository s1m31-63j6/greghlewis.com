// In-memory per-IP token bucket. Ephemeral; resets on cold start. Fine
// for a portfolio site — production-grade abuse prevention would back
// this with Redis or DynamoDB.

const CAPACITY = 20;
const REFILL_PER_SEC = CAPACITY / (60 * 60); // 20 tokens / hour

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now() / 1000;
  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: CAPACITY, lastRefill: now };
    buckets.set(ip, b);
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
