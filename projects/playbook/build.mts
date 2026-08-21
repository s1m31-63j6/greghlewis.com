/**
 * Offline build for the playbook library.
 *
 *   node --experimental-strip-types projects/playbook/build.mts
 *
 * Runs on plain Node with no dependencies — type stripping is enough, which is
 * why the engine modules import each other with explicit .ts extensions.
 *
 * The job here is VALIDATION AND INDEXING, not geometry. Plays stay
 * compositional in the emitted JSON and resolve in the browser, because that is
 * what keeps library plays and user-edited plays on one code path. Baking here
 * would have meant a second renderer.
 *
 * Every play is smoke-resolved against every variant it claims, and any warning
 * that is not a benign body-budget drop fails the build. At 250 plays the most
 * common bug by far is an assignment for a slot the formation does not have,
 * and that has to fail here rather than in front of a coach.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FORMATIONS } from "../../src/lib/playbook/formations.ts";
import { ROUTES } from "../../src/lib/playbook/routes.ts";
import { SCHEMES } from "../../src/lib/playbook/blocking.ts";
import { COVERAGES, FRONTS, PRESSURES } from "../../src/lib/playbook/defense.ts";
import { resolvePlay } from "../../src/lib/playbook/resolve.ts";
import { buildIndexEntry } from "../../src/lib/playbook/search.ts";
import { validate } from "../../src/lib/playbook/validate.ts";
import { MVP_VARIANTS, variant as variantOf } from "../../src/lib/playbook/field.ts";
import type { FieldVariantId, PlaySpec } from "../../src/lib/playbook/types.ts";

import { AIR_RAID } from "./src/plays/air-raid.ts";
import { POWER_GAP } from "./src/plays/power-gap.ts";
import { ZONE_RUN } from "./src/plays/zone-run.ts";
import { WEST_COAST } from "./src/plays/west-coast.ts";
import { SPREAD_RPO } from "./src/plays/spread-rpo.ts";
import { FLEXBONE, WING_T } from "./src/plays/option.ts";
import { FLAG_PLAYS } from "./src/plays/flag.ts";
import { DEFENSE } from "./src/plays/defense.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "public", "playbook");

const PLAYS: PlaySpec[] = [
  ...AIR_RAID,
  ...POWER_GAP,
  ...ZONE_RUN,
  ...WEST_COAST,
  ...SPREAD_RPO,
  ...FLEXBONE,
  ...WING_T,
  ...FLAG_PLAYS,
  ...DEFENSE,
];

const errors: string[] = [];
const notes: string[] = [];

// ── reference integrity ─────────────────────────────────────────────────────
const formationIds = new Set(FORMATIONS.map((f) => f.id));
const routeIds = new Set(ROUTES.map((r) => r.id));
const schemeIds = new Set(SCHEMES.map((s) => s.id));
const frontIds = new Set(FRONTS.map((f) => f.id));
const coverageIds = new Set(COVERAGES.map((c) => c.id));
const pressureIds = new Set(PRESSURES.map((p) => p.id));

const seen = new Set<string>();
for (const p of PLAYS) {
  if (seen.has(p.id)) errors.push(`${p.id}: duplicate play id`);
  seen.add(p.id);

  if (p.side === "offense") {
    if (!formationIds.has(p.formationId)) errors.push(`${p.id}: unknown formation "${p.formationId}"`);
    for (const s of [p.run?.scheme, p.protection]) {
      if (s && !schemeIds.has(s)) errors.push(`${p.id}: unknown scheme "${s}"`);
    }
    for (const [slot, a] of Object.entries(p.assignments)) {
      const inner = a?.kind === "motion" ? a.then : a;
      if (inner?.kind === "route" && !routeIds.has(inner.route)) {
        errors.push(`${p.id}: unknown route "${inner.route}" on ${slot}`);
      }
      for (const b of inner?.kind === "route" ? (inner.option?.branches ?? []) : []) {
        if (!routeIds.has(b.route)) errors.push(`${p.id}: unknown branch route "${b.route}" on ${slot}`);
      }
    }
  } else {
    if (p.frontId && !frontIds.has(p.frontId)) errors.push(`${p.id}: unknown front "${p.frontId}"`);
    if (p.coverageId && !coverageIds.has(p.coverageId)) errors.push(`${p.id}: unknown coverage "${p.coverageId}"`);
    if (p.pressureId && !pressureIds.has(p.pressureId)) errors.push(`${p.id}: unknown pressure "${p.pressureId}"`);
  }

  if (!p.variantScope.length) errors.push(`${p.id}: empty variantScope`);
  for (const v of p.variantScope) {
    if (!MVP_VARIANTS.includes(v)) notes.push(`${p.id}: scoped to ${v}, which is not an MVP variant`);
  }
}

// ── coaching copy ───────────────────────────────────────────────────────────
// Two standing rules, enforced here so they cannot drift back in.
//
// The notes explain the football — what the play attacks and what to look at —
// and never the software. And Greg has ruled out the antithesis construction
// ("it is a track, not a hole"); plain declarative prose instead.
const META = /\bvalidator\b|\bthis app\b|\bthis tool\b|\bthe diagram\b|\bplaybook app\b|will say so/i;
const ANTITHESIS = /,\s+not\s|\brather than\b|\bis not a\b|\bnot because\b/i;

for (const p of PLAYS) {
  for (const [field, text] of Object.entries(p.coaching)) {
    if (!text) continue;
    if (META.test(text)) {
      errors.push(`${p.id}: coaching.${field} mentions the software; these notes are about football`);
    }
    if (ANTITHESIS.test(text)) {
      errors.push(`${p.id}: coaching.${field} uses the antithesis construction — plain prose please`);
    }
  }
}

// ── smoke resolve ───────────────────────────────────────────────────────────
// The check that matters: every play, every variant it claims, no surprises.
for (const spec of PLAYS) {
  for (const vid of spec.variantScope as FieldVariantId[]) {
    const v = variantOf(vid);
    let out;
    try {
      out = resolvePlay({ spec }, vid, false);
    } catch (e) {
      errors.push(`${spec.id} @ ${vid}: threw — ${(e as Error).message}`);
      continue;
    }

    if (!out.players.length) errors.push(`${spec.id} @ ${vid}: resolved to no players`);
    for (const w of out.warnings) errors.push(`${spec.id} @ ${vid}: ${w}`);

    // A play whose primary got dropped by the body budget is a play whose
    // point has been lost, even though nothing threw.
    if (spec.primary && !out.players.some((p) => p.slot === spec.primary)) {
      errors.push(`${spec.id} @ ${vid}: primary "${spec.primary}" was dropped by the body budget`);
    }

    // Flip has to be an exact mirror. One assertion covers half the library.
    const flipped = resolvePlay({ spec }, vid, true);
    for (const p of out.players) {
      const m = flipped.players.find((q) => q.slot === p.slot);
      if (!m) {
        errors.push(`${spec.id} @ ${vid}: "${p.slot}" missing when flipped`);
      } else if (Math.abs(m.at.x + p.at.x) > 1e-6 || Math.abs(m.at.y - p.at.y) > 1e-6) {
        errors.push(`${spec.id} @ ${vid}: "${p.slot}" is not mirrored when flipped`);
      }
    }

    for (const w of validate({ spec }, out, vid)) {
      if (w.code === "formation-legality" || w.code === "out-of-bounds" || w.code === "unknown-reference") {
        errors.push(`${spec.id} @ ${vid}: ${w.code} — ${w.message}`);
      } else {
        notes.push(`${spec.id} @ ${vid}: ${w.message}`);
      }
    }

    // Nothing may be drawn outside the frame. The quarterback's drop used to
    // leave it and simply disappeared mid-animation, which no other check saw.
    const half = Math.min(v.widthYd, v.viewWidthYd) / 2;
    for (const p of [...out.paths, ...(out.ball ? [out.ball] : [])]) {
      for (const pt of [...p.points, ...p.branches.flatMap((br) => br.points)]) {
        if (Math.abs(pt.x) > half || pt.y > v.maxRouteDepthYd + 0.01 || pt.y < -v.window.behindYd) {
          errors.push(
            `${spec.id} @ ${vid}: ${p.slot} leaves the frame at (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
          );
        }
      }
    }
    for (const pl of out.players) {
      if (Math.abs(pl.at.x) > half || pl.at.y < -v.window.behindYd) {
        errors.push(`${spec.id} @ ${vid}: ${pl.label} is outside the frame`);
      }
    }

    if (out.omitted.length) {
      notes.push(`${spec.id} @ ${vid}: ${out.omitted.join(", ")} dropped by the body budget`);
    }
  }
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):\n`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

// ── emit ────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });

const index = PLAYS.map((spec) => buildIndexEntry({ spec }, "library"));

const write = (name: string, data: unknown) => {
  const json = JSON.stringify(data);
  writeFileSync(join(OUT, name), json);
  return json.length;
};

const sizes = [
  ["plays.json", write("plays.json", PLAYS)],
  ["index.json", write("index.json", index)],
  ["formations.json", write("formations.json", FORMATIONS)],
  ["routes.json", write("routes.json", ROUTES)],
  ["schemes.json", write("schemes.json", SCHEMES)],
  ["defense.json", write("defense.json", { fronts: FRONTS, coverages: COVERAGES, pressures: PRESSURES })],
] as const;

const byPhilosophy = new Map<string, number>();
for (const p of PLAYS) byPhilosophy.set(p.philosophy, (byPhilosophy.get(p.philosophy) ?? 0) + 1);
const byVariant = new Map<string, number>();
for (const p of PLAYS) for (const v of p.variantScope) byVariant.set(v, (byVariant.get(v) ?? 0) + 1);

write("meta.json", {
  playCount: PLAYS.length,
  formationCount: FORMATIONS.length,
  routeCount: ROUTES.length,
  schemeCount: SCHEMES.length,
  frontCount: FRONTS.length,
  coverageCount: COVERAGES.length,
  pressureCount: PRESSURES.length,
  byPhilosophy: Object.fromEntries(byPhilosophy),
  byVariant: Object.fromEntries(byVariant),
});

console.log(`\n${PLAYS.length} plays validated and written to public/playbook/\n`);
for (const [name, bytes] of sizes) console.log(`  ${name.padEnd(18)} ${(bytes / 1024).toFixed(1)} KB`);
console.log("\nby philosophy:");
for (const [k, n] of [...byPhilosophy].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${n}`);
console.log("\nby variant:");
for (const [k, n] of [...byVariant].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${n}`);
if (notes.length) console.log(`\n${notes.length} note(s) (not failures):`);
for (const n of notes.slice(0, 25)) console.log("  " + n);
if (notes.length > 25) console.log(`  ... and ${notes.length - 25} more`);
