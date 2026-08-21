// One play inside one playbook. Saving an edit is a single small write rather
// than a rewrite of the whole book, which is the reason plays are their own
// items in the first place.

import type { NextRequest } from "next/server";

import { deletePlay, getEditTokenHash, hashToken, putPlay } from "@/lib/playbook/store";
import type { BookEntry } from "@/lib/playbook/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9A-HJKMNP-TV-Z]{8,32}$/;

async function authorised(id: string, req: NextRequest): Promise<boolean> {
  const stored = await getEditTokenHash(id);
  if (!stored) return true;
  const supplied = req.headers.get("x-playbook-token");
  return Boolean(supplied) && (await hashToken(supplied as string)) === stored;
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/playbook/[id]/play/[playId]">,
) {
  const { id, playId } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!(await authorised(id, req))) return Response.json({ error: "read only" }, { status: 403 });

  let body: { entry?: BookEntry };
  try {
    body = (await req.json()) as { entry?: BookEntry };
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!body.entry || body.entry.play.spec.id !== playId) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  await putPlay(id, body.entry);
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/playbook/[id]/play/[playId]">,
) {
  const { id, playId } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!(await authorised(id, req))) return Response.json({ error: "read only" }, { status: 403 });

  const position = Number(new URL(req.url).searchParams.get("position") ?? "0");
  await deletePlay(id, position, playId);
  return Response.json({ ok: true });
}
