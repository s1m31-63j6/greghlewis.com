// TEMPORARY diagnostic route — measures how long Amplify's SSR Lambda will hold an
// SSE stream open before cutting it. Delete once the ceiling is recorded.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const enc = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let i = 0; i < 120; i++) {
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
