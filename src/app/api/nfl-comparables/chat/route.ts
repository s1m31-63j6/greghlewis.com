import { chat, type ChatTurn } from "@/lib/nfl-comparables/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequest {
  query: string;
  playerId?: string;
  playerName?: string;
  history?: ChatTurn[];
  contextPlayerIds?: string[];
  numResults?: number;
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const result = await chat(query, {
      playerId: body.playerId,
      playerName: body.playerName,
      history: body.history,
      contextPlayerIds: body.contextPlayerIds,
      numResults: body.numResults,
    });
    return Response.json({
      answer: result.answer,
      sources: Array.from(new Set(result.chunks.map((c) => c.sourceName))),
      subjectPlayerIds: result.subjectPlayerIds,
      mentionedPlayerIds: result.mentionedPlayerIds,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[chat] failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
