/**
 * Per-IP token bucket, held in module scope.
 *
 * This is deliberately the cheap version, and it is honest about what it does and
 * doesn't buy. It is per *instance*: Lambda may run several concurrently, so the
 * effective limit is roughly CAPACITY x live instances, and it resets on cold
 * start. It stops casual hammering, not a determined attacker.
 *
 * The real spend ceiling is reserved concurrency on the function itself (see the
 * CDK stack) — that bounds the burn rate no matter how many callers there are,
 * which matters because each request costs roughly $0.04 in Sonnet tokens.
 */

const CAPACITY = 8; // burst
const WINDOW_MS = 60 * 60 * 1000; // refill one bucket per hour
const REFILL_PER_MS = CAPACITY / WINDOW_MS;

interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: CAPACITY, last: now };
  b.tokens = Math.min(CAPACITY, b.tokens + (now - b.last) * REFILL_PER_MS);
  b.last = now;

  if (b.tokens < 1) {
    buckets.set(ip, b);
    return { allowed: false, retryAfter: Math.ceil((1 - b.tokens) / REFILL_PER_MS / 1000) };
  }
  b.tokens -= 1;
  buckets.set(ip, b);

  // Keep the map from growing without bound on a long-lived instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now - v.last > WINDOW_MS) buckets.delete(k);
    }
  }
  return { allowed: true };
}

export function clientIp(event: any): string {
  const xff: string | undefined = event?.headers?.["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return event?.requestContext?.http?.sourceIp ?? "unknown";
}
