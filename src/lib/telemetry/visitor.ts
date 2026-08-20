// Cookieless visitor counting, after Plausible's design.
//
// We never store an IP or a user agent. Instead we store a truncated hash of
// (ip + ua + a salt that rotates daily), which is enough to count distinct
// people within a day and is not linkable across days.
//
// The salt is derived from a secret rather than being random-and-discarded,
// so that every Lambda instance computes the same value without shared state.
// The tradeoff is honest: someone holding TELEMETRY_SALT could recompute the
// hash for an IP they already suspect. The secret is never stored with the
// data, and the daily rotation still bounds any such correlation to 24 hours.

import { createHash } from "node:crypto";

export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function dailySalt(day: string): string {
  const secret = process.env.TELEMETRY_SALT ?? "dev-salt";
  return createHash("sha256").update(`${secret}:${day}`).digest("hex");
}

export function visitorHash(ip: string, userAgent: string, day: string): string {
  return createHash("sha256")
    .update(`${ip}|${userAgent}|${dailySalt(day)}`)
    .digest("hex")
    .slice(0, 16);
}
