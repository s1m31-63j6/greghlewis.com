/**
 * Turning an engine result back into a sentence.
 *
 * The drive log used to build its text as `action — outcome`, which reads
 * tolerably for your own plays ("pass sideline — first down") and not at all
 * for the other team's ("defend — no play"). Standing on defense you are
 * watching someone else's offense, and the interface has to say what they did.
 *
 * Yardage is recovered from the yardline delta rather than carried around,
 * because the engine already encodes it there and a second copy would be a
 * second thing to keep in sync. When possession changes the delta is
 * meaningless — the frame flips — so those outcomes are described by name only.
 */

import { FG_SNAP_OVERHEAD } from "./engine/engine";
import type { Action, GameState, Outcome } from "./engine/types";

/** Yards gained, or null when the frame flipped and the delta means nothing. */
function gainOf(before: GameState, after: GameState): number | null {
  if (before.offenseIsUser !== after.offenseIsUser) return null;
  if (after.phase !== "play") return null;
  return before.yardline - after.yardline;
}

function yards(n: number): string {
  const abs = Math.abs(n);
  return `${abs} yard${abs === 1 ? "" : "s"}`;
}

/** The play itself, without a subject. */
function phrase(
  action: Action,
  outcome: Outcome | null,
  before: GameState,
  after: GameState,
): string {
  const gain = gainOf(before, after);
  const kick = before.yardline + FG_SNAP_OVERHEAD;

  switch (outcome) {
    case "touchdown":
      return "into the end zone — touchdown";
    case "fg_good":
      return `${kick}-yard field goal, good`;
    case "fg_miss":
      return `${kick}-yard field goal, no good`;
    case "interception":
      return "intercepted";
    case "fumble":
      return "fumbled it away";
    case "safety":
      return "tackled in the end zone — safety";
    case "downs":
      return action === "spike"
        ? "spiked it on fourth down — turnover on downs"
        : "turned it over on downs";
    case "punt":
      return "punted it away";
    case "spike":
      return "spiked it to stop the clock";
    case "kneel":
      return "took a knee";
    case "conversion":
      return action === "two" ? "went for two" : "kicked the extra point";
    case "kickoff":
      return action === "onside" ? "tried an onside kick" : "kicked deep";
    case "incomplete":
      return action === "pass_sideline"
        ? "threw for the sideline, incomplete"
        : "threw it away incomplete";
    case "sack":
      return gain === null ? "was sacked" : `was sacked for ${yards(gain)}`;
    default:
      break;
  }

  // Some actions describe themselves and can arrive without an outcome — a
  // conversion or a kickoff resolved on the offensive side, for instance.
  // Without this, narration falls through and prints the bare action name.
  switch (action) {
    case "kick": return "kicked the extra point";
    case "two": return "went for two";
    case "deep": return "kicked deep";
    case "onside": return "tried an onside kick";
    case "spike": return "spiked it to stop the clock";
    case "kneel": return "took a knee";
    case "timeout": return "called timeout";
    case "defend": return "played it out";
    case "punt": return "punted it away";
    default: break;
  }

  // Everything left is a gain or a first down on a run or a pass.
  const suffix = outcome === "first_down" ? " — first down" : "";
  if (gain === null) return "ran a play";
  if (action === "run") {
    if (gain < 0) return `ran for a loss of ${yards(gain)}${suffix}`;
    if (gain === 0) return `ran for no gain${suffix}`;
    return `ran for ${yards(gain)}${suffix}`;
  }
  if (action === "pass_sideline") return `completed one to the sideline for ${yards(gain)}${suffix}`;
  if (action === "pass") return `completed one for ${yards(gain)}${suffix}`;
  if (action === "field_goal") return `attempted a ${kick}-yard field goal`;
  return `gained ${yards(gain)}${suffix}`;
}

/**
 * A full sentence for one play.
 *
 * `team` is the abbreviation of whoever ran it. Supplying it produces "BUF ran
 * for six yards"; leaving it out produces "Ran for six yards", which is what
 * you want for the player's own calls.
 */
export function narrate(
  action: Action,
  outcome: Outcome | null,
  before: GameState,
  after: GameState,
  team?: string | null,
): string {
  if (action === "timeout" && !outcome) {
    return team ? `${team} called timeout` : "Called timeout";
  }
  if (action === "concede") {
    return team ? `Waved ${team} into the end zone` : "Waved them into the end zone";
  }
  const body = phrase(action, outcome, before, after);
  if (team) return `${team} ${body}`;
  // Without a subject the phrase has to start the sentence, so lift its case.
  return body.charAt(0).toUpperCase() + body.slice(1);
}

/** Short label for a decision, used on buttons and in the review. */
export const ACTION_LABEL: Record<string, string> = {
  run: "run",
  pass: "pass inside",
  pass_sideline: "pass to the sideline",
  field_goal: "field goal",
  punt: "punt",
  spike: "spike",
  kneel: "kneel",
  timeout: "timeout",
  kick: "extra point",
  two: "two-point try",
  deep: "deep kick",
  onside: "onside kick",
  defend: "play it out",
  concede: "let them score",
};
