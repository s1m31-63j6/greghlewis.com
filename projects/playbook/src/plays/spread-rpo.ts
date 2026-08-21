/**
 * Spread and RPO.
 *
 * An RPO carries a run scheme AND a route concept simultaneously, plus a named
 * read key with two outcomes. That is the shape most playbook tools cannot
 * represent — they force you to draw two plays and remember they are one — and
 * it is the reason `PlaySpec` holds `run` and `assignments` and `reads` side by
 * side rather than making them alternatives.
 *
 * Pre-snap RPOs read a count or a leverage before the ball moves; post-snap
 * RPOs read a second-level defender after the mesh. The distinction is stored
 * on the read, not implied by the tags.
 */

import type { PlaySpec } from "../../../../src/lib/playbook/types.ts";
import { block, carry, pass, play, route } from "../kit.ts";

const SPREAD = ["11man"] as const;

export const SPREAD_RPO: PlaySpec[] = [
  play({
    id: "rpo-iz-bubble",
    name: "Inside Zone / Bubble",
    aliases: ["IZ Bubble", "Zone Bubble", "Bubble RPO"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-trips-right",
    personnelId: "11",
    run: { scheme: "inside-zone", carrier: "RB", aim: "playside-A" },
    primary: "RB",
    reads: [
      { order: 1, type: "rpo-pre", key: "apex", keySide: "playside", ifTake: { give: "RB" }, ifNot: { throw: "H" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-A", "stretch"),
      H: route("bubble", { toSide: "R" }, { priorityOrder: 1 }),
      Y: route("stalk"),
      Z: route("stalk"),
      X: route("slant"),
    },
    tags: ["rpo", "bubble", "pre-snap", "numbers", "conflict"],
    situations: ["1st-down", "2nd-short", "vs-zone", "opening-script"],
    coaching: {
      keys: "Count the box before the snap. Six defenders on six blockers means hand it off; seven means throw it.",
      commentary: "The entry-level RPO, and still the one that gets the most yards for the least risk.",
    },
  }),

  play({
    id: "rpo-iz-glance",
    name: "Inside Zone / Glance",
    aliases: ["IZ Glance", "Glance RPO", "Skinny Post RPO"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-doubles-right",
    personnelId: "11",
    run: { scheme: "inside-zone", carrier: "RB", aim: "playside-A" },
    primary: "RB",
    reads: [
      { order: 1, type: "rpo-post", key: "SS", keySide: "backside", ifTake: { give: "RB" }, ifNot: { throw: "X" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-A", "downhill"),
      X: route("glance", undefined, { priorityOrder: 1 }),
      Z: route("stalk"),
      Y: route("stalk"),
      H: route("stalk"),
    },
    tags: ["rpo", "glance", "post-snap", "backside", "safety-read"],
    situations: ["1st-down", "2nd-short", "vs-cover-3", "vs-cover-1", "plus-territory"],
    coaching: {
      keys: "Read the overhang or the down safety. If he fills, the glance is behind him over the linebacker's head.",
    },
  }),

  play({
    id: "rpo-iz-slant",
    name: "Inside Zone / Slant",
    aliases: ["IZ Slant", "Slant RPO"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-twins-right",
    personnelId: "11",
    run: { scheme: "inside-zone", carrier: "RB", aim: "playside-A" },
    primary: "RB",
    reads: [
      { order: 1, type: "rpo-post", key: "OLB", keySide: "playside", ifTake: { give: "RB" }, ifNot: { throw: "H" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-A", "downhill"),
      H: route("slant", undefined, { priorityOrder: 1 }),
      Z: route("stalk"),
      X: route("stalk"),
      Y: route("stalk"),
    },
    tags: ["rpo", "slant", "post-snap", "linebacker-conflict"],
    situations: ["1st-down", "2nd-short", "3rd-short", "vs-man"],
    coaching: { keys: "Punishes a linebacker who triggers downhill on run action. The window is exactly where he left." },
  }),

  play({
    id: "rpo-oz-stick",
    name: "Outside Zone / Stick",
    aliases: ["OZ Stick", "Stick RPO"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-trips-right",
    personnelId: "11",
    run: { scheme: "outside-zone", carrier: "RB", aim: "playside-C" },
    primary: "RB",
    reads: [
      { order: 1, type: "rpo-post", key: "flat-defender", keySide: "playside", ifTake: { give: "RB" }, ifNot: { throw: "Y" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-C", "stretch"),
      Y: route("stick", { depth: 6 }, { priorityOrder: 1 }),
      H: route("flat", { toSide: "R" }, { priorityOrder: 2 }),
      Z: route("stalk"),
      X: route("stalk"),
    },
    tags: ["rpo", "stick", "post-snap", "perimeter"],
    situations: ["1st-down", "3rd-short", "vs-zone"],
    coaching: { keys: "Stretch action holds the edge. If the flat defender chases the run, the stick is uncovered." },
  }),

  play({
    id: "rpo-power-pop",
    name: "Power / Pop Pass",
    aliases: ["Power Pop", "Pop RPO", "Y-Pop"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-doubles-right",
    personnelId: "11",
    run: { scheme: "power", carrier: "RB", aim: "playside-B" },
    primary: "RB",
    reads: [
      { order: 1, type: "rpo-post", key: "MIKE", keySide: "playside", ifTake: { give: "RB" }, ifNot: { throw: "Y" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-B", "downhill"),
      Y: route("seam", { depth: 10 }, { priorityOrder: 1 }),
      H: route("stalk"),
      Z: route("stalk"),
      X: route("stalk"),
    },
    tags: ["rpo", "pop", "power", "seam", "vacated-window"],
    situations: ["1st-down", "3rd-short", "red-zone", "goal-line"],
    coaching: { keys: "Gap-scheme action pulls the linebackers hard. The tight end pops into the space they left." },
  }),

  play({
    id: "rpo-counter-bubble",
    name: "Counter / Bubble",
    aliases: ["Counter Bubble", "GH Bubble"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-trips-right",
    personnelId: "11",
    run: { scheme: "counter", carrier: "RB", aim: "playside-C" },
    primary: "RB",
    reads: [
      { order: 1, type: "rpo-pre", key: "apex", keySide: "playside", ifTake: { give: "RB" }, ifNot: { throw: "H" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-C", "counter-step"),
      H: route("bubble", { toSide: "R" }, { priorityOrder: 1 }),
      Y: route("stalk"),
      Z: route("stalk"),
      X: route("stalk"),
    },
    tags: ["rpo", "counter", "bubble", "misdirection"],
    situations: ["1st-down", "2nd-short", "plus-territory"],
    coaching: { keys: "Gap scheme with a perimeter answer. Same pre-snap count, harder run behind it." },
  }),

  play({
    id: "rpo-zone-read-now",
    name: "Zone Read / Now",
    aliases: ["Read Now", "Triple Option Spread"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-doubles-right",
    personnelId: "10",
    run: { scheme: "inside-zone", carrier: "RB", aim: "playside-A" },
    primary: "RB",
    reads: [
      { order: 1, type: "zone-read", key: "DE", keySide: "backside", ifTake: { keep: "QB" }, ifNot: { give: "RB" } },
      { order: 2, type: "rpo-pre", key: "CB", keySide: "playside", ifTake: { give: "RB" }, ifNot: { throw: "Z" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-A", "downhill"),
      Z: route("hitch", { depth: 5 }, { priorityOrder: 1 }),
      X: route("hitch", { depth: 5 }, { priorityOrder: 2 }),
      Y: route("stalk"),
      H: route("stalk"),
    },
    tags: ["rpo", "zone-read", "now-screen", "triple", "two-reads"],
    situations: ["1st-down", "2nd-short", "vs-zone"],
    coaching: {
      keys: "Two reads on one snap: the corner's cushion before the ball moves, the end after it.",
      commentary: "A genuine three-way option out of the gun, and the whole point of storing two reads on one play.",
    },
  }),

  play({
    id: "rpo-stick-draw",
    name: "Stick Draw",
    aliases: ["Stick Draw", "Draw RPO"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-trips-right",
    personnelId: "11",
    protection: "screen-release",
    run: { scheme: "inside-zone", carrier: "RB", aim: "playside-A" },
    primary: "Y",
    reads: [
      { order: 1, type: "rpo-post", key: "MIKE", ifTake: { give: "RB" }, ifNot: { throw: "Y" } },
    ],
    assignments: {
      QB: pass("gun-quick"),
      RB: carry("playside-A", "dive"),
      Y: route("stick", { depth: 6 }, { priorityOrder: 1 }),
      H: route("flat", { toSide: "R" }, { priorityOrder: 2 }),
      Z: route("go"),
      X: route("slant"),
    },
    tags: ["rpo", "draw", "stick", "inverted", "pass-first"],
    situations: ["3rd-medium", "2nd-long", "vs-zone"],
    coaching: { keys: "The read is inverted: it looks like a pass first and the run is the alternative." },
  }),

  play({
    id: "rpo-jet-sweep",
    name: "Jet Sweep RPO",
    aliases: ["Jet RPO", "Fly RPO"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-doubles-right",
    personnelId: "11",
    run: { scheme: "outside-zone", carrier: "H", aim: "playside-D" },
    primary: "H",
    reads: [
      { order: 1, type: "rpo-pre", key: "OLB", keySide: "playside", ifTake: { throw: "Z" }, ifNot: { give: "H" } },
    ],
    assignments: {
      QB: pass("gun-quick", "H"),
      H: route("bubble", { toSide: "R" }, { priorityOrder: 1 }),
      RB: block({ block: "arc" }),
      Z: route("slant", undefined, { priorityOrder: 2 }),
      X: route("go"),
      Y: route("stalk"),
    },
    tags: ["rpo", "jet", "motion", "perimeter", "tempo"],
    situations: ["1st-down", "opening-script", "vs-zone"],
    coaching: { keys: "Horizontal stress before the snap and vertical stress after it." },
  }),

  play({
    id: "spread-qb-draw",
    name: "QB Draw",
    aliases: ["Draw", "QB Draw", "Q Draw"],
    philosophy: "spread-rpo",
    family: "run",
    variantScope: [...SPREAD],
    formationId: "gun-empty",
    personnelId: "10",
    protection: "big-on-big",
    run: { scheme: "inside-zone", carrier: "QB", aim: "playside-A" },
    primary: "QB",
    assignments: {
      QB: carry("playside-A", "downhill"),
      X: route("go"),
      Z: route("go"),
      Y: route("seam"),
      H: route("seam"),
      F: route("go"),
    },
    tags: ["draw", "qb-run", "empty", "spread-them-out"],
    situations: ["3rd-medium", "3rd-long", "2nd-long", "vs-zone"],
    coaching: { keys: "Five verticals clear the box out. Everything after that is one man to beat." },
  }),

  play({
    id: "spread-hitch-rpo",
    name: "Hitch RPO",
    aliases: ["Now Hitch", "Hitch RPO"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-twins-right",
    personnelId: "11",
    run: { scheme: "inside-zone", carrier: "RB", aim: "playside-A" },
    primary: "RB",
    reads: [
      { order: 1, type: "rpo-pre", key: "CB", keySide: "playside", ifTake: { give: "RB" }, ifNot: { throw: "Z" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-A", "downhill"),
      Z: route("hitch", { depth: 5 }, { priorityOrder: 1 }),
      H: route("stalk"),
      X: route("hitch", { depth: 5 }, { priorityOrder: 2 }),
      Y: route("stalk"),
    },
    tags: ["rpo", "hitch", "pre-snap", "cushion"],
    situations: ["1st-down", "2nd-short", "backed-up", "vs-zone"],
    coaching: { keys: "If the corner is more than seven yards off, take the free five." },
  }),

  play({
    id: "spread-y-cross-peek",
    name: "Y-Cross Peek",
    aliases: ["Peek", "Cross Peek"],
    philosophy: "spread-rpo",
    family: "rpo",
    variantScope: [...SPREAD],
    formationId: "gun-trips-right",
    personnelId: "11",
    run: { scheme: "outside-zone", carrier: "RB", aim: "playside-C" },
    primary: "Y",
    reads: [
      { order: 1, type: "rpo-post", key: "FS", ifTake: { give: "RB" }, ifNot: { throw: "Y" } },
    ],
    assignments: {
      QB: pass("gun-quick", "RB"),
      RB: carry("playside-C", "stretch"),
      Y: route("drag", { toSide: "L", depthAdj: 8 }, { priorityOrder: 1 }),
      Z: route("go"),
      H: route("stalk"),
      X: route("post", { depth: 12 }, { priorityOrder: 2 }),
    },
    tags: ["rpo", "peek", "cross", "shot", "run-first"],
    situations: ["1st-down", "plus-territory", "vs-cover-3"],
    coaching: { keys: "Run call with a downfield peek. If the middle of the field opens, take it; otherwise hand it off." },
  }),
];
