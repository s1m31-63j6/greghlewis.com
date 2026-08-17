"use client";

/**
 * Where your game and the real one came apart.
 *
 * The spine is the sequence you and the real coach agreed on. At the first call
 * that differed, the diagram forks: the upper branch is what actually happened
 * in the game, the lower branch is what happened to you. Everything after the
 * fork on the lower branch is simulated, and it is labelled as such rather than
 * being dressed up as history.
 *
 * If you never diverged, there is no fork and the diagram is just a replay.
 */

import type { Decision } from "./useDrill";
import type { RealPlay } from "./scenarios";
import { formatClock } from "./scenarios";

interface Props {
  decisions: Decision[];
  sequence: RealPlay[] | null;
  userTeam: string;
}

const NODE_W = 104;
const GAP = 18;
const PITCH = NODE_W + GAP;
const ROW_H = 58;
const MAX_AFTER = 6;

const ACTION_LABEL: Record<string, string> = {
  run: "Run", pass: "Pass", pass_sideline: "Sideline", field_goal: "Field goal",
  punt: "Punt", spike: "Spike", kneel: "Kneel", timeout: "Timeout",
  kick: "Extra point", two: "Two-point", deep: "Deep kick", onside: "Onside",
  defend: "Defend", concede: "Let them score",
};

const OUTCOME_LABEL: Record<string, string> = {
  touchdown: "touchdown", fg_good: "kick good", fg_miss: "kick missed",
  interception: "intercepted", fumble: "fumble", downs: "turnover on downs",
  punt: "punted", first_down: "first down", gain: "short gain",
  incomplete: "incomplete", sack: "sacked", safety: "safety",
  spike: "clock stopped", kneel: "knee",
};

function Node({
  x, y, action, outcome, clock, tone,
}: {
  x: number; y: number; action: string; outcome: string | null; clock: string; tone: string;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={NODE_W} height={42} rx={2} fill="#fff" stroke={tone} strokeWidth={1.2} />
      <text x={7} y={14} fontSize={10.5} fontFamily="var(--sans)" fill="var(--ink)" fontWeight={600}>
        {ACTION_LABEL[action] ?? action}
      </text>
      <text x={7} y={27} fontSize={9.5} fontFamily="var(--sans)" fill="var(--ink-quiet)">
        {outcome ? (OUTCOME_LABEL[outcome] ?? outcome) : "—"}
      </text>
      <text x={7} y={38} fontSize={9} fontFamily="var(--display)" style={{ fontStretch: "78%" }} fill="var(--ink-meta)">
        {clock}
      </text>
    </g>
  );
}

export default function BranchDiagram({ decisions, sequence, userTeam }: Props) {
  const forkAt = decisions.findIndex((d) => !d.fromHistory);
  const shared = forkAt === -1 ? decisions : decisions.slice(0, forkAt);
  const mine = forkAt === -1 ? [] : decisions.slice(forkAt, forkAt + MAX_AFTER);

  // The real game's continuation from the fork, taken straight from the
  // transcript rather than from anything the engine produced.
  const realTail: RealPlay[] = [];
  if (forkAt !== -1 && sequence) {
    for (let i = shared.length; i < sequence.length && realTail.length < MAX_AFTER; i += 1) {
      realTail.push(sequence[i]);
    }
  }

  const cols = shared.length + Math.max(mine.length, realTail.length);
  const W = Math.max(560, cols * PITCH + 130);
  const forked = forkAt !== -1;
  const H = forked ? ROW_H * 2 + 46 : ROW_H + 34;
  const midY = forked ? 18 : 14;
  const lowY = forked ? midY + ROW_H : midY;

  const sharedEndX = 96 + shared.length * PITCH;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
           aria-label="Where your calls diverged from the real game">
        <text x={4} y={midY + 24} fontSize={9} fontFamily="var(--display)" style={{ fontStretch: "78%" }} fill="var(--ink-meta)">
          {forked ? "REAL GAME" : "YOUR GAME"}
        </text>
        {forked && (
          <text x={4} y={lowY + 24} fontSize={9} fontFamily="var(--display)" style={{ fontStretch: "78%" }} fill="var(--accent)">
            YOU
          </text>
        )}

        {/* the calls you and the coach agreed on */}
        {shared.map((d, i) => (
          <g key={`s${i}`}>
            {i > 0 && (
              <line x1={96 + (i - 1) * PITCH + NODE_W} y1={midY + 21}
                    x2={96 + i * PITCH} y2={midY + 21}
                    stroke="var(--rule-soft)" strokeWidth={1.4} />
            )}
            <Node x={96 + i * PITCH} y={midY} action={d.action}
                  outcome={d.outcome} clock={formatClock(d.before.seconds)}
                  tone="var(--rule-soft)" />
          </g>
        ))}

        {forked && (
          <>
            {/* the fork itself */}
            <path
              d={`M${sharedEndX - GAP},${midY + 21} L${sharedEndX - GAP / 2},${midY + 21} L${sharedEndX - GAP / 2},${lowY + 21} L${sharedEndX},${lowY + 21}`}
              fill="none" stroke="var(--accent)" strokeWidth={1.4}
            />
            <line x1={sharedEndX - GAP} y1={midY + 21} x2={sharedEndX} y2={midY + 21}
                  stroke="var(--warn)" strokeWidth={1.4} strokeDasharray="3 2" />

            {/* what actually happened */}
            {realTail.map((p, i) => (
              <g key={`r${i}`}>
                {i > 0 && (
                  <line x1={sharedEndX + (i - 1) * PITCH + NODE_W} y1={midY + 21}
                        x2={sharedEndX + i * PITCH} y2={midY + 21}
                        stroke="var(--warn)" strokeWidth={1.2} strokeDasharray="3 2" />
                )}
                <Node x={sharedEndX + i * PITCH} y={midY} action={p.action}
                      outcome={p.outcome} clock={formatClock(p.sec ?? 0)}
                      tone="var(--warn)" />
              </g>
            ))}

            {/* what you did instead */}
            {mine.map((d, i) => (
              <g key={`m${i}`}>
                {i > 0 && (
                  <line x1={sharedEndX + (i - 1) * PITCH + NODE_W} y1={lowY + 21}
                        x2={sharedEndX + i * PITCH} y2={lowY + 21}
                        stroke="var(--accent)" strokeWidth={1.4} />
                )}
                <Node x={sharedEndX + i * PITCH} y={lowY} action={d.action}
                      outcome={d.outcome} clock={formatClock(d.before.seconds)}
                      tone="var(--accent)" />
              </g>
            ))}
          </>
        )}
      </svg>
      <p className="tmd-note" style={{ marginTop: "0.5rem" }}>
        {forked ? (
          <>
            You matched {userTeam}&apos;s real calls for {shared.length}{" "}
            {shared.length === 1 ? "snap" : "snaps"}, then went your own way. The dashed
            line is the game as it was actually played; the solid line is yours, simulated
            from the point you changed it.
          </>
        ) : (
          <>You called it exactly as it was called on the day, so there is nothing to fork.</>
        )}
      </p>
    </div>
  );
}
