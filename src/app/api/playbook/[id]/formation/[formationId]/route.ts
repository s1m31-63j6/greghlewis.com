// One formation inside one playbook. Same shape as the play route for the same
// reason: a formation is its own item, so saving one is a small write and two
// people editing different formations cannot clobber each other.
//
// The body is validated as a formation rather than trusted, because this is the
// first user-authored object the resolver reads structurally — a play's
// overrides are numbers, but a formation tells the renderer how many players
// exist and where they align, and a malformed one would surface as a broken
// diagram on every play that references it.

import type { NextRequest } from "next/server";

import { deleteFormation, getEditTokenHash, hashToken, putFormation } from "@/lib/playbook/store";
import { validateFormation } from "@/lib/playbook/validate";
import type { Formation } from "@/lib/playbook/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9A-HJKMNP-TV-Z]{8,32}$/;
// Underscores included deliberately: the builder mints ids as `u_form_<rand>`,
// and a pattern that allowed only the shipped library's kebab-case would have
// rejected every save the UI can actually make.
const FORMATION_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;

async function authorised(id: string, req: NextRequest): Promise<boolean> {
  const stored = await getEditTokenHash(id);
  if (!stored) return true;
  const supplied = req.headers.get("x-playbook-token");
  return Boolean(supplied) && (await hashToken(supplied as string)) === stored;
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/playbook/[id]/formation/[formationId]">,
) {
  const { id, formationId } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!FORMATION_ID.test(formationId)) {
    return Response.json({ error: "bad formation id" }, { status: 400 });
  }
  if (!(await authorised(id, req))) return Response.json({ error: "read only" }, { status: 403 });

  let body: { formation?: Formation };
  try {
    body = (await req.json()) as { formation?: Formation };
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const formation = body.formation;
  if (!formation || formation.id !== formationId) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const problems = validateFormation(formation);
  if (problems.length > 0) {
    return Response.json({ error: problems[0], problems }, { status: 400 });
  }

  await putFormation(id, formation);
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/playbook/[id]/formation/[formationId]">,
) {
  const { id, formationId } = await ctx.params;
  if (!ID.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!(await authorised(id, req))) return Response.json({ error: "read only" }, { status: 403 });

  await deleteFormation(id, formationId);
  return Response.json({ ok: true });
}
