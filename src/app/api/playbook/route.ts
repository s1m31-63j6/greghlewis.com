// Create a playbook. Returns the id, which IS the share link, plus an edit
// token the browser keeps in localStorage.
//
// The token is not security. It is the affordance that says "you are viewing
// someone else's book; editing will fork it into your own" — which is exactly
// the copy-on-write trigger the play model already implements.

import { newId, hashToken, putPlaybook, storageAvailable } from "@/lib/playbook/store";
import { DEFAULT_STYLE } from "@/lib/playbook/resolve";
import type { FieldVariantId, Playbook } from "@/lib/playbook/types";

export const runtime = "nodejs";
// Without this the route gets prerendered, the way /api/religious-voices/
// leaders is.
export const dynamic = "force-dynamic";

const VARIANTS: FieldVariantId[] = ["5flag", "7man", "11man", "9man", "8man"];

export async function POST(req: Request) {
  if (!storageAvailable()) {
    return Response.json(
      { error: "Saving playbooks is not switched on yet. The library is fully browsable in the meantime." },
      { status: 503 },
    );
  }

  let body: { name?: string; variant?: string };
  try {
    body = (await req.json()) as { name?: string; variant?: string };
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const variant = VARIANTS.includes(body.variant as FieldVariantId)
    ? (body.variant as FieldVariantId)
    : "11man";
  const now = new Date().toISOString();

  const book: Playbook = {
    id: newId(),
    name: (body.name ?? "Untitled Playbook").slice(0, 80),
    variant,
    style: DEFAULT_STYLE,
    createdAt: now,
    updatedAt: now,
    entries: [],
  };

  const editToken = newId(24);
  await putPlaybook(book, await hashToken(editToken));

  return Response.json({ book, editToken }, { status: 201 });
}
