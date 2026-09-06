/** Shared shapes for the career engine. Mirrors projects/career-paths/engine.py. */

export type Track3 = "startup" | "corporate" | "consulting";
export type Track = Track3 | "gradschool" | "founder";
export type Stage = "seed" | "seriesAB" | "growth" | "bootstrapped" | "pe";
export type Persona = "technical" | "nontechnical";

export const TRACKS3: Track3[] = ["startup", "corporate", "consulting"];
export const STAGES: Stage[] = ["seed", "seriesAB", "growth", "bootstrapped", "pe"];

export type EventKind =
  | "fail" | "exit" | "tender" | "layoff" | "promote" | "partner"
  | "counseled" | "mba_done" | "switch" | "found" | "mba";

export interface CareerEvent { year: number; kind: EventKind; amount: number }

export interface Company {
  stage: Stage;
  hiredYear: number;
  pct: number;
  age: number;
  alive: boolean;
  employer: boolean;
  kept: boolean;
  failed: boolean;
  founder: boolean;
  leftYear: number | null;
}

export interface Career {
  persona: Persona;
  track: Track;
  level: number;
  ability: number;
  mult: number;
  schoolLeft: number;
  landing: Track3 | null;
  stage: Stage | null;
  companies: Company[];
  realized: number[];
  events: CareerEvent[];
  milestoneTrack: Track[];
  milestoneLevel: number[];
  /** Years at the current employer before this year. */
  tenure: number;
  /** Invested savings, real dollars. */
  wealth: number;
  wealthByYear: number[];
  /** Employer retirement contributions received each year. */
  retireByYear: number[];
}

/** A `Sourced` leaf in params.json. */
export interface Sourced<T = number> {
  value: T;
  source: string;
  kind: "measured" | "estimated" | "derived";
  url?: string;
  note?: string;
}

interface StageParams {
  failHazard: number; exitHazard: number; layoffHazard: number;
  exitMedian: number; exitSigma: number; prefStack: number;
  grantPctFD: Record<Persona, number>;
  strikeFrac: number; salaryDiscount: number; secondaryProb: number;
  pExerciseOnLeave: number; yearsPerRound: number; dilutionPerRound: number; graduationProb: number;
}

/** The engine's view: every Sourced leaf collapsed to its value. */
export interface Params {
  horizon: number;
  plinkoYears: number;
  milestones: number[];
  discountRate: number;
  ability: { sigma: number; annualNoise: number };
  start: Record<"corporate" | "consulting", Record<Persona, number>>;
  levelMult: Record<"corporate" | "consulting", Record<Persona, number[]>>;
  promotion: Record<Track3, { yearsPerRung: number[]; pCounseledOut?: number[] }>;
  layoff: { annualHazard: Record<"corporate" | "consulting", number>; unemploymentMonths: number; reentryHaircut: number };
  startup: Record<Stage, StageParams>;
  vestYears: number;
  cliffYears: number;
  secondaryFrac: number;
  stageMix: Record<Stage, number>;
  rejoinStartup: number;
  gradschool: { years: number; annualCost: number; postSalaryMult: number; landing: Record<Track3, number> };
  founder: { salary: number; pctFD: number; postExitLevelBump: number; failMult: number };
  choice: Record<Track3 | "founder", Record<string, number>> & { decayPerMilestone: number };
  demand: Record<Track, { life: number[]; cash: number[] }>;
  benefits: {
    employerRetirement: {
      corporate: Record<Persona, number>;
      consulting: Record<Persona, number>;
      startup: Record<Stage, number>;
    };
    matchVestYears: number;
    savingsBands: { upTo: number; rate: number }[];
    windfallSavingsRate: number;
    realReturn: number;
  };
}

export interface SimOptions {
  stage?: Stage | null;
  pinned?: Record<number, string> | null;
  stay?: boolean;
  horizon?: number;
}

export type NodeKey = Track | "mba" | "partner" | "exited";
