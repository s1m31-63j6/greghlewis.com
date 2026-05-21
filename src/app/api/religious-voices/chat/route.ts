import { chatStream } from "@/lib/religious-voices/chat";
import leadersJson from "@/lib/religious-voices/leaders.json";
import { dedupeSources, retrieveForLeader } from "@/lib/religious-voices/retrieval";
import { checkRateLimit } from "@/lib/religious-voices/rate-limit";
import { verifyTurnstile } from "@/lib/religious-voices/turnstile";
import type { ChatStreamEvent, ChatTurn, Leader } from "@/lib/religious-voices/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEADERS_BY_ID = new Map<string, Leader>(
  (leadersJson as { leaders: Leader[] }).leaders.map((l) => [l.leader_id, l]),
);

interface ChatPayload {
  query: string;
  leaderId: string;
  history?: ChatTurn[];
  turnstileToken?: string | null;
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  let body: ChatPayload;
  try {
    body = (await req.json()) as ChatPayload;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const query = body.query?.trim();
  if (!query) return Response.json({ error: "query is required" }, { status: 400 });
  const leader = LEADERS_BY_ID.get(body.leaderId);
  if (!leader) return Response.json({ error: `unknown leader: ${body.leaderId}` }, { status: 404 });

  const ip = clientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} },
    );
  }

  const ts = await verifyTurnstile(body.turnstileToken, ip);
  if (!ts.ok) return Response.json({ error: `Verification failed: ${ts.reason}` }, { status: 403 });

  const enc = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, ev: ChatStreamEvent) =>
    controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const retrieved = await retrieveForLeader(query, leader.leader_id, 8);
        send(controller, { type: "meta", sources: dedupeSources(retrieved) });

        for await (const event of chatStream(leader, query, retrieved, body.history ?? [])) {
          send(controller, event);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("[religious-voices][chat]", message);
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
