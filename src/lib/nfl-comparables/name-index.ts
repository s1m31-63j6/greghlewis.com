// Server-side name resolver, ported from
// projects/nfl-prospect-comparables/engine/src/engine/rag/name_index.py.
// The Python version reads JSONL profiles from S3; here we use the same
// comp_graph.json bundle that the client loads, so dev mode doesn't need
// AWS credentials just to look up a name.

import fs from "node:fs/promises";
import path from "node:path";

interface PlayerEntry {
  playerId: string;
  name: string;
  position: string;
  cohort: string;
}

const COHORT_PRIORITY: Record<string, number> = {
  prediction_2026: 0,
  validation_2021_2025: 1,
  training_2014_2020: 2,
};

// Mirrors _STOPWORDS in name_index.py — capitalizable filler that shouldn't
// fuzzy-match against player names ("Best 2026 RB?" → "Best" is capitalized
// but isn't a name).
const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "is", "tell", "me", "about",
  "what", "who", "how", "why", "where", "when", "his", "her", "their",
  "show", "give", "can", "you", "from", "for", "as", "to", "with",
  "qb", "rb", "wr", "te", "qbs", "rbs", "wrs", "tes",
  "quarterback", "quarterbacks", "running", "back", "backs", "wide",
  "receiver", "receivers", "tight", "end", "ends", "wideout", "wideouts",
  "draft", "drafts", "prospect", "prospects", "profile", "profiles",
  "report", "reports", "scouting",
  "comp", "comps", "comparable", "compare", "comparison", "comparing",
  "best", "top", "find", "list", "good", "bad", "describe", "summary",
  "summarize", "explain", "look", "looks", "looking", "rank", "rate",
  "rated", "year", "years", "season", "seasons", "class", "classes",
  "vs", "versus", "between", "than",
  // Superlatives + quantifiers — capitalized at sentence start, easily
  // misroute via fuzzy match ("Most" → Zack Moss, "More" → ?).
  "most", "least", "more", "less", "much", "many", "next",
  "physical", "athletic", "explosive", "fastest", "strongest", "biggest",
  "highest", "lowest", "weakest", "smartest", "tallest", "longest",
  "tougher", "better", "worse", "older", "younger",
  // Verb-ish words that aren't names but read as cap tokens.
  "plays", "playing", "played", "performs", "produces",
]);

let _index: PlayerEntry[] | null = null;

async function loadIndex(): Promise<PlayerEntry[]> {
  if (_index) return _index;
  const bundlePath = path.join(
    process.cwd(),
    "public/projects/nfl-prospect-comparables/comp_graph.json",
  );
  const raw = await fs.readFile(bundlePath, "utf-8");
  const data = JSON.parse(raw) as {
    nodes: { id: string; name: string; position: string; cohort: string }[];
  };
  // Sort longest-name-first so substring search is greedy ("Marvin Harrison Jr"
  // wins over "Marvin Harrison").
  _index = data.nodes
    .filter((n) => n.id && n.name)
    .map((n) => ({
      playerId: n.id,
      name: n.name,
      position: n.position,
      cohort: n.cohort,
    }))
    .sort((a, b) => {
      const lenDiff = b.name.length - a.name.length;
      if (lenDiff !== 0) return lenDiff;
      return (
        (COHORT_PRIORITY[a.cohort] ?? 99) - (COHORT_PRIORITY[b.cohort] ?? 99)
      );
    });
  return _index;
}

// Generational suffixes commonly trailing player names. Strip them so
// `lastName("Marvin Harrison Jr.")` returns "Harrison" not "Jr." — the
// latter wrecks last-name matching for any junior/senior/numeral player.
const NAME_SUFFIXES = new Set([
  "jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v",
]);

function nameParts(name: string): string[] {
  const parts = name.split(/\s+/).filter(Boolean);
  // Drop trailing suffix(es). "John Smith Jr. III" → ["John", "Smith"].
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
    parts.pop();
  }
  return parts;
}

function lastName(name: string): string {
  const parts = nameParts(name);
  return parts[parts.length - 1] ?? "";
}

function firstName(name: string): string {
  const parts = nameParts(name);
  return parts[0] ?? "";
}

function queryTokens(query: string): Set<string> {
  // Match hyphenated runs as single tokens so hyphenated player names
  // (Smith-Schuster, Amon-Ra) survive as a unit, but ALSO split each
  // hyphenated token into its parts and keep both — otherwise queries
  // like "Saquon-style runner" produce only "saquon-style" and the
  // bare "saquon" never matches Saquon Barkley's first name.
  const out = new Set<string>();
  const matches = query.toLowerCase().match(/[a-z][a-z'\-]+/g) ?? [];
  for (const tok of matches) {
    if (tok.length >= 3 && !STOPWORDS.has(tok)) out.add(tok);
    if (tok.includes("-")) {
      for (const part of tok.split("-")) {
        if (part.length >= 3 && !STOPWORDS.has(part)) out.add(part);
      }
    }
  }
  return out;
}

function capitalizedTokens(query: string): string[] {
  return (query.match(/[A-Z][A-Za-z'\-]+/g) ?? [])
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function levenshteinAtMost(a: string, b: string, maxDist: number): boolean {
  if (Math.abs(a.length - b.length) > maxDist) return false;
  if (a === b) return true;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i, ...new Array<number>(b.length).fill(0)];
    let minRow = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < minRow) minRow = curr[j];
    }
    if (minRow > maxDist) return false;
    prev = curr;
  }
  return prev[b.length] <= maxDist;
}

function rankByCohort(entries: PlayerEntry[]): PlayerEntry[] {
  return [...entries].sort((a, b) => {
    const c =
      (COHORT_PRIORITY[a.cohort] ?? 99) - (COHORT_PRIORITY[b.cohort] ?? 99);
    if (c !== 0) return c;
    return b.name.length - a.name.length;
  });
}

export interface ResolvedPlayers {
  // Distinct players named in the query, ordered by their first appearance.
  // Each item is one resolution group (a player + any cohort namesakes).
  groups: { primary: PlayerEntry; candidates: PlayerEntry[]; tier: string }[];
}

// Words/punctuation that signal the user is naming MULTIPLE prospects in
// one query ("Compare Stroud and Mendoza", "Stroud vs Mendoza", "Stroud,
// Mendoza"). When this signal is absent and the user typed a 2+ cap-token
// phrase, we treat it as a single full-name reference and apply strict
// matching — the difference between "Caleb Downs" (one name, no match in
// pool, should fall through) and "Caleb and Downs" (two players).
const MULTI_PROSPECT_SEPARATORS = /\b(and|vs\.?|versus|or|compare|comparing|between)\b|[,&\/]/i;

// Resolve ALL distinct players named in the query (Python's resolve_name only
// returned the first hit). For "compare Stroud and Mendoza" we need both
// players surfaced so the chat path can do per-player retrieval.
export async function resolveNames(query: string): Promise<ResolvedPlayers> {
  const index = await loadIndex();
  const q = query.toLowerCase();
  const groups: ResolvedPlayers["groups"] = [];
  const seen = new Set<string>();
  const isMultiProspectQuery = MULTI_PROSPECT_SEPARATORS.test(query);

  // Tier 1: full-name substring. Greedy longest-first so "Marvin Harrison Jr"
  // doesn't get shadowed by "Marvin Harrison". Trailing punctuation is
  // stripped from the candidate name so "Marvin Harrison Jr." matches a
  // user query of "Marvin Harrison Jr" (no period). The matched-span
  // removal still uses the normalized form for consistency.
  let consumed = q;
  for (const e of index) {
    const lc = e.name.toLowerCase().replace(/[.,]+$/, "").trim();
    if (consumed.includes(lc) && !seen.has(e.playerId)) {
      // Group with cohort namesakes (same exact name, different cohort).
      const namesakes = index.filter(
        (x) => x.name.toLowerCase().replace(/[.,]+$/, "").trim() === lc && !seen.has(x.playerId),
      );
      const ranked = rankByCohort(namesakes);
      for (const x of ranked) seen.add(x.playerId);
      groups.push({
        primary: ranked[0],
        candidates: ranked,
        tier: namesakes.length > 1 ? "ambiguous_full" : "exact",
      });
      // Remove the matched span so longer-named players don't double-count.
      consumed = consumed.split(lc).join("");
    }
  }
  if (groups.length > 0) return { groups };

  // Tier 2: last-name token match (only if no full-name hit at all — this
  // tier is noisier, e.g. "Williams" matches dozens of players).
  const tokens = queryTokens(query);
  // Set of surnames in the pool — used by the first-name-consistency check
  // below to distinguish "user typed a first name we should honor" from
  // "user typed another player's last name (e.g. multi-prospect compare)".
  const surnameSet = new Set(
    index.map((e) => lastName(e.name).toLowerCase()).filter((s) => s.length >= 3),
  );
  if (tokens.size > 0) {
    const lastHits = index.filter((e) => {
      const ln = lastName(e.name).toLowerCase();
      return ln.length >= 3 && tokens.has(ln);
    });
    const firstHits = index.filter((e) => {
      const fn = firstName(e.name).toLowerCase();
      return fn.length >= 5 && tokens.has(fn);
    });
    // Pair last+first when same player matches both tokens.
    const firstIds = new Set(firstHits.map((e) => e.playerId));
    const both = lastHits.filter((e) => firstIds.has(e.playerId));
    // Reject wrong-first-name fallback: if the user wrote a clearly-name-shaped
    // token alongside the matched surname (e.g. "Caleb" in "Caleb Downs") and
    // it doesn't match the candidate's first name, drop the hit — otherwise
    // we'd confidently route a different prospect's profile to the wrong
    // question. We exclude tokens that ARE another player's surname (so
    // "Compare Stroud and Mendoza" doesn't treat "Mendoza" as Stroud's
    // would-be first name).
    const queryCapTokens = capitalizedTokens(query);
    const filteredLastHits =
      both.length > 0
        ? lastHits  // both first+last matched; trust the pairing
        : lastHits.filter((e) => {
            const fn = firstName(e.name).toLowerCase();
            const ln = lastName(e.name).toLowerCase();
            // First-name candidates: tokens we'd expect to match the player's
            // first name. Exclude their own surname; in multi-prospect queries
            // also exclude any token that's another player's surname (so
            // "Compare Stroud and Mendoza" doesn't treat "Mendoza" as Stroud's
            // would-be first name). In single-name queries we DO require all
            // other cap tokens to match — that's how we catch "Caleb Downs"
            // wrong-routing to Josh Downs.
            const firstNameCandidates = queryCapTokens.filter((t) => {
              if (t === ln) return false;
              if (isMultiProspectQuery && surnameSet.has(t)) return false;
              return true;
            });
            if (firstNameCandidates.length === 0) return true;
            return firstNameCandidates.every(
              (t) =>
                fn.startsWith(t) ||
                t.startsWith(fn) ||
                levenshteinAtMost(t, fn, 1),
            );
          });
    // Single-name query that found no validated last-name match → don't fall
    // back to first-name-only hits; that just trades one misroute for another
    // ("Caleb Downs" routing to Caleb Williams). Return empty so the chat
    // falls through to unfiltered retrieval.
    const singleNameTyped = !isMultiProspectQuery && queryCapTokens.length >= 2;
    const hits =
      both.length > 0
        ? both
        : filteredLastHits.length > 0
          ? filteredLastHits
          : singleNameTyped
            ? []
            : firstHits;
    if (hits.length > 0) {
      // Group hits by last-name (one group per surname). For a query like
      // "Stroud" with one Stroud in the index, that's one group of one.
      const byLast = new Map<string, PlayerEntry[]>();
      for (const h of hits) {
        const k = lastName(h.name).toLowerCase();
        const arr = byLast.get(k) ?? [];
        arr.push(h);
        byLast.set(k, arr);
      }
      for (const [, ents] of byLast) {
        const ranked = rankByCohort(ents);
        groups.push({
          primary: ranked[0],
          candidates: ranked,
          tier: ents.length === 1 ? "exact" : "last_name",
        });
      }
      return { groups };
    }
  }

  // Tier 3: fuzzy. Lev≤1 against capitalized tokens that LOOK like names.
  // For single-name queries (e.g. "Caleb Downs", no multi-prospect cue),
  // require ALL tokens to fuzzy-match the same candidate — otherwise a
  // partial Caleb-only or Downs-only fuzzy hit pulls the wrong player.
  // For multi-prospect queries, a token can also be excused if it's
  // another player's known surname.
  const capTokens = capitalizedTokens(query);
  const requireAllTokens = capTokens.length >= 2;
  if (capTokens.length > 0) {
    const fuzzy = new Map<string, PlayerEntry>();
    for (const e of index) {
      const ln = lastName(e.name).toLowerCase();
      const fn = firstName(e.name).toLowerCase();
      const matchesMe = (tok: string) =>
        (ln.length >= 4 && levenshteinAtMost(tok, ln, 1)) ||
        (fn.length >= 4 && levenshteinAtMost(tok, fn, 1));
      const tokenOk = (tok: string) =>
        matchesMe(tok) ||
        (isMultiProspectQuery && surnameSet.has(tok) && tok !== ln);
      const passes = requireAllTokens
        ? capTokens.every(tokenOk) && capTokens.some(matchesMe)
        : capTokens.some(matchesMe);
      if (passes) {
        fuzzy.set(e.playerId, e);
      }
    }
    if (fuzzy.size > 0) {
      const ranked = rankByCohort(Array.from(fuzzy.values())).slice(0, 5);
      groups.push({ primary: ranked[0], candidates: ranked, tier: "fuzzy" });
    }
  }

  return { groups };
}

// Given an answer string, return distinct player_ids whose names appear in
// it. Greedy longest-first for full names ("Marvin Harrison Jr" beats
// "Marvin Harrison"), then a second pass over UNIQUE last names so answers
// that say "Mendoza" rather than "Fernando Mendoza" still match. Common
// surnames (Williams, Smith) match many players, so they're skipped to
// avoid false-positive viz highlights.
export async function extractMentions(answer: string): Promise<string[]> {
  const index = await loadIndex();
  const seen = new Set<string>();
  const ids: string[] = [];
  let consumed = answer.toLowerCase();

  for (const e of index) {
    const lc = e.name.toLowerCase();
    if (consumed.includes(lc) && !seen.has(e.playerId)) {
      seen.add(e.playerId);
      ids.push(e.playerId);
      consumed = consumed.split(lc).join("");
    }
  }

  const lastNameCounts = new Map<string, number>();
  for (const e of index) {
    const ln = lastName(e.name).toLowerCase();
    if (ln.length >= 4) {
      lastNameCounts.set(ln, (lastNameCounts.get(ln) ?? 0) + 1);
    }
  }
  // Word-boundary scan against the lowercased answer so "Stroud" matches
  // but "stroudly" wouldn't (none of these exist, but it's defensive).
  const tokens = new Set(consumed.match(/[a-z][a-z'\-]+/g) ?? []);
  for (const e of index) {
    if (seen.has(e.playerId)) continue;
    const ln = lastName(e.name).toLowerCase();
    if (ln.length < 4) continue;
    if ((lastNameCounts.get(ln) ?? 0) !== 1) continue; // skip ambiguous surnames
    if (tokens.has(ln)) {
      seen.add(e.playerId);
      ids.push(e.playerId);
    }
  }
  return ids;
}

export async function lookupPlayer(playerId: string): Promise<PlayerEntry | null> {
  const index = await loadIndex();
  return index.find((e) => e.playerId === playerId) ?? null;
}
