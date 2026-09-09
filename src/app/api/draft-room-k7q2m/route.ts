// Hidden one-time draft room API. GET = state (clients poll), POST = start,
// pick, or undo. The URL slug is the only gate; the league is eight friends.

import { isTeam, KEPT_IDS, pickOwner, TOTAL_PICKS } from "@/lib/draft-room/league";
import { addPick, Conflict, getState, reset, start, undoLast } from "@/lib/draft-room/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const state = async (status = 200) => Response.json(await getState(), { status });

export async function GET() {
  return state();
}

export async function POST(req: Request) {
  let body: { action?: string; playerId?: string; team?: string; by?: string; confirm?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  try {
    if (body.action === "start") {
      await start();
      return state();
    }
    if (body.action === "reset" && body.confirm === "wipe") {
      await reset();
      return state();
    }
    if (body.action === "undo") {
      await undoLast();
      return state();
    }
    if (body.action === "pick") {
      const { playerId, team, by } = body;
      if (typeof playerId !== "string" || !/^\d{1,8}$/.test(playerId) || !isTeam(team)) {
        return Response.json({ error: "bad pick" }, { status: 400 });
      }
      const current = await getState();
      const index = current.picks.length;
      if (!current.started) return Response.json({ error: "Draft hasn't started" }, { status: 409 });
      if (index >= TOTAL_PICKS) return Response.json({ error: "Draft is over" }, { status: 409 });
      if (pickOwner(index) !== team) {
        return Response.json({ error: `${pickOwner(index)} is on the clock, not ${team}` }, { status: 409 });
      }
      if (KEPT_IDS.has(playerId) || current.picks.some((p) => p.playerId === playerId)) {
        return Response.json({ error: "That player is already taken" }, { status: 409 });
      }
      await addPick({ index, playerId, team, by: String(by ?? team).slice(0, 40) });
      return state();
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    if (err instanceof Conflict) {
      return Response.json({ error: "Someone beat you to that pick", ...(await getState()) }, { status: 409 });
    }
    throw err;
  }
}
