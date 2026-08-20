"use client";

/**
 * The call sheet.
 *
 * The engine's numbers stay hidden while you decide — showing them answers the
 * question the page is asking. "Show the model" reveals them for anyone who
 * would rather explore than be tested, the same split the chess coach draws
 * between playing and the analysis board.
 *
 * Two things are shown either way. Which option the real coach took, because
 * being able to follow the real game deliberately is half the point of playing
 * a real one — and which option the engine prefers, tagged as optimal. That
 * second tag reveals nothing the panel was keeping back: `evaluate` returns its
 * options already ranked, so the best call has always been sitting at the top
 * of the list. The tag only says out loud what the ordering was implying. On offence that is simply the recorded play. On defence the recorded
 * play belongs to the other team, so the flag keys off whether the real defence
 * spent a timeout before that snap — which on that side of the ball is the
 * decision.
 */

import { FG_SNAP_OVERHEAD } from "./engine/engine";
import { optimal } from "./grade";
import type { Action, Evaluation, GameState } from "./engine/types";
import { realChoiceFor, type RealPlay } from "./scenarios";
import type { Side } from "./useDrill";

interface Props {
  state: GameState;
  side: Side;
  evals: Evaluation[] | null;
  thinking: boolean;
  reveal: boolean;
  onDecide: (a: Action) => void;
  fgProbability: number | null;
  onsideRate: number;
  opponent: string;
  userTeam: string;
  /** The recorded play at this spot, when history still lines up. */
  currentReal: RealPlay | null;
  /** Rendered under the options: take it back, restart. */
  children?: React.ReactNode;
}

function label(
  action: Action,
  state: GameState,
  fgProbability: number | null,
  onsideRate: number,
  opponent: string,
): { title: string; sub: string } {
  switch (action) {
    case "run":
      return { title: "Run it", sub: "clock keeps running after the tackle" };
    case "pass":
      return { title: "Throw it inside", sub: "clock stops only if it falls incomplete" };
    case "pass_sideline":
      return {
        title: "Throw to the sideline",
        sub: "gives up a little accuracy to stop the clock",
      };
    case "field_goal":
      return {
        title: `Field goal · ${state.yardline + FG_SNAP_OVERHEAD} yards`,
        sub:
          fgProbability !== null
            ? `${Math.round(fgProbability * 100)}% from here`
            : "attempt the kick",
      };
    case "punt":
      return { title: "Punt", sub: "hand it over and hope for a stop" };
    case "spike":
      return { title: "Spike it", sub: "stops the clock, costs you a down" };
    case "kneel":
      return { title: "Take a knee", sub: "burns about 39 seconds" };
    case "timeout":
      return {
        title: "Call timeout",
        sub: `${state.offTo} left`,
      };
    case "kick":
      return { title: "Kick the extra point", sub: "94% good" };
    case "two":
      return { title: "Go for two", sub: "48% good" };
    case "deep":
      return { title: "Kick deep", sub: "give up field position, keep the clock" };
    case "onside":
      return {
        title: "Onside kick",
        sub: `${(onsideRate * 100).toFixed(1)}% recovered under the current rules`,
      };
    case "defend":
      return { title: "Play it out", sub: `let ${opponent} run their play` };
    case "concede":
      return {
        title: "Let them score",
        sub: "hands over the points to get the ball back with clock left",
      };
    default:
      return { title: action, sub: "" };
  }
}

export default function DecisionPanel({
  state, side, evals, thinking, reveal, onDecide, fgProbability, onsideRate,
  opponent, userTeam, currentReal, children,
}: Props) {
  const options = evals ?? [];
  const best = options.length ? options[0].wp : 0;
  const worst = options.length ? options[options.length - 1].wp : 0;
  const span = Math.max(0.02, best - worst);
  const real = realChoiceFor(side, currentReal, userTeam);
  // The engine's preferred call, plus anything it cannot separate from it.
  const { best: optimalAction, tied: tiedActions } = optimal(options);

  return (
    <div className="tmd-panel">
      <div className="tmd-panel-head">
        <span>{side === "offense" ? "your call" : "you are on defense"}</span>
        {thinking && <span className="tmd-thinking">thinking…</span>}
      </div>
      <div className="tmd-panel-body">
        {!options.length && !thinking && <p className="tmd-note">Loading the engine…</p>}

        {options.map((e) => {
          const { title, sub } = label(e.action, state, fgProbability, onsideRate, opponent);
          const wasReal = real === e.action;
          const isOptimal = optimalAction === e.action;
          const isTied = tiedActions.has(e.action);
          return (
            <button
              key={e.action}
              className={`tmd-choice${isOptimal ? " optimal" : ""}${wasReal ? " real" : ""}`}
              data-tel="drill-decision"
              disabled={thinking}
              onClick={() => onDecide(e.action)}
            >
              <span>
                <span className="tmd-choice-label">
                  {title}
                  {isOptimal && <span className="tmd-tag best">optimal</span>}
                  {isTied && <span className="tmd-tag close">too close to call</span>}
                  {wasReal && <span className="tmd-tag real">as played</span>}
                </span>
                <span className="tmd-choice-sub">{sub}</span>
                {reveal && (
                  <span className="tmd-bar">
                    <span style={{ width: `${Math.max(2, ((e.wp - worst) / span) * 100)}%` }} />
                  </span>
                )}
              </span>
              {reveal && (
                <span className="tmd-choice-wp">
                  {(e.wp * 100).toFixed(1)}%
                  <em>± {(e.stderr * 100).toFixed(1)}</em>
                </span>
              )}
            </button>
          );
        })}

        {children && <div className="tmd-actions">{children}</div>}
      </div>
    </div>
  );
}
