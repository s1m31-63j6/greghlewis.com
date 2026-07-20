// TEMPORARY diagnostic route — measures how long Amplify's SSR Lambda will hold an
// SSE stream open, and whether GET and POST are buffered differently by the CDN.
// Delete once the ceiling is recorded.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseStream(seconds: number) {
  const enc = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let i = 0; i < seconds; i++) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ i, elapsed })}\n\n`));
          await new Promise((r) => setTimeout(r, 1000));
        }
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  return sseStream(120);
}

export async function POST(req: Request) {
  // Duration is caller-controlled so we can distinguish "buffered but completes under the
  // CDN timeout" from "genuinely streams incrementally".
  let seconds = 120;
  try {
    const body = (await req.json()) as { seconds?: number };
    if (typeof body?.seconds === "number") seconds = Math.min(Math.max(body.seconds, 1), 300);
  } catch {
    /* default */
  }
  return sseStream(seconds);
}
