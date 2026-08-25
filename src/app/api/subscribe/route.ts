/**
 * Signup ingest.
 *
 * A public endpoint that writes personal data, which makes it the one route on
 * this site worth hardening properly rather than optimistically:
 *
 *   - a honeypot field no human ever sees and every naive bot fills in
 *   - length caps before anything is parsed or stored
 *   - a source allowlist, so the stored attribution cannot be forged into
 *     something the dashboard will render
 *   - a per-IP limiter far tighter than the telemetry one, because a person
 *     signs up once and a script does not
 *
 * What it deliberately does NOT do is filter on user-agent the way /api/events
 * does. Telemetry can drop a suspicious UA for free, since one lost sample
 * changes nothing. Here a false positive means somebody typed their address,
 * got told they were on the list, and was silently discarded — which is a far
 * worse outcome than storing the occasional junk row. The honeypot catches the
 * bots that matter and costs no real person anything.
 *
 * It answers in JSON rather than the telemetry route's silent 204: somebody
 * typed their address in and is waiting to be told it worked.
 */

import { clientIp } from "@/lib/client-ip";
import { SOURCE_IDS } from "@/lib/subscribe/copy";
import { checkSignupLimit } from "@/lib/subscribe/rate-limit";
import { putSignup } from "@/lib/subscribe/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_000;
const MAX_EMAIL = 254; // RFC 5321
const MAX_NOTE = 800;

/**
 * Deliberately permissive. The address gets confirmed by an email actually
 * arriving; a regex that rejects valid but unusual addresses fails a real
 * person in a way that no clever pattern is worth.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Too long." }, 413);

  let body: {
    email?: unknown;
    note?: unknown;
    source?: unknown;
    company?: unknown;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  // The honeypot. A hidden field named something a password manager or a bot
  // will happily fill; a browser used by a person leaves it empty. Answer 200
  // so whatever filled it believes it succeeded.
  if (typeof body.company === "string" && body.company.length > 0) {
    return json({ ok: true });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || email.length > MAX_EMAIL || !EMAIL.test(email)) {
    return json({ error: "That does not look like an email address." }, 400);
  }

  const source =
    typeof body.source === "string" && SOURCE_IDS.includes(body.source)
      ? body.source
      : "unknown";

  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim().slice(0, MAX_NOTE)
      : undefined;

  if (!checkSignupLimit(clientIp(req))) {
    return json({ error: "Too many signups from here. Try again later." }, 429);
  }

  try {
    await putSignup({ email, source, note, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error("[subscribe] write failed", err);
    return json({ error: "Could not save that. Try again in a moment." }, 500);
  }

  return json({ ok: true });
}
