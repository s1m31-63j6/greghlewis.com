/**
 * Rule validation. Warnings, never blocks — a coach drawing something unusual
 * is usually right, and a tool that refuses to draw it is a tool they abandon.
 *
 * Three checks ship, and the interesting thing about all three is that no
 * competitor performs them. Playbook apps are rule-blind: none of them draw
 * flag's no-run zones, none check whether seven men are on the line, and none
 * notice that a fifteen-yard route cannot be run against a seven-second clock.
 *
 * Formation legality earns its keep twice over — it also runs at build time
 * against our own library, where an illegal formation is a straightforward bug.
 */

import { variant as variantOf } from "./field.ts";
import { formationById, resolveFormation } from "./formations.ts";
import { pathLengthYd } from "./routes.ts";
import type {
  FieldVariantId,
  Formation,
  Play,
  ResolvedPlay,
  ValidationWarning,
} from "./types.ts";

/** Men required on the line of scrimmage, by variant. Null where no rule. */
const LOS_REQUIRED: Partial<Record<FieldVariantId, number>> = {
  "11man": 7,
  "9man": 5,
  "8man": 5,
};

export function validate(
  play: Play,
  resolved: ResolvedPlay,
  variantId: FieldVariantId,
  /** Where the ball is, in yards from the offense's own goal line. */
  ballSpotYd?: number,
): ValidationWarning[] {
  const v = variantOf(variantId);
  const spec = play.spec;
  const out: ValidationWarning[] = [];

  // ── formation legality ───────────────────────────────────────────────────
  const need = LOS_REQUIRED[variantId];
  if (need !== undefined && spec.side === "offense") {
    const formation = formationById(spec.formationId);
    if (formation) {
      const onLine =
        v.line.count +
        formation.receivers.filter(
          (r) => r.onLine && resolved.players.some((p) => p.slot === r.slot),
        ).length;
      if (onLine < need) {
        out.push({
          code: "formation-legality",
          message: `${onLine} on the line of scrimmage; ${variantOf(variantId).label} needs ${need}.`,
        });
      }
    }
  }

  // Interior linemen are ineligible on the tackle variants, so a route
  // assignment for one is a penalty rather than a scheme.
  if (v.line.count >= 3 && spec.side === "offense") {
    for (const [slot, a] of Object.entries(spec.assignments)) {
      if (!a || a.kind !== "route") continue;
      if (["LG", "RG", "C", "LT", "RT"].includes(slot)) {
        out.push({
          code: "formation-legality",
          slot,
          message: `${slot} is an ineligible receiver and cannot run a route.`,
        });
      }
    }
  }

  // ── flag no-run zones ────────────────────────────────────────────────────
  // A run designed from inside a no-run zone is illegal: a forward pass is
  // mandatory there. Drawing the bands is half the feature; saying so is the
  // other half.
  if (v.noRunZones?.length && ballSpotYd !== undefined) {
    const isRun = spec.family === "run" || spec.family === "option" || spec.family === "rpo";
    const distToGoal = 100 - ballSpotYd;
    const inGoalZone = distToGoal <= 5;
    const nearMid = Math.abs(ballSpotYd - 50) <= 5;
    if (isRun && (inGoalZone || nearMid)) {
      out.push({
        code: "no-run-zone",
        message: inGoalZone
          ? "Ball is inside the goal-line no-run zone — a forward pass is required."
          : "Ball is inside the midfield no-run zone — a forward pass is required.",
      });
    }
  }

  // ── route depth against the play clock ───────────────────────────────────
  // Flag's seven-second clock is a hard cap on how deep a concept can get. A
  // route that cannot be thrown in time is a route that never gets thrown.
  if (v.passClockSec !== undefined) {
    const budgetMs = v.passClockSec * 1000;
    for (const p of resolved.paths) {
      if (p.role !== "route") continue;
      const arrives = Math.max(0, p.startDelayMs) + p.durationMs;
      if (arrives > budgetMs) {
        out.push({
          code: "route-depth-clock",
          slot: p.slot,
          message:
            `${p.slot} arrives at ${(arrives / 1000).toFixed(1)}s, past the ` +
            `${v.passClockSec}s clock. Shorten it or make it a secondary read.`,
        });
      }
    }
  }

  // ── roster size, now that players can be placed by hand ──────────────────
  if (resolved.players.length > v.playersPerSide) {
    out.push({
      code: "body-budget",
      message:
        `${resolved.players.length} players on the field; ${v.label} allows ` +
        `${v.playersPerSide}.`,
    });
  }

  // ── geometry sanity, which is what catches library bugs ──────────────────
  const halfW = Math.min(v.widthYd, v.viewWidthYd) / 2;
  for (const p of resolved.players) {
    if (Math.abs(p.at.x) > halfW - 0.2) {
      out.push({
        code: "out-of-bounds",
        slot: p.slot,
        message: `${p.label} is aligned at the edge of the diagram.`,
      });
    }
  }
  for (const p of resolved.paths) {
    if (p.role === "block" || p.role === "coverage") continue;
    if (pathLengthYd(p.points) < 0.4) {
      out.push({
        code: "unknown-reference",
        slot: p.slot,
        message: `${p.slot}'s path has no length — check its route or depth.`,
      });
    }
  }

  return [...out, ...resolved.warnings.map((message) => ({ code: "unknown-reference" as const, message }))];
}

export const WARNING_LABEL: Record<ValidationWarning["code"], string> = {
  "no-run-zone": "No-run zone",
  "formation-legality": "Formation",
  "route-depth-clock": "Play clock",
  "out-of-bounds": "Out of bounds",
  "unknown-reference": "Reference",
  "body-budget": "Roster",
};


// ─── formations a coach built ───────────────────────────────────────────────

const SPLIT_NAMES = new Set([
  "wide", "plus", "slot", "nasty", "wing", "tight", "attached",
]);
const BACK_ALIGNS = new Set([
  "i", "offset", "dot", "split", "wing", "slot", "diamond", "pistol",
]);
const QB_ALIGNS = new Set(["under", "gun", "pistol"]);
const MAX_SKILL = 8;

/**
 * Hard structural checks on a user-authored formation.
 *
 * Distinct from `validate` above, which produces coaching warnings and never
 * blocks. These are the things that would make a formation un-drawable rather
 * than merely unusual, and the API refuses them: a formation is the first
 * user-authored object the resolver reads STRUCTURALLY — a play's overrides
 * are just numbers, but a formation decides how many players exist and where
 * each one aligns, so a malformed one breaks every play that references it,
 * not only itself.
 */
export function validateFormation(f: Formation): string[] {
  const problems: string[] = [];

  if (!f.id || typeof f.id !== "string") problems.push("The formation has no id.");
  if (!f.name || !f.name.trim()) problems.push("Give the formation a name.");
  if (f.name && f.name.length > 60) problems.push("That name is too long.");
  if (!QB_ALIGNS.has(f.qb?.align)) problems.push("The quarterback needs a real alignment.");
  if (f.strength !== "L" && f.strength !== "R") problems.push("Strength must be left or right.");

  const backs = Array.isArray(f.backs) ? f.backs : [];
  const receivers = Array.isArray(f.receivers) ? f.receivers : [];

  if (backs.length + receivers.length === 0) {
    problems.push("A formation needs at least one player besides the line.");
  }
  if (backs.length + receivers.length > MAX_SKILL) {
    problems.push(`That is ${backs.length + receivers.length} skill players; the most any variant fields is ${MAX_SKILL}.`);
  }

  const seen = new Set<string>();
  for (const p of [...backs, ...receivers]) {
    if (!p.slot) problems.push("A player is missing its position.");
    else if (seen.has(p.slot)) problems.push(`Two players are both ${p.slot}.`);
    else seen.add(p.slot);
    if (p.depthYd !== undefined && (!Number.isFinite(p.depthYd) || p.depthYd > 2 || p.depthYd < -15)) {
      problems.push(`${p.slot ?? "A player"} is off the drawable field.`);
    }
  }

  for (const b of backs) {
    if (!BACK_ALIGNS.has(b.align)) problems.push(`${b.slot} has an alignment nothing can draw.`);
  }
  for (const r of receivers) {
    if (!SPLIT_NAMES.has(r.split)) problems.push(`${r.slot} has a split nothing can draw.`);
    if (r.side !== "L" && r.side !== "R") problems.push(`${r.slot} is on neither side of the ball.`);
  }

  return problems;
}

/**
 * Soft advice on a formation, in the spirit of the warnings above: a coach
 * drawing something unusual is usually right, so these are shown and never
 * enforced. Two glyphs on top of each other is the one that actually bit us —
 * a shipped flag formation drew H and Y 0.6 yards apart for weeks.
 */
export function formationWarnings(f: Formation, variantId: FieldVariantId): string[] {
  const out: string[] = [];
  const v = variantOf(variantId);
  const { players, omitted } = resolveFormation(f, variantId, false);

  const need = LOS_REQUIRED[variantId];
  if (need !== undefined) {
    const onLine = v.line.count + f.receivers.filter((r) => r.onLine).length;
    if (onLine < need) {
      out.push(`${onLine} on the line of scrimmage; ${v.label} needs ${need}.`);
    }
  }

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) < 0.6) {
        out.push(`${a.slot} and ${b.slot} are drawn on top of each other.`);
      }
    }
  }

  if (omitted.length > 0) {
    out.push(`${v.label} has room for ${v.skillCount}: ${omitted.join(", ")} would sit out.`);
  }

  return out;
}
