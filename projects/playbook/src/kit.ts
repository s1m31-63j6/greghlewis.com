/**
 * Authoring shorthand. Every play in the library is written against these
 * helpers, so a play reads as football rather than as a JSON literal.
 */

import type {
  Assignment,
  BlockRule,
  GapId,
  PlaySpec,
  RouteId,
  RouteMods,
  SlotId,
} from "../../../src/lib/playbook/types.ts";

export const route = (r: RouteId, mods?: RouteMods, timing?: Assignment extends never ? never : { startDelayMs?: number; speedYps?: number; priorityOrder?: number }): Assignment =>
  ({ kind: "route", route: r, mods, timing });

export const opt = (
  r: RouteId,
  read: "leverage" | "man-or-zone" | "safety-count" | "flat-defender",
  branches: { when: string; route: RouteId; mods?: RouteMods }[],
  mods?: RouteMods,
): Assignment => ({ kind: "route", route: r, mods, option: { read, branches } });

export const block = (rule: BlockRule): Assignment => ({ kind: "block", rule });
export const carry = (
  aim: GapId,
  path?: "downhill" | "stretch" | "counter-step" | "dive",
  press?: GapId,
): Assignment => ({ kind: "carry", aim, press, path });
export const pass = (
  drop: "1step" | "3step" | "5step" | "7step" | "gun-quick" | "gun-3" | "sprint" | "boot",
  fake?: SlotId,
): Assignment => ({ kind: "pass", drop, fake });
export const pitch = (to: SlotId): Assignment => ({ kind: "pitch", to });
export const motion = (
  type: "jet" | "orbit" | "shift" | "across" | "return",
  then: Assignment,
  startMsBeforeSnap = 1400,
  toSide?: "L" | "R",
): Assignment => ({
  kind: "motion",
  motion: { type, toSide, startMsBeforeSnap, atSnap: type === "shift" ? "set" : "moving" },
  then,
});

/** Fills in the fields every play has and almost no play varies. */
export function play(p: Omit<PlaySpec, "aliases" | "annotations" | "reads" | "tags" | "situations" | "coaching" | "side"> &
  Partial<Pick<PlaySpec, "aliases" | "annotations" | "reads" | "tags" | "situations" | "coaching" | "side">>): PlaySpec {
  return {
    aliases: [],
    annotations: [],
    reads: [],
    tags: [],
    situations: [],
    coaching: {},
    side: "offense",
    ...p,
  };
}
