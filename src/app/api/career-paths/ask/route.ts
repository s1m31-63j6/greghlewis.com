import { askStream, type AskStreamEvent, type AskTurn } from "@/lib/career-paths/ask";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AskPayload {
  question: string;
  history?: AskTurn[];
  turnstileToken?: string | null;
}

export async function POST(req: Request) {
  let body: AskPayload;
  try {
    body = (await req.json()) as AskPayload;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const question = body.question?.trim();
  if (!question) return Response.json({ error: "question is required" }, { status: 400 });

  const ip = clientIp(req);
  const rl = checkRateLimit(ip, "career-paths");
  if (!rl.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} },
    );
  }

  const ts = await verifyTurnstile(body.turnstileToken, ip);
  if (!ts.ok) return Response.json({ error: `Verification failed: ${ts.reason}` }, { status: 403 });

  const enc = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, ev: AskStreamEvent) =>
    controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of askStream(question, body.history ?? [])) {
          send(controller, event);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("[career-paths][ask]", message);
        send(controller, { type: "error", message });
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
