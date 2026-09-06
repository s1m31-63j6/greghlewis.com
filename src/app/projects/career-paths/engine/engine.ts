/**
 * The career simulation: a line-for-line port of projects/career-paths/engine.py.
 *
 * parity_test.py drives both from the same mulberry32 stream and requires exact
 * agreement on every discrete outcome and 1e-9 relative agreement on dollars.
 * Every rng() call is annotated with the same draw label as the Python; add a
 * draw here and the Python must add the same one in the same place.
 */

import type { Rng } from "./rng.ts";
import type {
  Career, CareerEvent, Company, EventKind, NodeKey, Params, Persona, SimOptions, Stage, Track, Track3,
} from "./types.ts";
import { STAGES, TRACKS3 } from "./types.ts";

const STAGE_ORDER: Stage[] = ["seed", "seriesAB", "growth"];
const TENDER_STAGES: Stage[] = ["growth", "pe"];

/** Box-Muller, two uniforms, one normal. Draw order: u1 then u2. */
export function normal(rng: Rng): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1 > 1e-12 ? u1 : 1e-12)) * Math.cos(2.0 * Math.PI * u2);
}

function employer(s: Career): Company | null {
  for (let i = s.companies.length - 1; i >= 0; i--) {
    if (s.companies[i].employer) return s.companies[i];
  }
  return null;
}

/** Draw one key in proportion to weight. One uniform. */
export function chooseWeighted(rng: Rng, weights: [string, number][]): string {
  let total = 0.0;
  for (const [, w] of weights) total += w;
  const u = rng() * total;
  let acc = 0.0;
  for (const [k, w] of weights) {
    acc += w;
    if (u < acc) return k;
  }
  return weights[weights.length - 1][0];
}

function sampleStage(rng: Rng, P: Params): Stage {
  return chooseWeighted(rng, STAGES.map((k) => [k, P.stageMix[k]])) as Stage;
}

/** What the sankey may offer at the START of `year` (milestone was year-1). */
export function legalChoices(track: Track, year: number): string[] {
  if (track === "gradschool") return ["stay"];
  const opts = ["stay"];
  for (const t of TRACKS3) if (t !== track) opts.push(`switch:${t}`);
  if (track === "founder") return opts;
  if (year - 1 <= 5) for (const t of TRACKS3) opts.push(`mba:${t}`);
  if (year - 1 >= 5 && year - 1 <= 15) opts.push("found");
  return opts;
}

/** Two draws at most: the choice, then the MBA landing when needed. */
function sampleChoice(rng: Rng, s: Career, year: number, milestoneIndex: number, P: Params): string {
  if (s.track === "gradschool") return "stay";
  const c = P.choice[s.track as Track3 | "founder"];
  const decay = Math.pow(P.choice.decayPerMilestone, milestoneIndex);
  const legal = legalChoices(s.track, year);
  const weights: [string, number][] = [];
  for (const opt of legal) {
    if (opt === "stay") weights.push([opt, c.stay]);
    else if (opt.startsWith("switch:")) weights.push([opt, c[opt.slice(7)] * decay]);
    else if (opt.startsWith("mba:")) continue;
    else if (opt === "found") weights.push([opt, c.found * decay]);
  }
  if (legal.some((o) => o.startsWith("mba:"))) weights.push(["mba", c.mba * decay]);
  const pick = chooseWeighted(rng, weights); // draw: choice
  if (pick === "mba") {
    const landing = chooseWeighted(rng, TRACKS3.map((t) => [t, P.gradschool.landing[t]])); // draw: landing
    return `mba:${landing}`;
  }
  return pick;
}

function joinStartup(rng: Rng, s: Career, year: number, stage: Stage | null, P: Params): void {
  const st = stage !== null ? stage : sampleStage(rng, P); // draw: stage (if not given)
  s.track = "startup";
  s.stage = st;
  s.companies.push({
    stage: st, hiredYear: year, pct: P.startup[st].grantPctFD[s.persona],
    age: 0, alive: true, employer: true, kept: true, failed: false, founder: false, leftYear: null,
  });
}

/** Departing a startup: the options are exercised or forfeited. One draw if startup. */
function leaveEmployer(rng: Rng, s: Career, year: number, P: Params): void {
  const c = employer(s);
  if (c === null) return;
  c.employer = false;
  c.leftYear = year;
  if (c.alive) c.kept = rng() < P.startup[c.stage].pExerciseOnLeave; // draw: exercise
  s.stage = null;
}

function push(s: Career, year: number, kind: EventKind, amount = 0.0): void {
  s.events.push({ year, kind, amount });
}

function applyChoice(rng: Rng, s: Career, year: number, choice: string, P: Params): void {
  if (choice === "stay") return;
  if (s.track === "startup" || s.track === "founder") leaveEmployer(rng, s, year, P);
  if (choice.startsWith("switch:")) {
    const parts = choice.split(":");
    const target = parts[1] as Track3;
    if (s.track === "consulting" && target === "corporate" && s.level < 4) s.level += 1;
    push(s, year, "switch");
    if (target === "startup") joinStartup(rng, s, year, parts.length > 2 ? (parts[2] as Stage) : null, P);
    else { s.track = target; s.stage = null; }
  } else if (choice.startsWith("mba:")) {
    s.track = "gradschool";
    s.stage = null;
    s.landing = choice.slice(4) as Track3;
    s.schoolLeft = P.gradschool.years;
    push(s, year, "mba");
  } else if (choice === "found") {
    s.track = "founder";
    s.stage = "seed";
    s.companies.push({
      stage: "seed", hiredYear: year, pct: P.founder.pctFD,
      age: 0, alive: true, employer: true, kept: true, failed: false, founder: true, leftYear: null,
    });
    push(s, year, "found");
  }
}

function vested(c: Company, year: number, P: Params): number {
  const end = c.leftYear !== null ? c.leftYear : year;
  const yrs = end - c.hiredYear + 1;
  if (yrs < P.cliffYears) return 0.0;
  const v = yrs / P.vestYears;
  return v > 1.0 ? 1.0 : v;
}

function equityCash(c: Company, year: number, value: number, P: Params, frac = 1.0): number {
  const sp = P.startup[c.stage];
  let common = value - sp.prefStack;
  if (common < 0.0) common = 0.0;
  return c.pct * frac * vested(c, year, P) * common * (1.0 - sp.strikeFrac);
}

/** Round, shutdown, exit, tender. Draws: graduate (at round time), fail, exit, tender. */
function rollCompany(rng: Rng, c: Company, year: number, P: Params): [string, number] {
  let sp = P.startup[c.stage];
  c.age += 1;
  const ypr = sp.yearsPerRound;
  if (ypr < 100 && c.age % Math.floor(ypr + 0.5) === 0 && STAGE_ORDER.includes(c.stage)) {
    if (rng() < sp.graduationProb) { // draw: graduate
      c.pct *= 1.0 - sp.dilutionPerRound;
      const i = STAGE_ORDER.indexOf(c.stage);
      if (i < STAGE_ORDER.length - 1) {
        c.stage = STAGE_ORDER[i + 1];
        sp = P.startup[c.stage];
      }
    }
  }
  const fail = sp.failHazard * (c.founder ? P.founder.failMult : 1.0);
  if (rng() < fail) { // draw: fail
    c.alive = false;
    c.failed = true;
    return ["fail", 0.0];
  }
  if (rng() < sp.exitHazard) { // draw: exit
    const value = sp.exitMedian * Math.exp(sp.exitSigma * normal(rng)); // draws: u1, u2
    const cash = c.kept ? equityCash(c, year, value, P) : 0.0;
    c.alive = false;
    return ["exit", cash];
  }
  if (TENDER_STAGES.includes(c.stage) && c.employer && sp.secondaryProb > 0.0) {
    if (rng() < sp.secondaryProb) { // draw: tender
      const cash = equityCash(c, year, sp.exitMedian, P, P.secondaryFrac);
      c.pct *= 1.0 - P.secondaryFrac;
      return ["tender", cash];
    }
  }
  return ["none", 0.0];
}

/** Employer gone (shutdown or layoff). Draw: rejoin (startup only). */
function afterJobLoss(rng: Rng, s: Career, year: number, P: Params, pinned: boolean): void {
  const wasStartup = s.track === "startup";
  s.track = "corporate";
  s.stage = null;
  if (wasStartup) {
    const p = pinned ? 1.0 : P.rejoinStartup;
    if (rng() < p) joinStartup(rng, s, year, null, P); // draw: rejoin, then stage
  }
}

/**
 * One career. `first` is the year-1 track; `opts.stage` fixes the first
 * startup's stage; `opts.pinned` maps milestone year -> choice id (sankey
 * mode); `opts.stay` pins every milestone to "stay".
 */
export function simulate(persona: Persona, first: Track3, P: Params, rng: Rng, opts: SimOptions = {}): Career {
  const H = opts.horizon ?? P.horizon;
  const milestones = P.milestones;
  const stay = opts.stay ?? false;
  const pinned = opts.pinned ?? null;
  const s: Career = {
    persona, track: first, level: 0, ability: 1.0, mult: 1.0, schoolLeft: 0, landing: null,
    stage: null, companies: [], realized: [], events: [], milestoneTrack: [], milestoneLevel: [],
  };
  s.ability = Math.exp(P.ability.sigma * normal(rng)); // draws: u1, u2
  if (first === "startup") joinStartup(rng, s, 1, opts.stage ?? null, P); // draw: stage (if blended)
  const cost = P.gradschool.annualCost;

  for (let year = 1; year <= H; year++) {
    // 1. leave grad school
    if (s.track === "gradschool" && s.schoolLeft === 0) {
      s.track = s.landing ?? "corporate";
      s.landing = null;
      if (s.level < 4) s.level += 1;
      s.mult *= P.gradschool.postSalaryMult;
      push(s, year, "mba_done");
      if (s.track === "startup") {
        s.track = "corporate";
        joinStartup(rng, s, year, null, P); // draw: stage
      }
    }

    // 2. milestone choice
    if (milestones.includes(year - 1) && year - 1 < H) {
      const mi = milestones.indexOf(year - 1);
      let choice: string;
      if (s.track === "gradschool") choice = "stay";
      else if (pinned !== null && (year - 1) in pinned) choice = pinned[year - 1];
      else if (stay) choice = "stay";
      else choice = sampleChoice(rng, s, year, mi, P);
      applyChoice(rng, s, year, choice, P);
    }

    // 3. grad school year
    if (s.track === "gradschool") {
      s.schoolLeft -= 1;
      s.realized.push(-cost);
      if (milestones.includes(year)) { s.milestoneTrack.push("gradschool"); s.milestoneLevel.push(s.level); }
      continue;
    }

    // 4. company rolls
    let cash = 0.0;
    let employerOutcome = "none";
    for (const c of s.companies) {
      if (!c.alive || (!c.kept && !c.employer)) continue;
      const [outcome, amt] = rollCompany(rng, c, year, P);
      if (amt > 0.0) { push(s, year, outcome as EventKind, amt); cash += amt; }
      if (c.employer) {
        employerOutcome = outcome;
        if (outcome === "fail" || outcome === "exit") { c.employer = false; c.leftYear = year; }
      }
    }

    // 5. consequences
    let lostMonths = 0.0;
    if (employerOutcome === "fail") {
      push(s, year, "fail");
      lostMonths = P.layoff.unemploymentMonths;
      s.mult *= 1.0 - P.layoff.reentryHaircut;
      afterJobLoss(rng, s, year, P, stay);
    } else if (employerOutcome === "exit") {
      if (s.track === "founder" && s.level < 4) s.level += P.founder.postExitLevelBump;
      s.track = "corporate";
      s.stage = null;
    } else {
      let hazard: number;
      if (s.track === "founder") hazard = 0.0;
      else if (s.track === "startup") hazard = P.startup[s.stage as Stage].layoffHazard;
      else hazard = P.layoff.annualHazard[s.track as "corporate" | "consulting"];
      if (hazard > 0.0 && rng() < hazard) { // draw: layoff
        push(s, year, "layoff");
        lostMonths = P.layoff.unemploymentMonths;
        s.mult *= 1.0 - P.layoff.reentryHaircut;
        if (s.level > 0) s.level -= 1;
        if (s.track === "startup") leaveEmployer(rng, s, year, P); // draw: exercise
        afterJobLoss(rng, s, year, P, stay);
      } else if (s.track !== "founder" && s.level < 4) {
        const ladder = P.promotion[s.track as Track3];
        if (rng() < 1.0 / ladder.yearsPerRung[s.level]) { // draw: promote
          s.level += 1;
          push(s, year, s.track === "consulting" && s.level === 4 ? "partner" : "promote");
        } else if (s.track === "consulting") {
          if (rng() < (ladder.pCounseledOut as number[])[s.level]) { // draw: counsel
            push(s, year, "counseled");
            s.track = "corporate";
            s.level += 1;
          }
        }
      }
    }

    // 6. pay
    const noise = Math.exp(P.ability.annualNoise * normal(rng)); // draws: u1, u2
    let base: number;
    if (s.track === "founder") {
      base = P.founder.salary * s.mult * noise;
    } else {
      const payTrack = s.track === "startup" ? "corporate" : (s.track as "corporate" | "consulting");
      base = P.start[payTrack][persona] * P.levelMult[payTrack][persona][s.level] * s.ability * s.mult * noise;
      if (s.track === "startup") base *= 1.0 - P.startup[s.stage as Stage].salaryDiscount;
    }
    if (lostMonths > 0.0) base *= 1.0 - lostMonths / 12.0;
    s.realized.push(base + cash);
    if (milestones.includes(year)) { s.milestoneTrack.push(s.track); s.milestoneLevel.push(s.level); }
  }
  return s;
}

export function avgFirst(s: Career, n: number): number {
  let t = 0.0;
  for (let i = 0; i < n; i++) t += s.realized[i];
  return t / n;
}

export function ltv(s: Career): number {
  let t = 0.0;
  for (const x of s.realized) t += x;
  return t;
}

export function demand(track: Track, level: number, P: Params): [number, number] {
  const d = P.demand[track] ?? P.demand.corporate;
  return [d.life[level], d.cash[level]];
}

export const PAYDAY = 100_000.0; // equity cash in a block that earns its own "exited" node

/** Sankey node at a milestone: a real payday, partner, school, or the track. */
export function nodeKey(track: Track, level: number, exitCash: number): NodeKey {
  if (exitCash >= PAYDAY) return "exited";
  if (track === "consulting" && level === 4) return "partner";
  if (track === "gradschool") return "mba";
  return track;
}

export const FORCED: EventKind[] = ["fail", "layoff", "counseled", "exit"];

export function milestoneNodes(s: Career, P: Params): NodeKey[] {
  const ms = P.milestones;
  const keys: NodeKey[] = [];
  let prev = 0;
  ms.forEach((y, i) => {
    let cash = 0.0;
    for (const e of s.events) if (prev < e.year && e.year <= y && (e.kind === "exit" || e.kind === "tender")) cash += e.amount;
    keys.push(nodeKey(s.milestoneTrack[i], s.milestoneLevel[i], cash));
    prev = y;
  });
  return keys;
}

/** The dominant forced event inside each milestone block, or null. */
export function blockForced(s: Career, P: Params): (EventKind | null)[] {
  const out: (EventKind | null)[] = [];
  let prev = 0;
  for (const y of P.milestones) {
    const kinds = s.events.filter((e) => prev < e.year && e.year <= y && FORCED.includes(e.kind)).map((e) => e.kind);
    let pick: EventKind | null = null;
    for (const k of FORCED) if (kinds.includes(k)) { pick = k; break; }
    out.push(pick);
    prev = y;
  }
  return out;
}

export { type CareerEvent };
