// Per-IP rate limiting via an in-memory token bucket.
//
// Lambda processes are ephemeral so this resets on cold start — perfectly
// fine for a portfolio site. Production-grade abuse prevention would need
// DynamoDB or Redis, but this catches the casual bored-user scenario
// (someone hammering the chat) at zero infrastructure cost.

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const CAPACITY = 20; // max messages per window
const REFILL_PER_MS = CAPACITY / (60 * 60 * 1000); // 20 tokens per hour

const buckets = new Map<string, Bucket>();

export function rateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: CAPACITY, lastRefillMs: now };
    buckets.set(ip, b);
  } else {
    const elapsed = now - b.lastRefillMs;
    b.tokens = Math.min(CAPACITY, b.tokens + elapsed * REFILL_PER_MS);
    b.lastRefillMs = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true };
  }
  const secsToOneToken = Math.ceil((1 - b.tokens) / REFILL_PER_MS / 1000);
  return { allowed: false, retryAfterSec: secsToOneToken };
}
