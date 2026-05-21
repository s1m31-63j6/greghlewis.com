// Cloudflare Turnstile server-side verification.
//
// Fails open in dev (TURNSTILE_SECRET_KEY unset AND NODE_ENV !== production),
// fails closed in prod. The frontend gates submission on a token, so the
// only path here without a token is local dev.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return { ok: true, reason: "dev-skip" };
    return { ok: false, reason: "server-misconfigured" };
  }
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
