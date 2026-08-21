/**
 * 5-on-5 flag.
 *
 * Not a shrunken version of the eleven-man game. There is no blocking at all,
 * so there is no protection to draw and every non-quarterback is running a
 * route. The centre is a fully eligible receiver the moment he snaps it. The
 * quarterback may not run, so a run play needs a genuine exchange. The rusher
 * starts seven yards back, which is why the pocket holds long enough for a
 * fifteen-yard route to exist at all — and the seven-second clock is why it
 * barely does.
 *
 * NFL FLAG's own playbook warns, repeatedly, to decide which receiver moves
 * first when two paths cross. With five players in a thirty-yard width they
 * cross constantly, which is why every route here carries a priorityOrder and
 * why the animation timeline is the feature rather than the decoration.
 */

import type { PlaySpec } from "../../../../src/lib/playbook/types.ts";
import { carry, motion, opt, pass, play, route } from "../kit.ts";

const FLAG = ["5flag"] as const;

export const FLAG_PLAYS: PlaySpec[] = [
  play({
    id: "flag-curls",
    name: "Curls",
    aliases: ["All Curls", "Sit"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-spread",
    concept: "curl",
    primary: "Z",
    reads: [{ order: 1, type: "progression", key: "CB", progression: ["Z", "X", "H"] }],
    assignments: {
      QB: pass("gun-quick"),
      Z: route("curl", { depth: 10 }, { priorityOrder: 1 }),
      X: route("curl", { depth: 10 }, { priorityOrder: 2 }),
      H: route("hitch", { depth: 6 }, { priorityOrder: 3 }),
    },
    tags: ["curl", "zone-beater", "settle", "beginner-friendly"],
    situations: ["1st-down", "3rd-medium", "vs-zone"],
    coaching: { keys: "Find the soft spot and sit. Do not drift — the quarterback is throwing to where you stopped." },
  }),

  play({
    id: "flag-quick-slants",
    name: "Quick Slants",
    aliases: ["Slants", "Double Slant"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-spread",
    concept: "slant",
    primary: "H",
    reads: [{ order: 1, type: "progression", key: "M", progression: ["H", "Z", "X"] }],
    assignments: {
      QB: pass("gun-quick"),
      H: route("slant", undefined, { priorityOrder: 1 }),
      Z: route("slant", undefined, { priorityOrder: 2 }),
      X: route("slant", undefined, { priorityOrder: 3 }),
    },
    tags: ["slant", "quick", "rush-beater", "timing"],
    situations: ["3rd-short", "blitz-beater", "backed-up", "vs-man"],
    coaching: {
      keys: "Ball out on the second step. This is the answer when the rusher is getting home.",
      commentary: "The single most useful play in a beginner flag playbook.",
    },
  }),

  play({
    id: "flag-mesh",
    name: "Mesh",
    aliases: ["Cross", "Rub"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-spread",
    concept: "mesh",
    primary: "H",
    reads: [{ order: 1, type: "progression", key: "M", progression: ["H", "Z", "X"] }],
    assignments: {
      QB: pass("gun-quick"),
      H: route("shallow", { toSide: "L", meshWith: "X", meshDepthYd: 4, lane: "over" }, { priorityOrder: 1 }),
      X: route("shallow", { toSide: "R", meshWith: "H", meshDepthYd: 4, lane: "under" }, { priorityOrder: 2 }),
      Z: route("corner", { depth: 8 }, { priorityOrder: 3 }),
    },
    tags: ["mesh", "rub", "man-beater", "crossers"],
    situations: ["1st-down", "3rd-medium", "vs-man", "red-zone"],
    coaching: {
      keys: "The over runner goes first. Settle that in practice so nobody hesitates at the mesh point.",
      commentary: "In a thirty-yard width two crossers are almost impossible to cover in man.",
    },
  }),

  play({
    id: "flag-smash",
    name: "Smash",
    aliases: ["Hi-Lo", "Corner Hitch"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-twins",
    concept: "smash",
    primary: "H",
    reads: [{ order: 1, type: "progression", key: "CB", keySide: "playside", progression: ["H", "Z", "RB"] }],
    assignments: {
      QB: pass("gun-quick"),
      Z: route("hitch", { depth: 5 }, { priorityOrder: 2 }),
      H: route("corner", { depth: 9 }, { priorityOrder: 1 }),
      RB: route("flat", { toSide: "L" }, { priorityOrder: 3 }),
    },
    tags: ["smash", "high-low", "corner", "red-zone"],
    situations: ["red-zone", "3rd-medium", "goal-line", "vs-zone"],
    coaching: { keys: "One defender, two receivers, two depths. Throw to whichever one he is not covering." },
  }),

  play({
    id: "flag-triple-verticals",
    name: "Triple Verticals",
    aliases: ["Verts", "Three Go"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-spread",
    concept: "four-verticals",
    primary: "H",
    reads: [{ order: 1, type: "progression", key: "FS", progression: ["H", "Z", "X"] }],
    assignments: {
      QB: pass("gun-3"),
      Z: route("go", { depth: 14 }, { priorityOrder: 2 }),
      X: route("go", { depth: 14 }, { priorityOrder: 3 }),
      H: route("seam", { depth: 14 }, { priorityOrder: 1 }),
    },
    tags: ["verticals", "shot", "seam"],
    situations: ["2nd-long", "must-score", "two-minute", "vs-cover-1"],
    coaching: {
      keys: "Three verticals against three deep defenders is a footrace, and it takes the whole clock.",
      commentary: "Only call it with time on the play clock and a quarterback who can get it there.",
    },
  }),

  play({
    id: "flag-flood",
    name: "Flood",
    aliases: ["Three Level", "Sail"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-trips",
    concept: "flood",
    primary: "H",
    reads: [{ order: 1, type: "progression", key: "CB", keySide: "playside", progression: ["Z", "H", "Y"] }],
    assignments: {
      QB: pass("gun-quick"),
      Z: route("go", { depth: 13 }, { priorityOrder: 1 }),
      H: route("out", { depth: 8 }, { priorityOrder: 2 }),
      Y: route("flat", { toSide: "R" }, { priorityOrder: 3 }),
    },
    tags: ["flood", "three-level", "trips", "zone-beater"],
    situations: ["3rd-medium", "sideline", "vs-zone", "1st-down"],
    coaching: { keys: "Deep, intermediate, shallow, all to one side. Take the open one and get out of bounds." },
  }),

  play({
    id: "flag-high-low",
    name: "High Low",
    aliases: ["Levels", "Stack High Low"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-stack",
    concept: "levels",
    primary: "H",
    reads: [{ order: 1, type: "progression", key: "CB", progression: ["H", "Z", "X"] }],
    assignments: {
      QB: pass("gun-quick"),
      Z: route("go", { depth: 12 }, { priorityOrder: 2 }),
      H: route("out", { depth: 6 }, { priorityOrder: 1 }),
      X: route("dig", { depth: 9 }, { priorityOrder: 3 }),
    },
    tags: ["high-low", "stack", "press-beater", "two-level"],
    situations: ["3rd-medium", "vs-man", "vs-zone"],
    coaching: { keys: "A stack means nobody can press. The two receivers split one defender vertically." },
  }),

  play({
    id: "flag-quick-cross",
    name: "Quick Cross",
    aliases: ["Cross", "Double Cross"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-twins",
    concept: "crossers",
    primary: "H",
    reads: [{ order: 1, type: "progression", key: "M", progression: ["H", "Z", "RB"] }],
    assignments: {
      QB: pass("gun-quick"),
      Z: route("drag", { toSide: "L" }, { priorityOrder: 2 }),
      H: route("drag", { toSide: "L", depthAdj: 2 }, { priorityOrder: 1 }),
      RB: route("swing", { toSide: "R" }, { startDelayMs: 200, priorityOrder: 3 }),
    },
    tags: ["crossers", "rub", "man-beater", "natural-pick"],
    situations: ["3rd-short", "vs-man", "red-zone", "blitz-beater"],
    coaching: {
      keys: "The two crossers create a natural rub. Order matters: the deeper one clears first.",
    },
  }),

  play({
    id: "flag-corner-post",
    name: "Corner Post",
    aliases: ["Double Move", "Corner-Post"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-twins",
    concept: "double-move",
    primary: "Z",
    reads: [{ order: 1, type: "progression", key: "FS", progression: ["Z", "H", "RB"] }],
    assignments: {
      QB: pass("gun-3"),
      Z: route("chair", { depth: 12 }, { priorityOrder: 1 }),
      H: route("out", { depth: 6 }, { priorityOrder: 2 }),
      RB: route("checkdown", undefined, { startDelayMs: 250, priorityOrder: 3 }),
    },
    tags: ["double-move", "shot", "man-beater"],
    situations: ["2nd-long", "plus-territory", "vs-man", "must-score"],
    coaching: { keys: "Sell the corner hard. The safety has to commit before the post breaks back." },
  }),

  play({
    id: "flag-bunch-rub",
    name: "Bunch Rub",
    aliases: ["Bunch", "Triangle", "Pick"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-bunch",
    concept: "snag",
    primary: "Y",
    reads: [{ order: 1, type: "progression", key: "flat-defender", keySide: "playside", progression: ["Y", "Z", "H"] }],
    assignments: {
      QB: pass("gun-quick"),
      Z: route("corner", { depth: 9 }, { priorityOrder: 2 }),
      H: route("hitch", { depth: 5 }, { priorityOrder: 3 }),
      Y: route("arrow", { toSide: "R" }, { priorityOrder: 1 }),
    },
    tags: ["bunch", "rub", "triangle", "man-beater"],
    situations: ["red-zone", "goal-line", "3rd-short", "vs-man"],
    coaching: {
      keys: "Three receivers in a triangle. Against man somebody gets picked without anybody committing one.",
    },
  }),

  play({
    id: "flag-center-screen",
    name: "Center Screen",
    aliases: ["Snapper Screen", "Center Sneak"],
    philosophy: "flag",
    family: "screen",
    variantScope: [...FLAG],
    formationId: "flag-spread",
    concept: "center-release",
    primary: "C",
    reads: [{ order: 1, type: "progression", key: "R", progression: ["C"] }],
    assignments: {
      QB: pass("gun-quick"),
      C: route("checkdown", { toSide: "R" }, { startDelayMs: 350, priorityOrder: 1 }),
      Z: route("go", { depth: 12 }, { priorityOrder: 2 }),
      X: route("go", { depth: 12 }, { priorityOrder: 3 }),
    },
    tags: ["screen", "center", "eligible-snapper", "surprise"],
    situations: ["3rd-short", "blitz-beater", "goal-line"],
    coaching: {
      keys: "The centre is eligible the instant he snaps it. Nobody covers him until you have run this once.",
      commentary: "Free yards in most youth leagues, and it stays free longer than it should.",
    },
  }),

  play({
    id: "flag-hitch-and-go",
    name: "Hitch and Go",
    aliases: ["Sluggo", "Stop and Go"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-spread",
    concept: "double-move",
    primary: "Z",
    reads: [{ order: 1, type: "progression", key: "CB", progression: ["Z", "H", "X"] }],
    assignments: {
      QB: pass("gun-3"),
      Z: route("go", { depth: 13 }, { priorityOrder: 1 }),
      H: route("hitch", { depth: 5 }, { priorityOrder: 2 }),
      X: route("dig", { depth: 8 }, { priorityOrder: 3 }),
    },
    tags: ["double-move", "shot", "sluggo"],
    situations: ["2nd-long", "plus-territory", "vs-man", "must-score"],
    coaching: { commentary: "Run the hitch three times first. The fourth one is a touchdown." },
  }),

  play({
    id: "flag-handoff-sweep",
    name: "Handoff Sweep",
    aliases: ["Sweep", "Jet", "End Around"],
    philosophy: "flag",
    family: "run",
    variantScope: [...FLAG],
    formationId: "flag-twins",
    run: { scheme: "outside-zone", carrier: "H", aim: "playside-D" },
    primary: "H",
    assignments: {
      QB: pass("gun-quick", "H"),
      H: motion("jet", carry("playside-D", "stretch"), 1100, "L"),
      Z: route("stalk"),
      RB: route("flat", { toSide: "R" }),
    },
    tags: ["run", "sweep", "motion", "exchange", "perimeter"],
    situations: ["1st-down", "short-yardage", "opening-script"],
    coaching: {
      keys: "The quarterback cannot run it, so the exchange has to be clean and it has to be behind the line.",
      commentary: "Illegal inside either no-run zone, so check where the ball is spotted before you call it.",
    },
  }),

  play({
    id: "flag-option-stick",
    name: "Option Stick",
    aliases: ["Stick", "Choice"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-trips",
    concept: "stick",
    primary: "H",
    reads: [{ order: 1, type: "progression", key: "flat-defender", keySide: "playside", progression: ["H", "Y", "Z"] }],
    assignments: {
      QB: pass("gun-quick"),
      H: opt("stick", "leverage", [
        { when: "inside leverage", route: "out", mods: { depth: 6 } },
        { when: "outside leverage", route: "dig", mods: { depth: 6 } },
      ], { depth: 6 }),
      Y: route("flat", { toSide: "R" }, { priorityOrder: 2 }),
      Z: route("go", { depth: 12 }, { priorityOrder: 3 }),
    },
    tags: ["stick", "option-route", "leverage", "quick"],
    situations: ["3rd-short", "3rd-medium", "vs-man", "vs-zone"],
    coaching: {
      keys: "The receiver reads leverage and breaks away from it. Quarterback and receiver have to see the same thing.",
    },
  }),

  play({
    id: "flag-wheel",
    name: "Wheel",
    aliases: ["Wheel", "Swing Up"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-i",
    concept: "wheel",
    primary: "FB",
    reads: [{ order: 1, type: "progression", key: "M", progression: ["FB", "Z", "RB"] }],
    assignments: {
      QB: pass("gun-3"),
      FB: route("wheel", { depth: 12 }, { priorityOrder: 1 }),
      Z: route("post", { depth: 10 }, { priorityOrder: 2 }),
      RB: route("flat", { toSide: "L" }, { priorityOrder: 3 }),
    },
    tags: ["wheel", "man-beater", "backfield-release"],
    situations: ["2nd-long", "vs-man", "plus-territory"],
    coaching: { keys: "A defender who has covered a back all game does not expect him to run vertical." },
  }),

  play({
    id: "flag-goal-line-fade",
    name: "Goal Line Fade",
    aliases: ["Fade", "Back Shoulder"],
    philosophy: "flag",
    family: "pass",
    variantScope: [...FLAG],
    formationId: "flag-bunch",
    concept: "fade",
    primary: "Z",
    reads: [{ order: 1, type: "progression", key: "CB", progression: ["Z", "Y", "H"] }],
    assignments: {
      QB: pass("gun-quick"),
      Z: route("go", { depth: 6 }, { priorityOrder: 1 }),
      Y: route("flat", { toSide: "R" }, { priorityOrder: 2 }),
      H: route("slant", undefined, { priorityOrder: 3 }),
    },
    tags: ["fade", "goal-line", "red-zone", "no-run-zone-answer"],
    situations: ["goal-line", "red-zone", "no-run-zone", "vs-man"],
    coaching: {
      keys: "Inside the five you have to throw it anyway. Put it where only your receiver can get it.",
      commentary: "The no-run zone makes the goal line a passing situation by rule, so have three of these.",
    },
  }),
];
