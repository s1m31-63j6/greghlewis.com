/** Two proof plays. If these resolve correctly the vocabulary is correct. */

import type { PlaySpec } from "../../../../src/lib/playbook/types.ts";
import { block, carry, opt, pass, play, route } from "../kit.ts";

export const PROOF: PlaySpec[] = [
  play({
    id: "ar-92-mesh",
    name: "92 Mesh",
    aliases: ["Mesh", "92"],
    philosophy: "air-raid",
    family: "pass",
    variantScope: ["11man", "7man"],
    formationId: "gun-doubles-right",
    personnelId: "10",
    protection: "slide-right",
    concept: "mesh",
    primary: "Z",
    reads: [
      {
        order: 1,
        type: "progression",
        key: "flat-defender",
        keySide: "playside",
        progression: ["Z", "Y", "H", "RB"],
      },
    ],
    assignments: {
      QB: pass("gun-3"),
      Z: route("corner", { depth: 10 }, { priorityOrder: 1 }),
      Y: opt(
        "shallow",
        "man-or-zone",
        [
          { when: "zone", route: "shallow", mods: { settleYd: 2 } },
          { when: "man", route: "shallow" },
        ],
        { toSide: "L", meshWith: "H", meshDepthYd: 5, lane: "over" },
      ),
      H: opt(
        "shallow",
        "man-or-zone",
        [
          { when: "zone", route: "shallow", mods: { settleYd: 2 } },
          { when: "man", route: "shallow" },
        ],
        { toSide: "R", meshWith: "Y", meshDepthYd: 5, lane: "under" },
      ),
      X: route("dig", { depth: 12 }, { priorityOrder: 3 }),
      RB: route("swing", { toSide: "R" }, { startDelayMs: 250, priorityOrder: 4 }),
    },
    tags: ["mesh", "rub", "man-beater", "quick-game"],
    situations: ["1st-down", "3rd-medium", "red-zone", "blitz-beater", "vs-man"],
    coaching: {
      keys: "Corner first against single high. If the flat defender widens, the shallows sit down.",
      vsCoverage: "Cover 1, run through the mesh. Cover 3, sit at five or six between the hooks.",
      commentary: "The whole offense in one play: two shallows rubbing, a corner over the top, a swing to the field.",
    },
  }),
  play({
    id: "gap-power-right",
    name: "Power Right",
    aliases: ["Power O", "34 Power"],
    philosophy: "power-gap",
    family: "run",
    variantScope: ["11man"],
    formationId: "i-pro-right",
    personnelId: "21",
    run: { scheme: "power", carrier: "RB", aim: "playside-B" },
    primary: "RB",
    assignments: {
      QB: pass("1step", "RB"),
      RB: carry("playside-B", "downhill", "playside-A"),
      FB: block({ block: "kickout", target: "EMLOS" }),
      Y: block({ block: "down" }),
      X: route("stalk"),
      Z: route("stalk"),
    },
    tags: ["gap", "downhill", "double-team", "backside-pull"],
    situations: ["short-yardage", "goal-line", "1st-down", "4th-short"],
    coaching: {
      install: "Down, down, back. The fullback kicks the end, the backside guard wraps to the playside backer.",
      commentary: "If the end squeezes, the fullback logs him and the back bounces.",
    },
  }),
];
