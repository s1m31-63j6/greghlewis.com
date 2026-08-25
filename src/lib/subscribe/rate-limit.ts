/**
 * Per-IP limiter for signups.
 *
 * Separate from the telemetry limiter for the same reason that one is separate
 * from the chat limiter: the shapes have nothing in common. Telemetry allows a
 * burst of 120 because one engaged session legitimately flushes dozens of
 * beacons. A person signs up once, maybe twice if they mistype. Five in an
 * hour is generous for a human and useless to a script.
 *
 * Ephemeral and per-instance, so it resets on a cold start and a determined
 * attacker can wait it out. That is the intended level: bound the damage a
 * loop can do, without pretending to be a quota.
 */

const CAPACITY = 5;
const REFILL_PER_SEC = 5 / 3600; // back to full over an hour

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/** Keeps the map bounded on a long-lived Lambda. */
const MAX_TRACKED = 5000;

export function checkSignupLimit(ip: string): boolean {
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
