// Read, replace, or delete one playbook.
//
// Reads never require the edit token; the URL is the whole access model. Writes
// check it when the book has one, which is what makes "someone else's book"
// a legible state rather than a silent overwrite.

import type { NextRequest } from "next/server";

import {
  deletePlaybook,
  getEditTokenHash,
  getPlaybook,
  hashToken,
  putPlaybook,
} from "@/lib/playbook/store";
import type { Playbook } from "@/lib/playbook/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9A-HJKMNP-TV-Z]{8,32}$/;

async function authorised(id: string, req: NextRequest): Promise<boolean> {
  const stored = await getEditTokenHash(id);
  if (!stored) return true; // no token on the book, or running without a table
  const supplied = req.headers.get("x-playbook-token");
  return Boolean(supplied) && (await hashToken(supplied as string)) === stored;
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/playbook/[id]">) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const book = await getPlaybook(id);
  if (!book) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ book });
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/playbook/[id]">) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!(await authorised(id, req))) return Response.json({ error: "read only" }, { status: 403 });

  let body: { book?: Playbook };
  try {
    body = (await req.json()) as { book?: Playbook };
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!body.book || body.book.id !== id) return Response.json({ error: "bad request" }, { status: 400 });

  const existing = await getEditTokenHash(id);
  await putPlaybook(body.book, existing ?? undefined);
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/playbook/[id]">) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!(await authorised(id, req))) return Response.json({ error: "read only" }, { status: 403 });
  await deletePlaybook(id);
  return Response.json({ ok: true });
}
