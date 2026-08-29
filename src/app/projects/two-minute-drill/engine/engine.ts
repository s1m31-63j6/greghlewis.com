/**
 * The Monte Carlo endgame engine — TypeScript port of
 * `projects/two-minute-drill/engine.py`.
 *
 * A win probability here is the chance of winning if you take this action now
 * and both teams then play like an average NFL team, where "average NFL team"
 * is the empirical policy in `tendencies.json`. It is not a claim about optimal
 * play. You are being measured against the league.
 *
 * Every `rng()` call below has to happen in the same order as the Python, or
 * the parity test fails. When editing, move the two files together.
 *
 * Overtime is out of scope: a tie at 0:00 scores 0.5.
 */

import { yardlineBand as yardlineBandOf, ytgBand as ytgBandOf } from "./buckets";
import { draw, Models, pick } from "./models";
import { mulberry32, type Rng } from "./rng";
import {
  type Action,
  type DefenseAction,
  type Evaluation,
  type GameState,
  KICKOFF,
  type Outcome,
  PAT,
  PLAY,
} from "./types";

/** A field goal is snapped seven yards back and the posts are ten yards deep. */
export const FG_SNAP_OVERHEAD = 17;
export const TWO_MINUTE_WARNING = 120;
/** Past this, nobody attempts a kick with a straight face. */
export const MAX_FG_DISTANCE = 68;

const OFF_ACTIONS = new Set(["run", "pass", "pass_sideline", "field_goal", "punt", "spike", "kneel"]);

export function fgDistance(s: GameState): number {
  return s.yardline + FG_SNAP_OVERHEAD;
}

export function userDiff(s: GameState): number {
  return s.offenseIsUser ? s.diff : -s.diff;
}

function clone(s: GameState, patch: Partial<GameState>): GameState {
  return { ...s, ...patch };
}

/** Hand the ball over, re-expressing the state in the other team's frame. */
function flip(s: GameState, yardline: number, down = 1, ydstogo = 10): GameState {
  return {
    ...s,
    diff: -s.diff,
    yardline,
    down,
    ydstogo: Math.min(ydstogo, yardline),
    offTo: s.defTo,
    defTo: s.offTo,
    offenseIsUser: !s.offenseIsUser,
    phase: PLAY,
  };
}

/** Burn clock, stopping at the two-minute warning the first time we cross it. */
function advanceClock(s: GameState, elapsed: number): GameState {
  if (!s.twoMinuteDone && s.seconds > TWO_MINUTE_WARNING) {
    const toWarning = s.seconds - TWO_MINUTE_WARNING;
    if (elapsed >= toWarning) {
      return clone(s, {
        seconds: TWO_MINUTE_WARNING,
        twoMinuteDone: true,
        clockRunning: false,
      });
    }
  }
  const seconds = Math.max(0, s.seconds - elapsed);
  return clone(s, { seconds, twoMinuteDone: s.twoMinuteDone || seconds <= TWO_MINUTE_WARNING });
}

function afterGain(s: GameState, gain: number, klass: string): [GameState, Outcome] {
  const yardline = s.yardline - gain;
  if (yardline <= 0) {
    return [clone(s, { diff: s.diff + 6, phase: PAT, clockRunning: false }), "touchdown"];
  }
  if (yardline >= 100) {
    // Tackled in your own end zone. Two points and a free kick to them.
    return [
      clone(s, { diff: s.diff - 2, phase: KICKOFF, yardline: 35, clockRunning: false }),
      "safety",
    ];
  }
  const inbounds = klass.endsWith("inbounds");
  if (gain >= s.ydstogo) {
    return [
      clone(s, { yardline, down: 1, ydstogo: Math.min(10, yardline), clockRunning: inbounds }),
      "first_down",
    ];
  }
  if (s.down === 4) return [flip(s, 100 - yardline), "downs"];
  return [
    clone(s, { yardline, down: s.down + 1, ydstogo: s.ydstogo - gain, clockRunning: inbounds }),
    "gain",
  ];
}

export function resolve(
  s: GameState,
  action: Action,
  m: Models,
  rng: Rng,
  defTimeout = false,
): [GameState, Outcome] {
  const band = ytgBandOf(s.ydstogo);
  let nxt: GameState;
  let ev: Outcome;
  let klass: string;

  if (action === "kneel") {
    klass = "kneel";
    ev = "kneel";
    [nxt] = afterGain(s, -1, "run_inbounds");
  } else if (action === "spike") {
    klass = "spike";
    ev = "spike";
    // A spike costs a down. On fourth it is a turnover, which is exactly why
    // the UI keeps offering it — that is a real mistake a player can make.
    nxt = s.down === 4 ? flip(s, 100 - s.yardline) : clone(s, { down: s.down + 1, clockRunning: false });
  } else if (action === "run") {
    const gain = draw(m.d.run.yards[band] ?? m.d.run.yards_all, rng());
    if (rng() < m.d.run.fumble_lost) {
      nxt = flip(s, Math.max(1, 100 - (s.yardline - gain)));
      ev = "fumble";
      klass = "run_inbounds";
    } else {
      klass = rng() < m.d.run.out_of_bounds ? "run_oob" : "run_inbounds";
      [nxt, ev] = afterGain(s, gain, klass);
    }
  } else if (action === "pass" || action === "pass_sideline") {
    const p = m.d.pass;
    if (rng() < p.sack) {
      klass = "sack";
      [nxt, ev] = afterGain(s, draw(p.sack_yards, rng()), klass);
    } else if (rng() < p.interception) {
      nxt = flip(s, Math.max(1, 100 - s.yardline));
      ev = "interception";
      klass = "pass_incomplete";
    } else {
      let comp = p.complete[band] ?? p.complete_all;
      let oobP = p.out_of_bounds_given_complete[band] ?? p.out_of_bounds_given_complete_all;
      if (action === "pass_sideline") {
        // Working the sideline trades completion percentage for the clock
        // stopping. This trade is a modelling assumption, not a measurement —
        // nflverse does not label intent — so it is kept small and is stated
        // plainly on the methodology page.
        comp *= 0.9;
        oobP = Math.min(1, oobP * 2.2);
      }
      if (rng() < comp) {
        const gain = draw(p.yards_complete[band] ?? p.yards_complete_all, rng());
        klass = rng() < oobP ? "pass_complete_oob" : "pass_complete_inbounds";
        [nxt, ev] = afterGain(s, gain, klass);
      } else {
        klass = "pass_incomplete";
        if (s.down === 4) {
          nxt = flip(s, 100 - s.yardline);
          ev = "downs";
        } else {
          nxt = clone(s, { down: s.down + 1, clockRunning: false });
          ev = "incomplete";
        }
      }
    }
  } else if (action === "field_goal") {
    klass = "field_goal";
    const distance = fgDistance(s);
    if (rng() < m.d.field_goal.block_rate || rng() >= m.fgMake(distance)) {
      // A miss hands over at the spot of the kick — seven yards behind the
      // line — or the defending team's own 20, whichever is better for them.
      nxt = flip(s, Math.min(80, 93 - s.yardline));
      ev = "fg_miss";
    } else {
      nxt = clone(s, { diff: s.diff + 3, phase: KICKOFF, yardline: 35, clockRunning: false });
      ev = "fg_good";
    }
  } else if (action === "punt") {
    klass = "punt";
    const net = draw(m.d.punt.net[yardlineBandOf(s.yardline)] ?? m.d.punt.net_all, rng());
    const landing = s.yardline - net;
    // `spot` is the receiving team's distance to the goal they attack. A punt
    // into the end zone is a touchback and puts them on their own 20, which is
    // 80 yards out, not 20.
    nxt = flip(s, landing <= 0 ? 80 : Math.min(99, 100 - landing));
    ev = "punt";
  } else {
    throw new Error(`unknown action ${action}`);
  }

  const urgency = s.diff < 0 ? "hurry" : s.diff > 0 ? "bleed" : "neutral";
  const elapsed = m.runoffSeconds(klass, rng(), defTimeout, urgency, s.seconds <= 60 ? "late" : "mid");
  return [advanceClock(nxt, elapsed), ev];
}

export function resolvePat(s: GameState, choice: string, m: Models, rng: Rng): GameState {
  const p = choice === "two" ? m.d.conversion.two_point : m.d.conversion.extra_point;
  const gain = rng() < p ? (choice === "two" ? 2 : 1) : 0;
  return clone(s, { diff: s.diff + gain, phase: KICKOFF, yardline: 35, clockRunning: false });
}

/** The kicking team currently holds `s`; possession flips either way. */
export function resolveKickoff(s: GameState, choice: string, m: Models, rng: Rng): GameState {
  const ko = m.d.kickoff;
  let start: number;
  if (choice === "onside") {
    if (rng() < ko.onside.recover) {
      return clone(s, { phase: PLAY, yardline: 55, down: 1, ydstogo: 10, clockRunning: false });
    }
    start = draw(ko.onside.fail_start, rng());
  } else {
    start = draw(ko.deep.start, rng());
  }
  return advanceClock(clone(flip(s, start), { clockRunning: false }), 5);
}

/** What an average NFL team does here. */
export function policyAction(s: GameState, m: Models, rng: Rng): Action {
  if (s.phase === PAT) return pick(m.tendency("two_point", s), rng()) as Action;
  if (s.phase === KICKOFF) return pick(m.tendency("onside", s), rng()) as Action;
  if (s.down === 4) {
    const choice = pick(m.tendency("fourth_down", s), rng());
    return ({ go: "pass", fg: "field_goal", punt: "punt", kneel: "kneel" }[choice] ??
      "pass") as Action;
  }
  const choice = pick(m.tendency("play_call", s), rng());
  if (choice === "fg") {
    // Only honor an early-down kick if it is kickable from here; the tendency
    // bucket is coarser than the yard line.
    return fgDistance(s) <= MAX_FG_DISTANCE ? "field_goal" : "pass";
  }
  return (OFF_ACTIONS.has(choice) ? choice : "pass") as Action;
}

/** Play the state out to 0:00. Returns 1, 0 or 0.5 from the user's side. */
export function rollout(s: GameState, m: Models, rng: Rng, maxPlays = 60): number {
  let cur = s;
  for (let i = 0; i < maxPlays; i += 1) {
    // The clock expiring ends the playing, not the scoring sequence: a
    // touchdown as time runs out is still followed by its conversion, and that
    // conversion decides the game when it is the tying score.
    if (cur.seconds <= 0 && cur.phase === PLAY) break;
    if (cur.phase === PAT) {
      cur = resolvePat(cur, policyAction(cur, m, rng), m, rng);
      continue;
    }
    if (cur.phase === KICKOFF) {
      cur = resolveKickoff(cur, policyAction(cur, m, rng), m, rng);
      continue;
    }

    // Either side may stop the clock before the snap.
    let usedTimeout = false;
    if (cur.clockRunning && cur.offTo > 0) {
      if (pick(m.tendency("offensive_timeout", cur), rng()) === "timeout") {
        cur = clone(cur, { offTo: cur.offTo - 1, clockRunning: false });
        usedTimeout = true;
      }
    }
    if (cur.clockRunning && cur.defTo > 0) {
      if (pick(m.tendency("defensive_timeout", cur), rng()) === "timeout") {
        cur = clone(cur, { defTo: cur.defTo - 1, clockRunning: false });
        usedTimeout = true;
      }
    }
    [cur] = resolve(cur, policyAction(cur, m, rng), m, rng, usedTimeout);
  }
  const d = userDiff(cur);
  return d > 0 ? 1 : d < 0 ? 0 : 0.5;
}

function calibrated(m: Models, p: number, se: number): { wp: number; stderr: number } {
  // Scale the error bar by the local slope of the calibration curve so it
  // still describes the number actually on screen.
  const slope = (m.calibrate(Math.min(1, p + 0.01)) - m.calibrate(Math.max(0, p - 0.01))) / 0.02;
  return { wp: m.calibrate(p), stderr: se * Math.max(slope, 0) };
}

export function winProbability(
  s: GameState,
  m: Models,
  n = 4000,
  seed = 0,
  rngFactory: (seed: number) => Rng = defaultRng,
): { wp: number; stderr: number } {
  const rng = rngFactory(seed);
  let wins = 0;
  let sq = 0;
  for (let i = 0; i < n; i += 1) {
    const r = rollout(s, m, rng);
    wins += r;
    sq += r * r;
  }
  const p = wins / n;
  const varr = Math.max(0, sq / n - p * p);
  return calibrated(m, p, Math.sqrt(varr / n));
}

function defaultRng(seed: number): Rng {
  return mulberry32(seed);
}

/** What the team without the ball gets to decide before the snap. */
export function legalDefenseActions(s: GameState): DefenseAction[] {
  // During a conversion or a kickoff the decision belongs to the other team —
  // they pick two-or-kick, they pick onside-or-deep. The defense just watches.
  if (s.phase !== PLAY) return ["defend"];
  const acts: DefenseAction[] = ["defend"];
  if (s.defTo > 0 && s.clockRunning) acts.push("timeout");
  // Deliberately allowing a touchdown is only a real option when you are ahead
  // and would rather have the ball back with clock on it than defend a drive.
  if (s.diff > 0) acts.push("concede");
  return acts;
}

/**
 * Apply the defense's pre-snap choice, then let the offense run its play.
 *
 * Returns the resulting state, what the play produced, and *which* play the
 * offense chose. That third value is the whole point: standing on defense you
 * are watching someone else's offense, and an interface that can only say "you
 * played it out" is not telling you what happened.
 */
export function resolveDefense(
  s: GameState,
  action: DefenseAction,
  m: Models,
  rng: Rng,
): [GameState, Outcome, Action] {
  if (s.phase === PAT) {
    const choice = policyAction(s, m, rng);
    return [resolvePat(s, choice, m, rng), "conversion", choice];
  }
  if (s.phase === KICKOFF) {
    const choice = policyAction(s, m, rng);
    return [resolveKickoff(s, choice, m, rng), "kickoff", choice];
  }
  if (action === "concede") {
    return [clone(s, { diff: s.diff + 6, phase: PAT, clockRunning: false }), "touchdown", "run"];
  }
  let cur = s;
  let used = false;
  if (action === "timeout" && s.defTo > 0) {
    cur = clone(cur, { defTo: cur.defTo - 1, clockRunning: false });
    used = true;
  }
  const offAction = policyAction(cur, m, rng);
  const [nxt, ev] = resolve(cur, offAction, m, rng, used);
  return [nxt, ev, offAction];
}

export function evaluateDefense(
  s: GameState,
  m: Models,
  actions: DefenseAction[] | null = null,
  n = 4000,
  seed = 0,
  rngFactory: (seed: number) => Rng = defaultRng,
): Evaluation[] {
  const list = actions ?? legalDefenseActions(s);
  const out: Evaluation[] = [];
  list.forEach((action, i) => {
    const rng = rngFactory(seed + i * 7919);
    let wins = 0;
    let sq = 0;
    for (let k = 0; k < n; k += 1) {
      const [nxt] = resolveDefense(s, action, m, rng);
      const r = rollout(nxt, m, rng);
      wins += r;
      sq += r * r;
    }
    const p = wins / n;
    const { wp, stderr } = calibrated(m, p, Math.sqrt(Math.max(0, sq / n - p * p) / n));
    out.push({ action, wp, stderr, n });
  });
  return out.sort((a, b) => b.wp - a.wp);
}

export function legalActions(s: GameState): Action[] {
  if (s.phase === PAT) return ["kick", "two"];
  if (s.phase === KICKOFF) return ["deep", "onside"];
  const acts: Action[] = ["run", "pass", "pass_sideline"];
  if (fgDistance(s) <= MAX_FG_DISTANCE) acts.push("field_goal");
  if (s.down === 4) acts.push("punt");
  // Spiking is only a decision while the clock is running and a down is
  // available to spend; with the clock stopped it is a wasted down.
  if (s.down < 4 && s.clockRunning) acts.push("spike");
  if (s.offTo > 0 && s.clockRunning) acts.push("timeout");
  // Level counts: kneeling out a tie to reach overtime is a real call.
  if (s.diff >= 0) acts.push("kneel");
  return acts;
}

export function evaluate(
  s: GameState,
  m: Models,
  actions: Action[] | null = null,
  n = 4000,
  seed = 0,
  rngFactory: (seed: number) => Rng = defaultRng,
): Evaluation[] {
  const list = actions ?? legalActions(s);
  const out: Evaluation[] = [];
  list.forEach((action, i) => {
    const rng = rngFactory(seed + i * 7919);
    let wins = 0;
    let sq = 0;
    for (let k = 0; k < n; k += 1) {
      let nxt: GameState;
      if (s.phase === PAT) nxt = resolvePat(s, action, m, rng);
      else if (s.phase === KICKOFF) nxt = resolveKickoff(s, action, m, rng);
      else if (action === "timeout") {
        // Not a play. It stops the clock and costs a timeout; the down is
        // still there to be used, so the rollout picks up on the same down.
        nxt = clone(s, { offTo: s.offTo - 1, clockRunning: false });
      } else [nxt] = resolve(s, action, m, rng);
      const r = rollout(nxt, m, rng);
      wins += r;
      sq += r * r;
    }
    const p = wins / n;
    const varr = Math.max(0, sq / n - p * p);
    const { wp, stderr } = calibrated(m, p, Math.sqrt(varr / n));
    out.push({ action, wp, stderr, n });
  });
  return out.sort((a, b) => b.wp - a.wp);
}
