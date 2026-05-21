import { signedFetch } from "@/lib/religious-voices/lambda-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proxy /api/religious-voices/chat → Lambda Function URL /chat.
// SigV4-signs the request (since the URL is AuthType=AWS_IAM) and
// streams the SSE response straight through to the browser.
export async function POST(request: Request) {
  const body = await request.text();
  try {
    const upstream = await signedFetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      return Response.json(
        { error: `Upstream HTTP ${upstream.status}: ${errText.slice(0, 200)}` },
        { status: upstream.status === 200 ? 502 : upstream.status },
      );
    }
    // Pipe the SSE stream through verbatim. Headers reproduced from the
    // upstream so the browser sees the right Content-Type for SSE parsing.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[religious-voices][proxy/chat]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
