import { chatStreamResponse, type ChatTurn } from "@/lib/religious-voices/rag";
import { getLeader } from "@/lib/religious-voices/leaders";
import { rateLimit } from "@/lib/religious-voices/rate-limit";
import { verifyTurnstile } from "@/lib/religious-voices/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequest {
  query: string;
  leaderId: string;
  history?: ChatTurn[];
  turnstileToken?: string;
}

function clientIp(request: Request): string {
  // Amplify forwards through x-forwarded-for. The first value is the
  // original client; the rest are intermediate proxies.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) return Response.json({ error: "query is required" }, { status: 400 });
  if (!body.leaderId) return Response.json({ error: "leaderId is required" }, { status: 400 });

  const ip = clientIp(request);

  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : {} },
    );
  }

  const ts = await verifyTurnstile(body.turnstileToken, ip);
  if (!ts.ok) {
    return Response.json(
      { error: `Verification failed: ${ts.reason ?? "unknown"}` },
      { status: 403 },
    );
  }

  const leader = await getLeader(body.leaderId);
  if (!leader) {
    return Response.json({ error: `Unknown leader: ${body.leaderId}` }, { status: 404 });
  }

  return chatStreamResponse(query, {
    leader,
    history: body.history,
  });
}
