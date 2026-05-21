// Cloudflare Turnstile server-side verification.
//
// Turnstile widget on the frontend produces a token; we POST it to
// Cloudflare's siteverify with our shared secret to confirm it's valid.
// Client-side Turnstile alone is theater — without server verification
// any bored scraper can skip the widget entirely.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  challenge_ts?: string;
}

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string | undefined,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // In local dev without a secret, skip verification so the chat is
    // usable. Production deploys MUST set TURNSTILE_SECRET_KEY.
    if (process.env.NODE_ENV !== "production") {
      return { ok: true, reason: "dev-skip" };
    }
    return { ok: false, reason: "server-misconfigured" };
  }
  if (!token) return { ok: false, reason: "no-token" };

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) return { ok: false, reason: `siteverify-http-${res.status}` };
  const json = (await res.json()) as SiteverifyResponse;
  if (!json.success) {
    return { ok: false, reason: json["error-codes"]?.join(",") ?? "denied" };
  }
  return { ok: true };
}
