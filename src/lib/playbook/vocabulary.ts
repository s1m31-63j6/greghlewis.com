/**
 * What a coach actually types.
 *
 * The index stores `1st-down`, so "first down run" used to find nothing at all
 * — every whitespace token had to be a substring of the haystack, and "first"
 * is not one. This table is the bridge: natural phrases on the left, facet
 * values on the right.
 *
 * Order matters only in that the matcher takes the LONGEST phrase it can, so
 * "zone coverage" resolves to a coverage rather than to the zone running game.
 *
 * A phrase with several entries is an OR — "flag" is both a philosophy and a
 * team size, and a coach typing it means either.
 */

import type { Filters } from "./types.ts";

export interface VocabEntry {
  phrases: string[];
  /** The entry must satisfy at least one of these. */
  any: Filters[];
  /** What the chip says once it has been understood. */
  label: string;
}

const f = (label: string, phrases: string[], ...any: Filters[]): VocabEntry => ({ label, phrases, any });

export const VOCABULARY: VocabEntry[] = [
  // ── down and distance ─────────────────────────────────────────────────────
  f("1st down", ["first down", "1st down", "first and ten", "1st and 10", "first", "1st"], { situation: "1st-down" }),
  f("2nd & short", ["second and short", "2nd short", "2nd and short"], { situation: "2nd-short" }),
  f("2nd & long", ["second and long", "2nd long", "2nd and long"], { situation: "2nd-long" }),
  f("3rd & short", ["third and short", "3rd short", "3rd and short"], { situation: "3rd-short" }),
  f("3rd & medium", ["third and medium", "3rd medium", "3rd and medium"], { situation: "3rd-medium" }),
  f("3rd & long", ["third and long", "3rd long", "3rd and long"], { situation: "3rd-long" }),
  f("4th & short", ["fourth and short", "4th short", "fourth down", "4th down"], { situation: "4th-short" }),
  f("short yardage", ["short yardage"], { situation: "short-yardage" }),
  f("long yardage", ["long yardage"], { situation: "long-yardage" }),

  // ── field zone ────────────────────────────────────────────────────────────
  f("backed up", ["backed up", "own end", "coming out"], { situation: "backed-up" }),
  f("own territory", ["own territory"], { situation: "own-territory" }),
  f("midfield", ["midfield"], { situation: "midfield" }),
  f("plus territory", ["plus territory"], { situation: "plus-territory" }),
  f("red zone", ["red zone", "redzone"], { situation: "red-zone" }),
  f("goal line", ["goal line", "goalline"], { situation: "goal-line" }),
  f("no-run zone", ["no run zone"], { situation: "no-run-zone" }),
  f("sideline", ["sideline", "out of bounds"], { situation: "sideline" }),

  // ── game state ────────────────────────────────────────────────────────────
  f("two minute", ["two minute", "2 minute"], { situation: "two-minute" }),
  f("four minute", ["four minute", "4 minute", "clock kill"], { situation: "four-minute" }),
  f("must score", ["must score", "desperation"], { situation: "must-score" }),
  f("openers", ["opening script", "openers", "script"], { situation: "opening-script" }),
  f("after turnover", ["after turnover", "sudden change"], { situation: "after-turnover" }),

  // ── what it beats ─────────────────────────────────────────────────────────
  f("vs Cover 0", ["cover 0", "cover zero"], { situation: "vs-cover-0" }),
  f("vs Cover 1", ["cover 1", "cover one", "man free"], { situation: "vs-cover-1" }),
  f("vs Cover 2", ["cover 2", "cover two"], { situation: "vs-cover-2" }),
  f("vs Cover 3", ["cover 3", "cover three"], { situation: "vs-cover-3" }),
  f("vs Cover 4", ["cover 4", "cover four", "quarters"], { situation: "vs-cover-4" }),
  f("vs Cover 6", ["cover 6", "cover six"], { situation: "vs-cover-6" }),
  f("vs man", ["man coverage", "man to man", "man"], { situation: "vs-man" }),
  f("vs zone", ["zone coverage", "zone defence", "zone defense"], { situation: "vs-zone" }),
  f("blitz beater", ["blitz beater", "blitz", "pressure", "hot"], { situation: "blitz-beater" }),

  // ── play type ─────────────────────────────────────────────────────────────
  f("run", ["run play", "running play", "run", "runs", "running", "ground"], { type: "run" }),
  f("pass", ["pass play", "pass", "passes", "passing", "throw", "dropback"], { type: "pass" }),
  f("RPO", ["rpo", "run pass option"], { type: "rpo" }),
  f("screen", ["screen", "screens"], { type: "screen" }),
  f("play action", ["play action", "play pass", "boot", "bootleg", "waggle"], { type: "play-action" }),
  f("option", ["option"], { type: "option" }),
  f("trick", ["trick", "gadget", "reverse"], { type: "trick" }),

  // ── philosophy ────────────────────────────────────────────────────────────
  f("Air Raid", ["air raid", "airraid"], { philosophy: "air-raid" }),
  f("power / gap", ["power run", "gap scheme", "power", "gap"], { philosophy: "power-gap" }),
  f("zone run", ["zone run", "zone running", "wide zone", "inside zone", "outside zone"], { philosophy: "zone-run" }),
  f("pro / West Coast", ["west coast", "pro style"], { philosophy: "pro-west-coast" }),
  f("spread", ["spread"], { philosophy: "spread-rpo" }),
  f("flexbone", ["flexbone", "triple option", "veer", "wishbone"], { philosophy: "flexbone" }),
  f("Wing-T", ["wing t", "wingt"], { philosophy: "wing-t" }),

  // ── intended target ───────────────────────────────────────────────────────
  f("quarterback", ["quarterback", "qb"], { target: "QB" }),
  f("running back", ["running back", "tailback", "halfback", "rb"], { target: "RB" }),
  f("fullback", ["fullback", "f back", "fb"], { target: "FV" }),
  f("tight end", ["tight end", "te", "y receiver"], { target: "TE" }),
  f("split end (X)", ["split end", "x receiver"], { target: "XWR" }),
  f("flanker (Z)", ["flanker", "z receiver"], { target: "ZWR" }),
  f("slot (H)", ["slot receiver", "slot", "h receiver"], { target: "SLOT" }),
  f("centre", ["center", "centre", "snapper"], { target: "CTR" }),

  // ── side and team size ────────────────────────────────────────────────────
  f("offense", ["offense", "offence"], { side: "offense" }),
  f("defense", ["defense", "defence"], { side: "defense" }),
  f("7-on-7", ["7v7", "7 on 7", "seven on seven"], { variant: "7man" }),
  f("11-man", ["11 man", "eleven man", "11man"], { variant: "11man" }),
  // Both a philosophy and a team size. A coach typing it means either.
  f("flag", ["flag football", "5v5", "5 on 5", "flag"], { variant: "5flag" }, { philosophy: "flag" }),
  // Same shape: the running game, or a coverage it beats.
  f("zone", ["zone"], { philosophy: "zone-run" }, { situation: "vs-zone" }),
];

/** first → 1st, so a coach can type either. */
const ORDINALS: Record<string, string> = {
  first: "1st", second: "2nd", third: "3rd", fourth: "4th",
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", zero: "0",
};

/** Words that carry no meaning here and would only block a phrase match. */
const NOISE = new Set(["and", "&", "vs", "versus", "the", "a", "for", "on", "to", "against"]);

export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ORDINALS[w] ?? w)
    .filter((w) => !NOISE.has(w));
}

interface CompiledPhrase {
  tokens: string[];
  entry: VocabEntry;
}

/** Longest first, so "zone coverage" wins over "zone". */
const COMPILED: CompiledPhrase[] = VOCABULARY.flatMap((entry) =>
  entry.phrases.map((phrase) => ({ tokens: normalize(phrase), entry })),
)
  .filter((c) => c.tokens.length > 0)
  .sort((a, b) => b.tokens.length - a.tokens.length);

export interface Recognised {
  entry: VocabEntry;
  /** The words it consumed, for the chip and for removing it from the query. */
  matched: string[];
}

/**
 * Pull every phrase this table knows out of a run of words, longest first, and
 * hand back whatever is left over. "first down run" comes back as the 1st-down
 * situation, the run type, and no leftovers.
 */
export function recognise(tokens: string[]): { found: Recognised[]; rest: string[] } {
  const found: Recognised[] = [];
  const rest: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const hit = COMPILED.find(
      (c) =>
        c.tokens.length <= tokens.length - i &&
        c.tokens.every((t, j) => t === tokens[i + j]),
    );
    if (hit) {
      // The same concept twice in one term adds nothing.
      if (!found.some((r) => r.entry === hit.entry)) {
        found.push({ entry: hit.entry, matched: hit.tokens });
      }
      i += hit.tokens.length;
    } else {
      rest.push(tokens[i]);
      i += 1;
    }
  }

  return { found, rest };
}
