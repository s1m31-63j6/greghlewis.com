// Cloudflare Turnstile server-side verification.
//
// Treat absent TURNSTILE_SECRET_KEY as "feature not configured" — pass
// through regardless of NODE_ENV. The frontend's NEXT_PUBLIC_TURNSTILE_REQUIRED
// flag controls whether the visitor sees a challenge widget, and the
// per-IP rate limit (rate-limit.ts) carries abuse protection on its own
// for a low-traffic portfolio site. To enable enforcement: add a real
// Cloudflare key + set TURNSTILE_SECRET_KEY.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, reason: "turnstile-not-configured" };
  if (!token) return { ok: false, reason: "no-token" };

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set("remoteip", remoteIp);

  const r = await fetch(VERIFY_URL, {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (r.status !== 200) return { ok: false, reason: `siteverify-http-${r.status}` };
  const data = (await r.json()) as { success: boolean; "error-codes"?: string[] };
  if (!data.success) return { ok: false, reason: (data["error-codes"] ?? []).join(",") || "denied" };
  return { ok: true };
}
