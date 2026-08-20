// Telemetry ingest.
//
// Same-origin on purpose. A first-party /api/events path is not on any
// blocklist, whereas a *.lambda-url.on.aws POST reads as third-party
// tracking to uBlock/Brave heuristics — and silently losing a slice of
// traffic is worse than having no analytics at all.

import { clientIp } from "@/lib/client-ip";
import { isBot } from "@/lib/telemetry/bots";
import { checkRateLimit } from "@/lib/telemetry/rate-limit";
import { putEvents } from "@/lib/telemetry/store";
import { partitionKey } from "@/lib/telemetry/store";
import { dayKey, visitorHash } from "@/lib/telemetry/visitor";
import {
  MAX_BODY_BYTES,
  MAX_EVENTS_PER_BATCH,
  RETENTION_DAYS,
  type EventBatch,
  type EventType,
  type RawEvent,
  type StoredEvent,
} from "@/lib/telemetry/types";

export const runtime = "nodejs";
// Without this the route gets prerendered, the way /api/religious-voices/
// leaders is.
export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<EventType>(["pageview", "engagement", "click", "change"]);

/** 204 with no body, always. The client is fire-and-forget; there is nothing
 *  useful to say back, and a silent endpoint is a smaller target. */
const noContent = () => new Response(null, { status: 204 });

function clamp(n: unknown, min: number, max: number): number | undefined {
  return typeof n === "number" && Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : undefined;
}

function str(v: unknown, maxLen: number): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, maxLen) : undefined;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return noContent();

  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return noContent();

  const ip = clientIp(req);
  if (!checkRateLimit(ip)) return noContent();

  let batch: EventBatch;
  try {
    batch = JSON.parse(raw) as EventBatch;
  } catch {
    return noContent();
  }
  if (!batch?.sid || !Array.isArray(batch.events)) return noContent();

  const day = dayKey();
  const pk = partitionKey(day);
  const vid = visitorHash(ip, ua ?? "", day);
  const sid = batch.sid.slice(0, 64);
  const ref = str(batch.ref, 128);
  const vw = clamp(batch.vw, 0, 10_000);
  const country = req.headers.get("cloudfront-viewer-country") ?? undefined;
  const receivedAt = Date.now();
  const exp = Math.floor(receivedAt / 1000) + RETENTION_DAYS * 86_400;

  const rows: StoredEvent[] = [];
  for (const [i, e] of (batch.events as RawEvent[]).slice(0, MAX_EVENTS_PER_BATCH).entries()) {
    if (!VALID_TYPES.has(e?.t)) continue;
    const path = str(e.p, 256);
    if (!path) continue;
    rows.push({
      pk,
      // Server timestamp, not the client's — clock skew would otherwise
      // scramble the ordering. The index keeps same-millisecond events apart.
      sk: `${receivedAt}#${i}#${sid.slice(0, 8)}`,
      type: e.t,
      path,
      sid,
      vid,
      ts: receivedAt,
      exp,
      label: str(e.l, 64),
      proj: str(e.pr, 64),
      ref,
      vw,
      dwellMs: clamp(e.d, 0, 6 * 60 * 60 * 1000),
      scrollPct: clamp(e.s, 0, 100),
      country,
    });
  }

  try {
    await putEvents(rows);
  } catch (err) {
    // Losing an event is strictly better than surfacing an error.
    console.error("[telemetry] write failed", err);
  }
  return noContent();
}
