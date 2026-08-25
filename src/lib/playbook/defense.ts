/**
 * Defense as a peer of offense: fronts, coverages, and pressures are
 * first-class objects with their own library and their own resolution.
 *
 * Technique numbers already ARE a symbolic alignment vocabulary — a 3-technique
 * is "outside shade of the guard" regardless of field size — so the defensive
 * line gets exactly the treatment receiver splits get, and a front resolves
 * across variants for the same reason a formation does.
 *
 * Coverage naming follows the real convention: the number in "Cover N" is the
 * count of defenders with deep responsibility, with 0 and 1 as the man
 * exceptions. Receivers are numbered from the sideline in, because that is how
 * coverage rules are actually written ("carry #2 vertical", "expand to #1").
 */

import { landmark, sideSign, techniqueAnchorSlot, techniqueOffset, variant as variantOf } from "./field.ts";
import type {
  Coverage,
  DefensiveFront,
  FieldVariantId,
  GapId,
  Pressure,
  ResolvedPath,
  ResolvedPlayer,
  ResolvedZone,
  Vec,
  Zone,
  ZoneLandmark,
} from "./types.ts";
import { gapAnchor } from "./field.ts";

// ─── fronts ─────────────────────────────────────────────────────────────────

export const FRONTS: DefensiveFront[] = [
  {
    id: "over-4-3",
    name: "4-3 Over",
    aliases: ["Over", "4-3", "Base Over"],
    variantScope: ["11man"],
    tags: ["four-down", "base", "even"],
    spots: [
      { slot: "E", technique: "5", over: "T", side: "L", depthYd: 0.9, priority: 1 },
      { slot: "T", technique: "3", over: "G", side: "L", depthYd: 0.9, priority: 2 },
      { slot: "N", technique: "1", over: "C", side: "R", depthYd: 0.9, priority: 3 },
      { slot: "E2", technique: "9", over: "TE", side: "R", depthYd: 0.9, priority: 4 },
      { slot: "W", side: "L", depthYd: 4.6, lateralYd: -3.4, priority: 5 },
      { slot: "M", side: "mid", depthYd: 4.8, lateralYd: 0.3, priority: 6 },
      { slot: "S", side: "R", depthYd: 4.6, lateralYd: 3.8, priority: 7 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -19, priority: 8 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 19, priority: 9 },
      { slot: "FS", side: "mid", depthYd: 13, lateralYd: -2, priority: 10 },
      { slot: "SS", side: "R", depthYd: 9, lateralYd: 8, priority: 11 },
    ],
  },
  {
    id: "nickel-4-2-5",
    name: "4-2-5 Nickel",
    aliases: ["Nickel", "4-2-5", "Five DB"],
    variantScope: ["11man"],
    tags: ["four-down", "nickel", "spread-answer"],
    spots: [
      { slot: "E", technique: "5", over: "T", side: "L", depthYd: 0.9, priority: 1 },
      { slot: "T", technique: "3", over: "G", side: "L", depthYd: 0.9, priority: 2 },
      { slot: "N", technique: "2i", over: "G", side: "R", depthYd: 0.9, priority: 3 },
      { slot: "E2", technique: "5", over: "T", side: "R", depthYd: 0.9, priority: 4 },
      { slot: "W", side: "L", depthYd: 4.6, lateralYd: -2.6, priority: 5 },
      { slot: "M", side: "R", depthYd: 4.6, lateralYd: 1.6, priority: 6 },
      { slot: "$", side: "R", depthYd: 5.5, lateralYd: 8.5, priority: 7 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -19, priority: 8 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 19, priority: 9 },
      { slot: "FS", side: "L", depthYd: 12, lateralYd: -6, priority: 10 },
      { slot: "SS", side: "R", depthYd: 12, lateralYd: 6, priority: 11 },
    ],
  },
  {
    id: "odd-3-4",
    name: "3-4 Odd",
    aliases: ["3-4", "Odd Front", "Okie"],
    variantScope: ["11man"],
    tags: ["three-down", "odd", "two-gap"],
    spots: [
      { slot: "E", technique: "4", over: "T", side: "L", depthYd: 0.9, priority: 1 },
      { slot: "N", technique: "0", over: "C", side: "mid", depthYd: 0.9, priority: 2 },
      { slot: "E2", technique: "4", over: "T", side: "R", depthYd: 0.9, priority: 3 },
      { slot: "W", side: "L", depthYd: 3.2, lateralYd: -5.4, priority: 4 },
      { slot: "M", side: "L", depthYd: 4.6, lateralYd: -1.6, priority: 5 },
      { slot: "B", side: "R", depthYd: 4.6, lateralYd: 1.6, priority: 6 },
      { slot: "S", side: "R", depthYd: 3.2, lateralYd: 5.4, priority: 7 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -19, priority: 8 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 19, priority: 9 },
      { slot: "FS", side: "mid", depthYd: 13, lateralYd: 0, priority: 10 },
      { slot: "SS", side: "R", depthYd: 9, lateralYd: 7, priority: 11 },
    ],
  },
  {
    id: "odd-3-3-5",
    name: "3-3-5 Stack",
    aliases: ["3-3-5", "Stack", "Double Eagle"],
    variantScope: ["11man"],
    tags: ["three-down", "stack", "multiple"],
    spots: [
      { slot: "E", technique: "5", over: "T", side: "L", depthYd: 0.9, priority: 1 },
      { slot: "N", technique: "0", over: "C", side: "mid", depthYd: 0.9, priority: 2 },
      { slot: "E2", technique: "5", over: "T", side: "R", depthYd: 0.9, priority: 3 },
      { slot: "W", side: "L", depthYd: 4.4, lateralYd: -4.6, priority: 4 },
      { slot: "M", side: "mid", depthYd: 4.4, lateralYd: 0, priority: 5 },
      { slot: "S", side: "R", depthYd: 4.4, lateralYd: 4.6, priority: 6 },
      { slot: "$", side: "R", depthYd: 6, lateralYd: 10, priority: 7 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -19, priority: 8 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 19, priority: 9 },
      { slot: "FS", side: "L", depthYd: 12, lateralYd: -6, priority: 10 },
      { slot: "SS", side: "R", depthYd: 12, lateralYd: 6, priority: 11 },
    ],
  },
  {
    id: "goal-line-6-2",
    name: "6-2 Goal Line",
    aliases: ["Goal Line", "6-2", "Bear"],
    variantScope: ["11man"],
    tags: ["short-yardage", "heavy", "goal-line"],
    spots: [
      { slot: "E", technique: "9", over: "TE", side: "L", depthYd: 0.8, priority: 1 },
      { slot: "T", technique: "5", over: "T", side: "L", depthYd: 0.8, priority: 2 },
      { slot: "N", technique: "2i", over: "G", side: "L", depthYd: 0.8, priority: 3 },
      { slot: "N2", technique: "2i", over: "G", side: "R", depthYd: 0.8, priority: 4 },
      { slot: "T2", technique: "5", over: "T", side: "R", depthYd: 0.8, priority: 5 },
      { slot: "E2", technique: "9", over: "TE", side: "R", depthYd: 0.8, priority: 6 },
      { slot: "M", side: "L", depthYd: 3.4, lateralYd: -1.8, priority: 7 },
      { slot: "S", side: "R", depthYd: 3.4, lateralYd: 1.8, priority: 8 },
      { slot: "C", side: "L", depthYd: 5, lateralYd: -12, priority: 9 },
      { slot: "C2", side: "R", depthYd: 5, lateralYd: 12, priority: 10 },
      { slot: "FS", side: "mid", depthYd: 7, lateralYd: 0, priority: 11 },
    ],
  },
  {
    id: "seven-3-2-2",
    name: "3-2-2",
    aliases: ["7v7 Base", "3-2-2"],
    variantScope: ["7man"],
    tags: ["7v7", "base"],
    spots: [
      { slot: "E", side: "L", depthYd: 0.9, lateralYd: -2.8, priority: 1 },
      { slot: "M", side: "mid", depthYd: 4.2, lateralYd: 0, priority: 2 },
      { slot: "E2", side: "R", depthYd: 0.9, lateralYd: 2.8, priority: 3 },
      { slot: "C", side: "L", depthYd: 6, lateralYd: -13, priority: 4 },
      { slot: "C2", side: "R", depthYd: 6, lateralYd: 13, priority: 5 },
      { slot: "FS", side: "L", depthYd: 11, lateralYd: -5, priority: 6 },
      { slot: "SS", side: "R", depthYd: 11, lateralYd: 5, priority: 7 },
    ],
  },
  {
    id: "flag-1-rush",
    name: "Single Rush",
    aliases: ["1 Rush", "Flag Base", "One Rusher"],
    variantScope: ["5flag"],
    tags: ["flag", "base", "one-rusher"],
    spots: [
      // The rusher starts seven yards back, which is a rule, not a preference.
      { slot: "R", side: "mid", depthYd: 7, lateralYd: 0, priority: 1 },
      { slot: "C", side: "L", depthYd: 5, lateralYd: -9, priority: 2 },
      { slot: "C2", side: "R", depthYd: 5, lateralYd: 9, priority: 3 },
      { slot: "M", side: "mid", depthYd: 5, lateralYd: 0, priority: 4 },
      { slot: "FS", side: "mid", depthYd: 11, lateralYd: 0, priority: 5 },
    ],
  },
  {
    id: "flag-0-rush",
    name: "Zero Rush",
    aliases: ["No Rush", "Drop Eight", "Flag Cloud"],
    variantScope: ["5flag"],
    tags: ["flag", "coverage", "no-rush"],
    spots: [
      { slot: "C", side: "L", depthYd: 5, lateralYd: -9, priority: 1 },
      { slot: "C2", side: "R", depthYd: 5, lateralYd: 9, priority: 2 },
      { slot: "M", side: "mid", depthYd: 6, lateralYd: 0, priority: 3 },
      { slot: "SS", side: "R", depthYd: 9, lateralYd: 4, priority: 4 },
      { slot: "FS", side: "L", depthYd: 11, lateralYd: -4, priority: 5 },
    ],
  },
  {
    id: "under-4-3",
    name: "4-3 Under",
    aliases: ["Under", "Under Front", "Eagle"],
    variantScope: ["11man"],
    tags: ["four-down", "base", "odd-spacing", "run-front"],
    spots: [
      { slot: "E", technique: "5", over: "T", side: "R", depthYd: 0.9, priority: 1 },
      { slot: "N", technique: "1", over: "C", side: "L", depthYd: 0.9, priority: 2 },
      { slot: "T", technique: "3", over: "G", side: "L", depthYd: 0.9, priority: 3 },
      { slot: "E2", technique: "9", over: "TE", side: "R", depthYd: 0.9, priority: 4 },
      { slot: "S", technique: "9", over: "TE", side: "R", depthYd: 1.4, lateralYd: 1.2, priority: 5 },
      { slot: "M", side: "mid", depthYd: 4.8, lateralYd: -1.4, priority: 6 },
      { slot: "W", side: "L", depthYd: 4.6, lateralYd: -4.6, priority: 7 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -19, priority: 8 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 19, priority: 9 },
      { slot: "FS", side: "mid", depthYd: 13, lateralYd: -2, priority: 10 },
      { slot: "SS", side: "R", depthYd: 9, lateralYd: 8, priority: 11 },
    ],
  },
  {
    id: "bear-46",
    name: "Bear 46",
    aliases: ["46", "Bear", "Double Eagle"],
    variantScope: ["11man"],
    tags: ["four-down", "bear", "run-stopper", "pressure"],
    spots: [
      { slot: "E", technique: "5", over: "T", side: "L", depthYd: 0.9, priority: 1 },
      { slot: "T", technique: "3", over: "G", side: "L", depthYd: 0.9, priority: 2 },
      { slot: "N", technique: "0", over: "C", side: "mid", depthYd: 0.9, priority: 3 },
      { slot: "T2", technique: "3", over: "G", side: "R", depthYd: 0.9, priority: 4 },
      { slot: "E2", technique: "5", over: "T", side: "R", depthYd: 0.9, priority: 5 },
      { slot: "S", technique: "9", over: "TE", side: "R", depthYd: 1.6, lateralYd: 1.4, priority: 6 },
      { slot: "M", side: "mid", depthYd: 4.6, lateralYd: 0.4, priority: 7 },
      { slot: "W", side: "L", depthYd: 4.6, lateralYd: -3.6, priority: 8 },
      { slot: "C", side: "L", depthYd: 6, lateralYd: -19, priority: 9 },
      { slot: "C2", side: "R", depthYd: 6, lateralYd: 19, priority: 10 },
      { slot: "FS", side: "mid", depthYd: 12, lateralYd: -2, priority: 11 },
    ],
  },
  {
    id: "even-4-4",
    name: "4-4 Even",
    aliases: ["4-4", "Eight Man Box", "Base 44"],
    variantScope: ["11man"],
    tags: ["four-down", "eight-in-the-box", "run-front", "youth"],
    spots: [
      { slot: "E", technique: "5", over: "T", side: "L", depthYd: 0.9, priority: 1 },
      { slot: "T", technique: "2", over: "G", side: "L", depthYd: 0.9, priority: 2 },
      { slot: "T2", technique: "2", over: "G", side: "R", depthYd: 0.9, priority: 3 },
      { slot: "E2", technique: "5", over: "T", side: "R", depthYd: 0.9, priority: 4 },
      { slot: "W", side: "L", depthYd: 4.4, lateralYd: -2.4, priority: 5 },
      { slot: "M", side: "mid", depthYd: 4.4, lateralYd: 2.4, priority: 6 },
      { slot: "S", side: "R", depthYd: 4.2, lateralYd: 7.2, priority: 7 },
      { slot: "$", side: "L", depthYd: 4.2, lateralYd: -7.2, priority: 8 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -18, priority: 9 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 18, priority: 10 },
      { slot: "FS", side: "mid", depthYd: 12, lateralYd: 0, priority: 11 },
    ],
  },
  {
    id: "dime-4-1-6",
    name: "4-1-6 Dime",
    aliases: ["Dime", "Six DB", "4-1-6"],
    variantScope: ["11man"],
    tags: ["four-down", "dime", "obvious-pass", "coverage"],
    spots: [
      { slot: "E", technique: "5", over: "T", side: "L", depthYd: 0.9, priority: 1 },
      { slot: "T", technique: "3", over: "G", side: "L", depthYd: 0.9, priority: 2 },
      { slot: "N", technique: "3", over: "G", side: "R", depthYd: 0.9, priority: 3 },
      { slot: "E2", technique: "5", over: "T", side: "R", depthYd: 0.9, priority: 4 },
      { slot: "M", side: "mid", depthYd: 5.0, lateralYd: 0, priority: 5 },
      { slot: "$", side: "R", depthYd: 5.2, lateralYd: 6.4, priority: 6 },
      { slot: "W", side: "L", depthYd: 5.2, lateralYd: -6.4, priority: 7 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -19, priority: 8 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 19, priority: 9 },
      { slot: "FS", side: "L", depthYd: 13, lateralYd: -6, priority: 10 },
      { slot: "SS", side: "R", depthYd: 13, lateralYd: 6, priority: 11 },
    ],
  },
  {
    id: "wide-9",
    name: "Wide 9",
    aliases: ["Nascar", "Wide Nine", "Speed Front"],
    variantScope: ["11man"],
    tags: ["four-down", "pass-rush", "edge", "third-down"],
    spots: [
      { slot: "E", technique: "9", over: "TE", side: "L", depthYd: 1.1, lateralYd: -1.6, priority: 1 },
      { slot: "T", technique: "3", over: "G", side: "L", depthYd: 0.9, priority: 2 },
      { slot: "N", technique: "2i", over: "G", side: "R", depthYd: 0.9, priority: 3 },
      { slot: "E2", technique: "9", over: "TE", side: "R", depthYd: 1.1, lateralYd: 1.6, priority: 4 },
      { slot: "M", side: "mid", depthYd: 4.8, lateralYd: -1.0, priority: 5 },
      { slot: "S", side: "R", depthYd: 4.8, lateralYd: 4.0, priority: 6 },
      { slot: "$", side: "R", depthYd: 5.4, lateralYd: 9.0, priority: 7 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -19, priority: 8 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 19, priority: 9 },
      { slot: "FS", side: "L", depthYd: 13, lateralYd: -6, priority: 10 },
      { slot: "SS", side: "R", depthYd: 13, lateralYd: 6, priority: 11 },
    ],
  },
  {
    id: "seven-2-2-3",
    name: "2-2-3",
    aliases: ["7v7 Cloud", "2-2-3"],
    variantScope: ["7man"],
    tags: ["7v7", "coverage", "two-under"],
    spots: [
      { slot: "E", side: "L", depthYd: 1.0, lateralYd: -2.2, priority: 1 },
      { slot: "E2", side: "R", depthYd: 1.0, lateralYd: 2.2, priority: 2 },
      { slot: "W", side: "L", depthYd: 4.4, lateralYd: -6.0, priority: 3 },
      { slot: "S", side: "R", depthYd: 4.4, lateralYd: 6.0, priority: 4 },
      { slot: "C", side: "L", depthYd: 7, lateralYd: -13, priority: 5 },
      { slot: "C2", side: "R", depthYd: 7, lateralYd: 13, priority: 6 },
      { slot: "FS", side: "mid", depthYd: 12, lateralYd: 0, priority: 7 },
    ],
  },
  {
    id: "flag-2-rush",
    name: "Double Rush",
    aliases: ["2 Rush", "Two Rushers", "Flag Pressure"],
    variantScope: ["5flag"],
    tags: ["flag", "pressure", "two-rushers"],
    spots: [
      { slot: "R", side: "L", depthYd: 7, lateralYd: -1.8, priority: 1 },
      { slot: "M", side: "R", depthYd: 7, lateralYd: 1.8, priority: 2 },
      { slot: "C", side: "L", depthYd: 4, lateralYd: -8, priority: 3 },
      { slot: "C2", side: "R", depthYd: 4, lateralYd: 8, priority: 4 },
      { slot: "FS", side: "mid", depthYd: 10, lateralYd: 0, priority: 5 },
    ],
  },
  {
    id: "flag-press",
    name: "Press Bail",
    aliases: ["Flag Press", "Press Man", "Bump"],
    variantScope: ["5flag"],
    tags: ["flag", "press", "man", "one-rusher"],
    spots: [
      { slot: "R", side: "mid", depthYd: 7, lateralYd: 0, priority: 1 },
      { slot: "C", side: "L", depthYd: 1.4, lateralYd: -8, priority: 2 },
      { slot: "C2", side: "R", depthYd: 1.4, lateralYd: 8, priority: 3 },
      { slot: "M", side: "R", depthYd: 1.6, lateralYd: 3.2, priority: 4 },
      { slot: "FS", side: "mid", depthYd: 11, lateralYd: 0, priority: 5 },
    ],
  },
];

const FRONT_BY_ID = new Map(FRONTS.map((f) => [f.id, f]));
export function frontById(id: string): DefensiveFront | undefined {
  return FRONT_BY_ID.get(id);
}

// ─── coverages ──────────────────────────────────────────────────────────────

/** Shorthand for a coverage zone. Ids are derived so they cannot collide. */
const Z = (
  name: ZoneLandmark,
  side: "L" | "R" | "mid",
  ownerSlot: string,
  label?: string,
): Zone => ({
  id: `${ownerSlot}-${name}-${side}`,
  shape: "ellipse",
  landmark: name,
  side,
  ownerSlot,
  label,
});

export const COVERAGES: Coverage[] = [
  {
    id: "cover-0",
    name: "Cover 0",
    deepDefenders: 0,
    kind: "man",
    aliases: ["Zero", "All Out", "Man Free-less"],
    variantScope: ["11man", "7man", "5flag"],
    tags: ["man", "pressure", "blitz"],
    manAssignments: { C: 1, C2: 1, $: 2, SS: 2, FS: 3, M: "back" },
    notes: "Pure man, no help. Everyone not covering is coming.",
  },
  {
    id: "cover-1",
    name: "Cover 1",
    deepDefenders: 1,
    kind: "man",
    aliases: ["Man Free", "1 Robber", "1 Rat"],
    variantScope: ["11man", "7man", "5flag"],
    tags: ["man", "single-high"],
    manAssignments: { C: 1, C2: 1, $: 2, SS: 2, M: "back" },
    zones: [Z("deep-middle", "mid", "FS", "Deep middle")],
    notes: "Man across, free safety in the deep middle, often a rat in the hole.",
  },
  {
    id: "cover-2",
    name: "Cover 2",
    deepDefenders: 2,
    kind: "zone",
    aliases: ["Two Deep", "Cover 2 Zone"],
    variantScope: ["11man", "7man", "5flag"],
    tags: ["zone", "two-high", "squat-corners"],
    zones: [
      Z("deep-half", "L", "FS", "Deep half"),
      Z("deep-half", "R", "SS", "Deep half"),
      Z("flat", "L", "C", "Flat"),
      Z("flat", "R", "C2", "Flat"),
      Z("hook-curl", "L", "W", "Hook/curl"),
      Z("hook-curl", "R", "S", "Hook/curl"),
      Z("middle-hook", "mid", "M", "Middle hook"),
    ],
    notes: "Two deep halves over five underneath. Corners squat in the flat.",
  },
  {
    id: "tampa-2",
    name: "Tampa 2",
    deepDefenders: 2,
    kind: "zone",
    aliases: ["Tampa", "2 Runner"],
    variantScope: ["11man"],
    tags: ["zone", "two-high", "seam-answer"],
    zones: [
      Z("deep-half", "L", "FS", "Deep half"),
      Z("deep-half", "R", "SS", "Deep half"),
      Z("deep-middle", "mid", "M", "Deep hole"),
      Z("flat", "L", "C", "Flat"),
      Z("flat", "R", "C2", "Flat"),
      Z("curl", "L", "W", "Curl"),
      Z("curl", "R", "S", "Curl"),
    ],
    notes: "Cover 2 with the Mike running the deep middle hole to about twenty.",
  },
  {
    id: "cover-2-man",
    name: "2 Man",
    deepDefenders: 2,
    kind: "man",
    aliases: ["Cover 5", "Two Man Under", "2 Man"],
    variantScope: ["11man", "7man"],
    tags: ["man", "two-high", "trail-technique"],
    manAssignments: { C: 1, C2: 1, W: 2, S: 2, M: "back" },
    zones: [Z("deep-half", "L", "FS", "Deep half"), Z("deep-half", "R", "SS", "Deep half")],
    notes: "Man underneath with two-deep help. Trail technique everywhere.",
  },
  {
    id: "cover-3",
    name: "Cover 3",
    deepDefenders: 3,
    kind: "zone",
    aliases: ["Three Deep", "Sky", "Cover 3 Buzz"],
    variantScope: ["11man", "7man", "5flag"],
    tags: ["zone", "single-high", "run-support"],
    zones: [
      Z("deep-third", "L", "C", "Deep third"),
      Z("deep-third", "R", "C2", "Deep third"),
      Z("deep-middle", "mid", "FS", "Deep middle"),
      Z("curl-flat", "L", "W", "Curl/flat"),
      Z("curl-flat", "R", "SS", "Curl/flat"),
      Z("hook", "L", "M", "Hook"),
      Z("hook", "R", "S", "Hook"),
    ],
    notes: "Three deep, four under. The extra defender shows up in the run fit.",
  },
  {
    id: "cover-4",
    name: "Quarters",
    deepDefenders: 4,
    kind: "match",
    aliases: ["Cover 4", "Quarters", "Match Quarters"],
    variantScope: ["11man", "7man"],
    tags: ["zone", "match", "two-high", "pattern-read"],
    zones: [
      Z("deep-quarter", "L", "C", "Quarter"),
      Z("deep-quarter", "R", "C2", "Quarter"),
      Z("deep-quarter", "mid", "FS", "Quarter"),
      Z("seam-curl-flat", "L", "W", "SCF"),
      Z("seam-curl-flat", "R", "S", "SCF"),
      Z("middle-hook", "mid", "M", "Middle hook"),
    ],
    notes: "Four deep quarters over three under, played as a pattern match.",
  },
  {
    id: "cover-6",
    name: "Cover 6",
    deepDefenders: 3,
    kind: "split-field",
    aliases: ["Quarter Quarter Half", "6", "Split Field"],
    variantScope: ["11man"],
    tags: ["zone", "split-field", "boundary"],
    zones: [
      Z("deep-quarter", "R", "C2", "Quarter"),
      Z("deep-quarter", "R", "SS", "Quarter"),
      Z("deep-half", "L", "FS", "Half"),
      Z("flat", "L", "C", "Flat"),
      Z("curl-flat", "R", "S", "Curl/flat"),
      Z("middle-hook", "mid", "M", "Middle hook"),
    ],
    notes: "Quarters to the field, Cover 2 to the boundary. Four plus two is six.",
  },
  {
    id: "palms",
    name: "Palms",
    deepDefenders: 2,
    kind: "zone",
    aliases: ["2 Read", "Cover 2 Read", "Trap"],
    variantScope: ["11man", "7man"],
    tags: ["zone", "two-high", "match", "quick-game-answer"],
    zones: [
      Z("deep-half", "L", "FS", "Deep half"),
      Z("deep-half", "R", "SS", "Deep half"),
      Z("flat", "L", "C", "Trap #2"),
      Z("flat", "R", "C2", "Trap #2"),
      Z("hook-curl", "L", "W", "Hook/curl"),
      Z("hook-curl", "R", "S", "Hook/curl"),
      Z("middle-hook", "mid", "M", "Middle hook"),
    ],
    notes: "Quarters rules until number two goes to the flat, then the corner traps him and the safety takes number one.",
  },
  {
    id: "cover-3-cloud",
    name: "Cover 3 Cloud",
    deepDefenders: 3,
    kind: "zone",
    aliases: ["Cloud", "3 Cloud", "Corner Roll"],
    variantScope: ["11man", "7man"],
    tags: ["zone", "single-high", "boundary", "flat-support"],
    zones: [
      Z("flat", "L", "C", "Cloud flat"),
      Z("deep-third", "L", "FS", "Deep third"),
      Z("deep-third", "R", "C2", "Deep third"),
      Z("deep-middle", "mid", "SS", "Deep middle"),
      Z("curl-flat", "R", "S", "Curl/flat"),
      Z("hook", "L", "W", "Hook"),
      Z("hook", "R", "M", "Hook"),
    ],
    notes: "The corner squats in the flat to one side and a safety rotates over the top of him.",
  },
  {
    id: "cover-3-buzz",
    name: "Cover 3 Buzz",
    deepDefenders: 3,
    kind: "zone",
    aliases: ["Buzz", "3 Buzz", "Safety Buzz"],
    variantScope: ["11man"],
    tags: ["zone", "single-high", "run-support", "disguise"],
    zones: [
      Z("deep-third", "L", "C", "Deep third"),
      Z("deep-third", "R", "C2", "Deep third"),
      Z("deep-middle", "mid", "FS", "Deep middle"),
      Z("hook-curl", "R", "SS", "Buzz hook"),
      Z("curl-flat", "L", "W", "Curl/flat"),
      Z("curl-flat", "R", "S", "Curl/flat"),
      Z("middle-hook", "mid", "M", "Middle hook"),
    ],
    notes: "Two-high shell that rolls late. The strong safety buzzes down to a hook and the free safety takes the middle third.",
  },
  {
    id: "cover-4-robber",
    name: "Quarters Robber",
    deepDefenders: 3,
    kind: "zone",
    aliases: ["Robber", "Quarters Rat", "4 Read"],
    variantScope: ["11man"],
    tags: ["zone", "match", "robber", "dig-answer"],
    zones: [
      Z("deep-quarter", "L", "FS", "Deep quarter"),
      Z("deep-quarter", "R", "C2", "Deep quarter"),
      Z("robber", "mid", "SS", "Robber"),
      Z("flat", "L", "C", "Flat"),
      Z("curl-flat", "R", "S", "Curl/flat"),
      Z("hook", "L", "W", "Hook"),
      Z("middle-hook", "mid", "M", "Middle hook"),
    ],
    notes: "Quarters with a safety sitting at ten in the middle of the field, hunting the dig and the crosser.",
  },
  {
    id: "cover-1-bracket",
    name: "Cover 1 Bracket",
    deepDefenders: 1,
    kind: "man",
    aliases: ["Double X", "Bracket", "Man Free Double"],
    variantScope: ["11man", "7man"],
    tags: ["man", "single-high", "bracket", "take-away-one"],
    manAssignments: { C: 1, C2: 1, $: 2, SS: 2, M: "back" },
    zones: [Z("deep-middle", "mid", "FS", "Deep middle"), Z("robber", "L", "W", "Bracket under #1")],
    notes: "Man everywhere with two defenders on the best receiver, one over the top and one underneath.",
  },
  {
    id: "flag-cover-2",
    name: "Flag Cover 2",
    deepDefenders: 2,
    kind: "zone",
    aliases: ["Two Deep Flag", "Split Safety"],
    variantScope: ["5flag"],
    tags: ["flag", "zone", "two-high", "deep-ball-answer"],
    zones: [
      Z("deep-half", "L", "C", "Deep half"),
      Z("deep-half", "R", "C2", "Deep half"),
      Z("middle-hook", "mid", "M", "Middle hook"),
      Z("flat", "L", "FS", "Flat"),
    ],
    notes: "Two deep halves in a thirty-yard width leaves almost nothing over the top and a great deal underneath.",
  },
];

const COVERAGE_BY_ID = new Map(COVERAGES.map((c) => [c.id, c]));
export function coverageById(id: string): Coverage | undefined {
  return COVERAGE_BY_ID.get(id);
}

// ─── pressures ──────────────────────────────────────────────────────────────

export const PRESSURES: Pressure[] = [
  {
    id: "fire-zone-sam",
    name: "Fire Zone Sam",
    blitzers: { S: "playside-B", E2: "playside-A" },
    coverageId: "cover-3",
    aliases: ["Sam Fire", "Zone Blitz Strong"],
    tags: ["five-man", "zone-blitz", "three-under-three-deep"],
  },
  {
    id: "double-a-mug",
    name: "Double A Mug",
    blitzers: { M: "playside-A", W: "backside-A" },
    coverageId: "cover-1",
    aliases: ["Mugged A Gaps", "Double A"],
    tags: ["six-man", "interior", "man-free"],
  },
  {
    id: "nickel-fire",
    name: "Nickel Fire",
    blitzers: { $: "playside-C" },
    coverageId: "cover-1",
    aliases: ["Star Blitz", "Nickel Edge"],
    tags: ["five-man", "edge", "slot-pressure"],
  },
  {
    id: "safety-green-dog",
    name: "Safety Green Dog",
    blitzers: { SS: "playside-B" },
    coverageId: "cover-3",
    aliases: ["SS Blitz", "Strong Safety Fire"],
    tags: ["five-man", "delayed", "disguise"],
  },
  {
    id: "cover-0-max",
    name: "Cover 0 Max",
    blitzers: { M: "playside-A", W: "backside-A", S: "playside-C" },
    coverageId: "cover-0",
    aliases: ["All Out", "Zero Blitz"],
    tags: ["seven-man", "all-out", "no-help"],
  },
  {
    id: "flag-corner-fire",
    name: "Corner Fire",
    blitzers: { C2: "playside-C" },
    coverageId: "cover-1",
    aliases: ["Flag Corner Blitz", "Edge Rush"],
    tags: ["flag", "edge", "one-rusher"],
  },
  {
    id: "cross-dog",
    name: "Cross Dog",
    blitzers: { M: "backside-A", W: "playside-A" },
    coverageId: "cover-1",
    aliases: ["X Blitz", "Cross Fire", "Mike Will Cross"],
    tags: ["six-man", "interior", "man-free", "crossing-rushers"],
  },
  {
    id: "double-edge-fire",
    name: "Double Edge",
    blitzers: { S: "playside-D", W: "backside-D" },
    coverageId: "cover-3",
    aliases: ["Both Edges", "Double Fire"],
    tags: ["six-man", "edge", "contain-pressure"],
  },
  {
    id: "corner-cat",
    name: "Corner Cat",
    blitzers: { C2: "playside-D" },
    coverageId: "cover-3-cloud",
    aliases: ["Corner Blitz", "Cat", "Boundary Fire"],
    tags: ["five-man", "corner", "disguise", "boundary"],
  },
  {
    id: "weak-fire-zone",
    name: "Fire Zone Will",
    blitzers: { W: "backside-B", E: "backside-A" },
    coverageId: "cover-3",
    aliases: ["Will Fire", "Zone Blitz Weak"],
    tags: ["five-man", "zone-blitz", "backside", "three-under-three-deep"],
  },
  {
    id: "nickel-double",
    name: "Nickel Double",
    blitzers: { $: "playside-C", M: "playside-A" },
    coverageId: "cover-0",
    aliases: ["Star Mike", "Double Nickel"],
    tags: ["six-man", "slot-pressure", "no-help", "third-down"],
  },
  {
    id: "bear-mug",
    name: "Bear Mug",
    blitzers: { M: "playside-A", S: "playside-C" },
    coverageId: "cover-1",
    aliases: ["46 Mug", "Bear Pressure"],
    tags: ["six-man", "bear-front", "interior", "short-yardage"],
  },
  {
    id: "flag-double-rush",
    name: "Flag Double Rush",
    blitzers: { R: "playside-B", M: "backside-B" },
    coverageId: "cover-0",
    aliases: ["Two Rush", "Double Fire Flag"],
    tags: ["flag", "two-rushers", "no-help", "gamble"],
  },
  {
    id: "flag-safety-fire",
    name: "Flag Safety Fire",
    blitzers: { FS: "playside-C" },
    coverageId: "cover-3",
    aliases: ["Safety Rush", "Delayed Flag Blitz"],
    tags: ["flag", "delayed", "disguise", "one-rusher"],
  },
];

const PRESSURE_BY_ID = new Map(PRESSURES.map((p) => [p.id, p]));
export function pressureById(id: string): Pressure | undefined {
  return PRESSURE_BY_ID.get(id);
}

// ─── resolution ─────────────────────────────────────────────────────────────

/** Where the offensive lineman a technique is measured against sits. */
function anchorX(over: "C" | "G" | "T" | "TE", side: 1 | -1, v: ReturnType<typeof variantOf>): number {
  const s = v.line.splitYd;
  switch (over) {
    case "C": return 0;
    case "G": return side * s;
    case "T": return side * s * 2;
    case "TE": return side * (s * 2 + 1.6 * v.widthScale);
  }
}

export function resolveFront(
  front: DefensiveFront,
  variantId: FieldVariantId,
  flip: boolean,
): { players: ResolvedPlayer[]; omitted: string[] } {
  const v = variantOf(variantId);
  const budget = v.playersPerSide;
  const spots = [...front.spots].sort((a, b) => a.priority - b.priority);
  const kept = spots.slice(0, budget);
  const omitted = spots.slice(budget).map((s) => s.slot);

  const players: ResolvedPlayer[] = kept.map((s) => {
    const sgn: 1 | -1 = s.side === "mid" ? 1 : sideSign(s.side);
    const x =
      s.technique !== undefined
        ? anchorX(techniqueAnchorSlot(s.technique), sgn, v) + sgn * techniqueOffset(s.technique, v)
        : (s.lateralYd ?? 0) * v.widthScale;
    const at: Vec = { x: flip ? -x : x, y: s.depthYd * v.depthScale };
    return {
      slot: s.slot,
      label: s.slot.replace(/2$/, ""),
      at,
      glyph: "diamond",
      role: "defender",
      isPrimary: false,
    };
  });

  return { players, omitted };
}

export function resolveCoverage(
  coverage: Coverage,
  variantId: FieldVariantId,
  flip: boolean,
): ResolvedZone[] {
  const v = variantOf(variantId);
  return (coverage.zones ?? []).map((z) => {
    const side = z.side ?? "mid";
    const l = landmark(z.landmark, flip && side !== "mid" ? (side === "L" ? "R" : "L") : side, v, z.depthYd);
    return {
      id: z.id,
      cx: l.cx,
      cy: l.cy,
      rx: l.rx,
      ry: l.ry,
      label: z.label,
      ownerSlot: z.ownerSlot,
    };
  });
}

export function resolvePressure(
  pressure: Pressure,
  players: ResolvedPlayer[],
  variantId: FieldVariantId,
  flip: boolean,
): ResolvedPath[] {
  const v = variantOf(variantId);
  const sign: 1 | -1 = flip ? -1 : 1;
  const byId = new Map(players.map((p) => [p.slot, p]));
  const out: ResolvedPath[] = [];

  for (const [slot, gap] of Object.entries(pressure.blitzers) as [string, GapId][]) {
    const p = byId.get(slot);
    if (!p) continue;
    const target = gapAnchor(gap, sign, v, 1);
    out.push({
      slot,
      points: [p.at, { x: (p.at.x + target.x) / 2, y: (p.at.y + target.y) / 2 }, target],
      curve: "polyline",
      style: "solid",
      cap: "arrow",
      corner: "sharp",
      branches: [],
      startDelayMs: 0,
      durationMs: 700,
      priorityOrder: 1,
      role: "blitz",
      phase: "post-snap",
    });
  }

  return out;
}

/**
 * Man-coverage lines. Drawn to the assigned receiver and capped with a BAR,
 * never an arrow: an arrow means "go there", a bar means "him".
 */
export function resolveManCoverage(
  coverage: Coverage,
  defenders: ResolvedPlayer[],
  receivers: ResolvedPlayer[],
): ResolvedPath[] {
  if (!coverage.manAssignments) return [];
  const byId = new Map(defenders.map((p) => [p.slot, p]));

  // Receivers are numbered from the sideline in, per the coaching convention.
  const left = receivers.filter((r) => r.at.x < 0).sort((a, b) => a.at.x - b.at.x);
  const right = receivers.filter((r) => r.at.x >= 0).sort((a, b) => b.at.x - a.at.x);

  const out: ResolvedPath[] = [];
  for (const [slot, target] of Object.entries(coverage.manAssignments)) {
    const d = byId.get(slot);
    if (!d) continue;
    const pool = d.at.x < 0 ? left : right;
    const r = typeof target === "number" ? pool[target - 1] : undefined;
    if (!r) continue;
    out.push({
      slot,
      points: [d.at, r.at],
      curve: "polyline",
      style: "dashed",
      cap: "tbar",
      corner: "sharp",
      branches: [],
      startDelayMs: 0,
      durationMs: 600,
      priorityOrder: 50,
      role: "man",
      phase: "post-snap",
    });
  }
  return out;
}

export function frontsFor(v: FieldVariantId): DefensiveFront[] {
  return FRONTS.filter((f) => f.variantScope.includes(v));
}

export function coveragesFor(v: FieldVariantId): Coverage[] {
  return COVERAGES.filter((c) => c.variantScope.includes(v));
}
