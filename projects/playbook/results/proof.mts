/**
 * The proof harness. Resolves the two canonical plays on every variant they
 * claim and prints what came out, so the vocabulary can be checked without a
 * browser. This is the pattern that let Two-Minute Drill ship correct.
 */

import { resolvePlay } from "../../../src/lib/playbook/resolve.ts";
import { PROOF } from "../src/plays/proof.ts";
import type { FieldVariantId } from "../../../src/lib/playbook/types.ts";

const r2 = (n: number) => Math.round(n * 10) / 10;

for (const spec of PROOF) {
  for (const v of spec.variantScope as FieldVariantId[]) {
    const out = resolvePlay({ spec }, v, false);
    console.log(`\n=== ${spec.name} @ ${v} ===`);
    console.log(
      "players:",
      out.players.map((p) => `${p.label}(${r2(p.at.x)},${r2(p.at.y)})`).join(" "),
    );
    console.log(
      "paths:",
      out.paths
        .map((p) => `${p.slot}:${p.role}[${p.points.length}p${p.branches.length ? `+${p.branches.length}b` : ""}]`)
        .join(" "),
    );
    if (out.ball) {
      const a = out.ball.points[0];
      const b = out.ball.points[out.ball.points.length - 1];
      console.log(`ball: (${r2(a.x)},${r2(a.y)}) -> (${r2(b.x)},${r2(b.y)})  ${Math.round(out.ball.durationMs)}ms`);
    }
    if (out.omitted.length) console.log("omitted:", out.omitted.join(" "));
    if (out.warnings.length) console.log("WARNINGS:", out.warnings);
    console.log("duration:", Math.round(out.durationMs), "ms");
  }
}
