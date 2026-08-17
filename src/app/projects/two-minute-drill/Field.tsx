"use client";

/**
 * The field, as inline SVG, with the motion a GameCast has.
 *
 * **The field does not turn round.** Your team always attacks to the right, for
 * the whole game, exactly as a broadcast keeps one camera side. An earlier
 * version drew whoever had the ball as attacking rightward, which meant every
 * change of possession mirrored the world — both end zones swapped colour and
 * badge, and the ball jumped to its own reflection. Each play animated
 * correctly and the sequence was still impossible to follow.
 *
 * Positions are therefore held as `progress`: yards from the left goal line,
 * 0 to 100, which is a fact about the field rather than about whoever happens
 * to be holding the ball. Converting into it is one line, and it has a pleasant
 * consequence — an interception or a turnover on downs leaves the ball on the
 * same blade of grass, so it now slides a few yards rather than teleporting.
 *
 * Four things move, each doing a job:
 *   - the **ball** slides to its new spot, so a nineteen-yard gain looks like
 *     nineteen yards rather than a number changing;
 *   - the **line of scrimmage and chain marker** travel with it;
 *   - a **gain bar** washes over the yards just covered and fades;
 *   - the **drive trail** marks every earlier spot this possession.
 *
 * Transforms are set through `style` rather than the SVG `transform` attribute.
 * Both end up as the same CSS property, but the style route is unambiguously
 * the animatable one and does not depend on presentation-attribute mapping.
 */

import { FG_SNAP_OVERHEAD, MAX_FG_DISTANCE } from "./engine/engine";
import type { GameState } from "./engine/types";
import { type TeamMap, teamOf } from "./teams";

interface Props {
  state: GameState;
  /** Where the ball sat before the last play, in the current team's frame. */
  previousYardline: number | null;
  /** Every earlier spot this possession, oldest first, same frame. */
  trail: number[];
  /** Bumped once per play so one-shot animations remount. */
  playIndex: number;
  fgProbability: number | null;
  /** Fixed for the whole game: your team, and the one you are playing. */
  userTeam: string;
  opponent: string;
  teams: TeamMap;
  /** Who just scored, if anyone. */
  scoredBy: "user" | "opponent" | null;
}

const W = 1000;
const H = 300;
const ENDZONE = 92;
const PLAY_W = W - ENDZONE * 2;
const MID_Y = H / 2;

/** Yards from the left goal line (0–100) to an x coordinate. */
function xOf(progress: number): number {
  return ENDZONE + (progress / 100) * PLAY_W;
}

export default function Field({
  state, previousYardline, trail, playIndex, fgProbability,
  userTeam, opponent, teams, scoredBy,
}: Props) {
  const user = teamOf(teams, userTeam);
  const opp = teamOf(teams, opponent);

  /**
   * A yards-to-goal number, in the frame of whoever currently has the ball,
   * expressed as yards from the left goal line. Your team attacks right, so
   * its distance-to-goal counts down from the right; theirs counts up.
   */
  const toProgress = (yardline: number) =>
    state.offenseIsUser ? 100 - yardline : yardline;

  const inPlay = state.phase === "play";
  const ballProgress = toProgress(state.yardline);
  const ballX = xOf(ballProgress);

  const lineToGain = Math.max(0, state.yardline - state.ydstogo);
  const firstX = xOf(toProgress(lineToGain));

  const kickable = state.yardline + FG_SNAP_OVERHEAD <= MAX_FG_DISTANCE;

  // The yards just covered. Both ends are in the same possession's frame, so
  // the conversion is the same for each.
  const prevProgress = previousYardline !== null ? toProgress(previousYardline) : null;
  const prevX = prevProgress !== null ? xOf(prevProgress) : ballX;
  const gained = previousYardline !== null ? previousYardline - state.yardline : 0;
  const showGain = inPlay && previousYardline !== null && Math.abs(gained) >= 2;

  return (
    <div className="tmd-field">
      <svg
        className="tmd-field-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          inPlay
            ? `${state.offenseIsUser ? userTeam : opponent} has the ball, ` +
              `${state.yardline} yards from the end zone, ${state.ydstogo} to go`
            : `${state.phase}`
        }
      >
        <defs>
          <linearGradient id="tmd-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.16)" />
          </linearGradient>
        </defs>

        <rect x={0} y={0} width={W} height={H} fill="var(--turf)" />

        {/* End zones never move. Yours on the left, theirs on the right, and
            you attack rightward all game. */}
        <rect x={0} y={0} width={ENDZONE} height={H} fill={user.color} />
        <rect x={W - ENDZONE} y={0} width={ENDZONE} height={H} fill={opp.color} />
        {scoredBy && (
          <rect
            key={`flash-${playIndex}`}
            className="tmd-score-flash"
            x={scoredBy === "user" ? W - ENDZONE : 0}
            y={0}
            width={ENDZONE}
            height={H}
            fill="#ffffff"
          />
        )}

        {/* five- and ten-yard lines */}
        {Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map((yd) => {
          const x = xOf(yd);
          const major = yd % 10 === 0;
          return (
            <line
              key={yd}
              x1={x}
              y1={0}
              x2={x}
              y2={H}
              stroke="var(--turf-line)"
              strokeWidth={major ? 2 : 1}
              opacity={major ? 0.85 : 0.4}
            />
          );
        })}

        {/* hash marks */}
        {Array.from({ length: 99 }, (_, i) => i + 1)
          .filter((yd) => yd % 5 !== 0)
          .map((yd) => {
            const x = xOf(yd);
            return (
              <g key={`h${yd}`} stroke="var(--turf-line)" strokeWidth={1} opacity={0.26}>
                <line x1={x} y1={MID_Y - 48} x2={x} y2={MID_Y - 38} />
                <line x1={x} y1={MID_Y + 38} x2={x} y2={MID_Y + 48} />
              </g>
            );
          })}

        {/* yard numbers, counting up to midfield and back down */}
        {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((n, i) => (
          <text
            key={`${n}-${i}`}
            x={xOf((i + 1) * 10)}
            y={MID_Y + 13}
            textAnchor="middle"
            fontSize={34}
            fontWeight={700}
            fontFamily="var(--display)"
            fill="rgba(255,255,255,0.26)"
            style={{ fontStretch: "76%" }}
          >
            {n}
          </text>
        ))}

        {/* club marks, fixed to their own end */}
        {user.logo && (
          <image
            href={user.logo}
            x={ENDZONE / 2 - 28}
            y={MID_Y - 28}
            width={56}
            height={56}
            opacity={0.85}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        {opp.logo && (
          <image
            href={opp.logo}
            x={W - ENDZONE / 2 - 28}
            y={MID_Y - 28}
            width={56}
            height={56}
            opacity={0.85}
            preserveAspectRatio="xMidYMid meet"
          />
        )}

        {/* the yards just covered — a low wash, not a strobe */}
        {showGain && (
          <rect
            key={`gain-${playIndex}`}
            className="tmd-gain"
            x={Math.min(prevX, ballX)}
            y={MID_Y - 20}
            width={Math.abs(ballX - prevX)}
            height={40}
            rx={3}
            fill={gained >= 0 ? "#f2c14e" : "#d05b5b"}
          />
        )}

        {/* where the ball has been this possession */}
        {trail.map((yd, i) => (
          <circle
            key={`trail-${i}`}
            cx={xOf(toProgress(yd))}
            cy={MID_Y}
            r={3.5}
            fill="#ffffff"
            opacity={0.1 + (i / Math.max(1, trail.length)) * 0.2}
          />
        ))}

        {/* chain marker */}
        {inPlay && lineToGain > 0 && (
          <g className="tmd-slide" style={{ transform: `translateX(${firstX}px)` }}>
            <line x1={0} y1={0} x2={0} y2={H} stroke="#f2c14e" strokeWidth={3} />
          </g>
        )}

        {/* line of scrimmage */}
        {inPlay && (
          <g className="tmd-slide" style={{ transform: `translateX(${ballX}px)` }}>
            <line x1={0} y1={0} x2={0} y2={H} stroke="#ffffff" strokeWidth={3} opacity={0.9} />
          </g>
        )}

        {/* The ball. It is never unmounted, so it always travels rather than
            reappearing somewhere else. */}
        <g className="tmd-slide" style={{ transform: `translateX(${ballX}px)` }}>
          <ellipse cx={0} cy={MID_Y} rx={12} ry={7.5} fill="#7d4a1e"
                   stroke="#ffffff" strokeWidth={2} />
          <line x1={-4.5} y1={MID_Y} x2={4.5} y2={MID_Y} stroke="#fff" strokeWidth={1.6} />
        </g>

        {/* who has it, and which way they are going */}
        <text
          x={W / 2}
          y={26}
          textAnchor="middle"
          fontSize={14}
          fontWeight={700}
          fontFamily="var(--display)"
          fill="rgba(255,255,255,0.72)"
          style={{ fontStretch: "76%", letterSpacing: "0.12em" }}
        >
          {state.offenseIsUser ? `${userTeam} →` : `← ${opponent}`}
        </text>

        <rect x={0} y={0} width={W} height={H} fill="url(#tmd-shade)" pointerEvents="none" />
      </svg>

      <div className="tmd-field-tag">
        {!inPlay
          ? state.phase === "pat"
            ? "conversion attempt"
            : "kickoff"
          : kickable && fgProbability !== null
            ? `${state.yardline + FG_SNAP_OVERHEAD} yd field goal · ${Math.round(fgProbability * 100)}%`
            : "out of field goal range"}
      </div>
    </div>
  );
}
