/**
 * Search. One index, one matcher, two call sites.
 *
 * The site's landing-page Gallery uses an all-tokens-must-match haystack, and
 * that generalizes here with one addition: EVERY FACET VALUE IS FOLDED INTO THE
 * HAYSTACK. So the dropdowns and the text box hit the same string, and typing
 * "air raid 3rd" narrows correctly with nothing selected. Facets still filter
 * exactly; free text runs the same one-line matcher.
 *
 * `buildIndexEntry` is called by the offline build over the library and by the
 * client in a `useMemo` over a coach's own playbook. Same function, so the two
 * indexes cannot drift.
 *
 * No ranking, no fuzzy matching, no stemming. `includes` is forgiving enough
 * that "post" matching "post-snap" reads as a feature rather than a bug.
 */

import { formationById } from "./formations.ts";
import { normalize, recognize } from "./vocabulary.ts";
import type {
  Assignment,
  Filters,
  Play,
  PlayFacets,
  PlayIndexEntry,
  SlotId,
  TargetRole,
} from "./types.ts";

/**
 * Position slot to search facet. FV is the F-back / fullback — note the
 * documented collision, where Air Raid books call the running back F and
 * pro-style books mean the fullback. Both land on FV, which is what a coach
 * searching for "the back who isn't the tailback" actually wants.
 */
const SLOT_TO_TARGET: Partial<Record<SlotId, TargetRole>> = {
  QB: "QB",
  RB: "RB",
  A1: "RB",
  A2: "RB",
  FB: "FV",
  F: "FV",
  Y: "TE",
  X: "XWR",
  Z: "ZWR",
  H: "SLOT",
  V: "SLOT",
  // In flag the center is a fully eligible receiver the instant he snaps it,
  // and at least one play in the library is built entirely around that.
  C: "CTR",
};

export const TARGET_LABELS: Record<TargetRole, string> = {
  QB: "Quarterback",
  RB: "Running back",
  FV: "F-back / fullback",
  TE: "Tight end (Y)",
  XWR: "Split end (X)",
  ZWR: "Flanker (Z)",
  SLOT: "Slot (H)",
  CTR: "Center (flag)",
};

function routeWords(a: Assignment): string {
  switch (a.kind) {
    case "route":
      return [a.route, ...(a.option?.branches.map((b) => b.route) ?? [])].join(" ");
    case "block":
      return a.rule.block;
    case "carry":
      return `run ${a.aim}`;
    case "pass":
      return `dropback ${a.drop}`;
    case "pitch":
      return "pitch";
    case "motion":
      return `motion ${a.motion.type} ${routeWords(a.then)}`;
    default:
      return "";
  }
}

/**
 * Intended target is derived, never authored. A run play takes the carrier; a
 * pass takes the primary plus everyone in the first read's progression, so a
 * play surfaces for its number-two read as well as its number one.
 */
export function deriveTargets(play: Play): TargetRole[] {
  const spec = play.spec;
  if (spec.side === "defense") return [];
  const slots = new Set<SlotId>();
  if (spec.run) slots.add(spec.run.carrier);
  if (spec.primary) slots.add(spec.primary);
  for (const s of spec.reads[0]?.progression ?? []) slots.add(s);
  for (const r of spec.reads) {
    for (const o of [r.ifTake, r.ifNot]) {
      if (!o) continue;
      if ("give" in o) slots.add(o.give);
      if ("pitch" in o) slots.add(o.pitch);
      if ("throw" in o) slots.add(o.throw);
      if ("keep" in o) slots.add("QB");
    }
  }
  const out = new Set<TargetRole>();
  for (const s of slots) {
    const t = SLOT_TO_TARGET[s];
    if (t) out.add(t);
  }
  return [...out];
}

export function deriveFacets(play: Play): PlayFacets {
  const spec = play.spec;
  const formation = formationById(spec.formationId);
  return {
    side: spec.side,
    type: spec.family,
    philosophy: spec.philosophy,
    formation: spec.formationId,
    formationName: formation?.name ?? spec.formationId,
    personnel: spec.personnelId,
    concept: spec.concept,
    variants: spec.variantScope,
    situations: spec.situations,
    target: deriveTargets(play),
    front: spec.frontId,
    coverage: spec.coverageId,
    pressure: spec.pressureId,
  };
}

export function buildIndexEntry(play: Play, playbookId: string | "library"): PlayIndexEntry {
  const spec = play.spec;
  const f = deriveFacets(play);
  const formation = formationById(spec.formationId);

  const h = [
    spec.name,
    ...spec.aliases,
    f.type,
    f.side,
    f.philosophy.replace(/-/g, " "),
    f.formationName,
    ...(formation?.aliases ?? []),
    ...(formation?.tags ?? []),
    f.personnel ?? "",
    f.personnel ? `${f.personnel} personnel` : "",
    f.concept ?? "",
    f.front ?? "",
    f.coverage ?? "",
    f.pressure ?? "",
    spec.run?.scheme ?? "",
    spec.protection ?? "",
    ...f.variants,
    ...f.situations.map((s) => s.replace(/-/g, " ")),
    ...f.target,
    ...f.target.map((t) => TARGET_LABELS[t]),
    ...spec.tags,
    ...Object.values(spec.assignments).map((a) => (a ? routeWords(a) : "")),
    spec.coaching.install ?? "",
    spec.coaching.keys ?? "",
    spec.coaching.vsCoverage ?? "",
    spec.coaching.commentary ?? "",
    play.notes ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return { id: spec.id, name: spec.name, playbookId, f, h };
}

/** Does one entry satisfy one facet constraint? */
function satisfies(e: PlayIndexEntry, f: Filters): boolean {
  if (f.side && e.f.side !== f.side) return false;
  if (f.type && e.f.type !== f.type) return false;
  if (f.philosophy && e.f.philosophy !== f.philosophy) return false;
  if (f.formation && e.f.formation !== f.formation) return false;
  if (f.variant && !e.f.variants.includes(f.variant)) return false;
  if (f.situation && !e.f.situations.includes(f.situation)) return false;
  if (f.target && !e.f.target.includes(f.target)) return false;
  return true;
}

/** One concept the parser understood, and the words it came from. */
export interface Constraint {
  label: string;
  /** Satisfying any one of these satisfies the constraint. */
  any: Filters[];
  matched: string;
}

/**
 * A comma-separated chunk of the query. Everything inside it must hold, and
 * every term must hold — commas are an explicit AND for when a phrase is
 * ambiguous, and the phrase extractor means they are rarely needed.
 */
export interface Term {
  raw: string;
  constraints: Constraint[];
  words: string[];
}

export interface ParsedQuery {
  terms: Term[];
  /** Explicit `key:value` syntax, applied like a rail filter. */
  filters: Filters;
}

const FACET_KEYS = new Set([
  "side", "type", "philosophy", "formation", "variant", "situation", "target",
]);

/**
 * Understands football, not just substrings. "first down run" becomes the
 * 1st-down situation AND the run play type, with no comma needed, because the
 * phrase table is consulted before anything falls through to text matching.
 */
export function parseQuery(raw: string): ParsedQuery {
  const filters: Filters = {};
  const terms: Term[] = [];

  for (const chunk of raw.split(",")) {
    const kept: string[] = [];

    for (const tok of chunk.split(/\s+/).filter(Boolean)) {
      const i = tok.indexOf(":");
      const key = i > 0 ? tok.slice(0, i).toLowerCase() : "";
      if (i > 0 && FACET_KEYS.has(key)) {
        const value = tok.slice(i + 1);
        if (value) {
          // Contained here: the caller only ever reads these back through
          // `satisfies`, which compares them as strings.
          (filters as Record<string, string>)[key] =
            key === "target" ? value.toUpperCase() : value.toLowerCase();
        }
      } else {
        kept.push(tok);
      }
    }

    if (kept.length === 0) continue;
    const { found, rest } = recognize(normalize(kept.join(" ")));
    if (found.length === 0 && rest.length === 0) continue;

    terms.push({
      raw: kept.join(" "),
      constraints: found.map((r) => ({
        label: r.entry.label,
        any: r.entry.any,
        matched: r.matched.join(" "),
      })),
      words: rest,
    });
  }

  return { terms, filters };
}

export function matchPlay(e: PlayIndexEntry, rail: Filters, parsed: ParsedQuery): boolean {
  if (!satisfies(e, rail)) return false;
  if (!satisfies(e, parsed.filters)) return false;

  for (const term of parsed.terms) {
    // Every concept in a term must hold; alternatives inside one concept are
    // an OR, because "flag" legitimately means two different things.
    for (const c of term.constraints) {
      if (!c.any.some((f) => satisfies(e, f))) return false;
    }
    // Anything the table did not recognize still has to appear somewhere —
    // this is what keeps "mesh" and a coach's own notes searchable.
    for (const w of term.words) {
      if (!e.h.includes(w)) return false;
    }
  }

  return true;
}

/**
 * Remove one understood concept from the raw query, so its chip can be
 * dismissed. Matching on the normalized words rather than the literal text is
 * what lets "first down" be removed when the chip says "1st down".
 */
export function withoutConstraint(raw: string, matched: string): string {
  const want = matched.split(" ");
  return raw
    .split(",")
    .map((chunk) => {
      const toks = chunk.split(/\s+/).filter(Boolean);
      const norm = toks.map((t) => normalize(t)[0] ?? "");
      for (let i = 0; i + want.length <= toks.length; i++) {
        if (want.every((w, j) => norm[i + j] === w)) {
          return [...toks.slice(0, i), ...toks.slice(i + want.length)].join(" ");
        }
      }
      return chunk.trim();
    })
    .filter((chunk) => chunk.length > 0)
    .join(", ");
}

/** Counts per facet value for the current result set, so the rail can label. */
export function facetCounts<K extends keyof PlayFacets>(
  entries: PlayIndexEntry[],
  key: K,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const v = e.f[key];
    const values = Array.isArray(v) ? v : v === undefined ? [] : [v];
    for (const item of values) {
      const s = String(item);
      out.set(s, (out.get(s) ?? 0) + 1);
    }
  }
  return out;
}
