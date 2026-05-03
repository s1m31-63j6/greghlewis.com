"use client";

import { useState } from "react";
import PlayerChat from "./PlayerChat";
import RadarChart from "./RadarChart";
import {
  POSITION_COLORS,
  prettyTraitLabel,
  type CompEdge,
  type CompNode,
  type PositionTraitAverages,
} from "./types";

interface Props {
  node: CompNode | null;
  // Compare partner pinned via cmd/shift-click. When set, the panel renders
  // a 2-up layout (dual hero + radar overlay + trait diff) instead of the
  // single-prospect overview/stats/ask tabs.
  compareWith: CompNode | null;
  // Engine edge between the two pinned prospects, when available. Null when
  // the pair isn't in either side's top-K=5 — panel surfaces a "below top-5"
  // tier instead of fabricating a similarity number.
  pairEdge: CompEdge | null;
  comps: { node: CompNode; edge: CompEdge }[];
  traitAverages: PositionTraitAverages;
  onClose: () => void;
  onSelectComp: (node: CompNode) => void;
  // Cmd/shift-click handler on comp list items; mirrors the graph-level
  // compare toggle so the panel can drive compare without a graph click.
  onCompareToggle: (node: CompNode) => void;
  onClearCompare: () => void;
  onChatFocus?: (playerIds: string[]) => void;
}

type Tab = "overview" | "stats" | "ask";

const SUMMARY_TRAIT_KEYS = new Set(["ceiling", "floor"]);
// Always surface the N most-defining traits — never fewer than this even
// for "average across the board" prospects, where the section would
// otherwise collapse and the panel feel half-empty.
const DEFINING_TRAITS_COUNT = 5;

// Sonnet trait extraction anonymized the prospect/school in quotes
// (`<PROSPECT>`, `<SCHOOL>`) so the model couldn't bias on the name. The
// bundle preserves those tokens; we substitute back at render so the quote
// reads as natural English. First name reads less stilted than full name in
// a panel that already has the headshot + heading right above.
function fillQuoteTokens(quote: string, firstName: string, college: string | null): string {
  return quote
    .replaceAll("<PROSPECT>", firstName)
    .replaceAll("<SCHOOL>", college ?? "his school");
}

// Discrete tiers derived from the edge-similarity distribution (p25 0.60,
// p75 0.75, p90 0.81 across visible edges). 3-dot strength reads
// instantly, doesn't surface raw decimals, and stays within the editorial
// palette — see the "no intermediate scores in UI" project rule.
function similarityTier(sim: number): { dots: number; label: string } {
  if (sim >= 0.75) return { dots: 3, label: "Strong match" };
  if (sim >= 0.60) return { dots: 2, label: "Solid match" };
  return { dots: 1, label: "Loose match" };
}

function StrengthDots({ filled, color }: { filled: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full transition-colors"
          style={{ backgroundColor: i < filled ? color : "rgba(20,20,20,0.12)" }}
        />
      ))}
    </span>
  );
}

export default function SidePanel({
  node,
  compareWith,
  pairEdge,
  comps,
  traitAverages,
  onClose,
  onSelectComp,
  onCompareToggle,
  onClearCompare,
  onChatFocus,
}: Props) {
  const open = node !== null;
  const [tab, setTab] = useState<Tab>("overview");
  // Compare mode supersedes the standard tab UI — the 2-up layout has its
  // own sections (overview + radar overlay) and the per-player chat doesn't
  // make sense with two subjects.
  const compareMode = node !== null && compareWith !== null;

  // Canonical axis set per position so every WR's (or QB's, etc.) radar
  // shape is comparable. Missing scores stay null — RadarChart breaks the
  // polygon at that vertex and labels it "N/A" rather than faking a value
  // that would read as a strength or weakness we don't have data on.
  const radarAxes = (() => {
    if (!node) return [];
    const positionAvgs = traitAverages[node.position] ?? {};
    const canonicalKeys = Object.keys(positionAvgs)
      .filter((k) => !SUMMARY_TRAIT_KEYS.has(k))
      .sort();
    return canonicalKeys.map((k) => ({
      label: prettyTraitLabel(k),
      value: node.traits?.[k]?.score ?? null,
    }));
  })();

  // Top N traits ranked by how far they deviate from the position-wide
  // average. Most-defining first regardless of magnitude — even an
  // "average across the board" player gets the trait set that distinguishes
  // them most. No threshold; no separate fallback branch.
  const definingTraitQuotes = (() => {
    if (!node?.traits) return [];
    const avgs = traitAverages[node.position] ?? {};
    return Object.entries(node.traits)
      .filter(([k, v]) => v.quote && v.score != null && !SUMMARY_TRAIT_KEYS.has(k))
      .map(([k, v]) => {
        const score = v.score as number;
        const avg = avgs[k] ?? 3;
        const dev = score - avg;
        return {
          key: k,
          quote: v.quote as string,
          dev,
          absDev: Math.abs(dev),
          direction: dev >= 0 ? ("strength" as const) : ("concern" as const),
        };
      })
      .sort((a, b) => b.absDev - a.absDev)
      .slice(0, DEFINING_TRAITS_COUNT);
  })();

  // Compare-mode derived data. Computed lazily — only when both prospects
  // are pinned. Aligned on the union of canonical trait keys across both
  // positions so cross-position compares (e.g., RB vs WR) still render.
  const compareData = (() => {
    if (!node || !compareWith) return null;
    const aTraits = node.traits ?? {};
    const bTraits = compareWith.traits ?? {};
    const allKeys = Array.from(
      new Set([...Object.keys(aTraits), ...Object.keys(bTraits)]),
    )
      .filter((k) => !SUMMARY_TRAIT_KEYS.has(k))
      .sort();
    const aAxes = allKeys.map((k) => ({
      label: prettyTraitLabel(k),
      value: aTraits[k]?.score ?? null,
    }));
    const bAxes = allKeys.map((k) => ({
      label: prettyTraitLabel(k),
      value: bTraits[k]?.score ?? null,
    }));
    // Where they DIVERGE: both have a score, sorted by absolute delta.
    type Divergence = {
      key: string;
      aScore: number;
      bScore: number;
      delta: number;
      aQuote: string | null;
      bQuote: string | null;
    };
    const diverges: Divergence[] = allKeys
      .map((k) => {
        const a = aTraits[k]?.score;
        const b = bTraits[k]?.score;
        if (a == null || b == null) return null;
        return {
          key: k,
          aScore: a,
          bScore: b,
          delta: a - b,
          aQuote: aTraits[k]?.quote ?? null,
          bQuote: bTraits[k]?.quote ?? null,
        } as Divergence;
      })
      .filter((d): d is Divergence => d !== null && Math.abs(d.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 4);
    // Where they OVERLAP: both score >= 3.5 AND delta < 1 (both real
    // strengths AND aligned). Surfaces what they share, not just what's
    // average for both.
    type Overlap = { key: string; minScore: number };
    const overlaps: Overlap[] = allKeys
      .map((k) => {
        const a = aTraits[k]?.score;
        const b = bTraits[k]?.score;
        if (a == null || b == null) return null;
        if (Math.abs(a - b) >= 1) return null;
        if (Math.min(a, b) < 3.5) return null;
        return { key: k, minScore: Math.min(a, b) };
      })
      .filter((d): d is Overlap => d !== null)
      .sort((a, b) => b.minScore - a.minScore)
      .slice(0, 4);
    return { aAxes, bAxes, diverges, overlaps };
  })();

  const physicalRows: { label: string; value: string | number | null }[] = node
    ? [
        { label: "Position", value: node.position },
        { label: "College", value: node.bio.college },
        {
          label: "Height",
          value:
            node.bio.height_in != null
              ? `${Math.floor(node.bio.height_in / 12)}'${node.bio.height_in % 12}"`
              : null,
        },
        {
          label: "Weight",
          value: node.bio.weight_lb != null ? `${node.bio.weight_lb} lb` : null,
        },
        { label: "Age at draft", value: node.bio.age_at_draft },
        { label: "Draft year", value: node.draft.year },
        {
          label: "Draft slot",
          value:
            node.draft.round && node.draft.pick
              ? `R${node.draft.round} · #${node.draft.pick}`
              : null,
        },
        { label: "Drafted by", value: node.draft.team },
        { label: "Outcome", value: node.outcome_class },
        { label: "Career AV", value: node.career_av },
        { label: "Pro Bowls", value: node.pro_bowls },
      ]
    : [];

  return (
    <aside
      className={`absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white/95 border-l border-stone-200 backdrop-blur-md shadow-xl transition-transform duration-300 ease-out overflow-y-auto z-20 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      {node && (
        <div className="p-6 text-stone-900">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-stone-500 hover:text-stone-900 text-sm"
            aria-label="Close panel"
          >
            ✕
          </button>

          {compareMode && compareWith && compareData && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs uppercase tracking-wider text-stone-500">
                  Comparing
                </h2>
                <button
                  onClick={onClearCompare}
                  className="text-[11px] text-stone-500 hover:text-stone-900 transition-colors"
                  title="Clear compare partner"
                >
                  ← back to {node.name.split(" ")[0]}
                </button>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-4">
                {[node, compareWith].map((p, idx) => (
                  <div
                    key={p.id}
                    className={`flex flex-col items-center text-center ${idx === 1 ? "col-start-3" : ""}`}
                  >
                    {p.headshot_candidates[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.headshot_candidates[0]}
                        alt={p.name}
                        className="w-16 h-16 rounded-full object-cover bg-stone-100"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold text-stone-700"
                        style={{ backgroundColor: POSITION_COLORS[p.position] + "20" }}
                      >
                        {p.name
                          .split(" ")
                          .map((s) => s[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                    )}
                    <div className="mt-2 text-sm font-semibold leading-tight">
                      {p.name}
                    </div>
                    <div
                      className="text-[11px] mt-0.5"
                      style={{ color: POSITION_COLORS[p.position] }}
                    >
                      {p.position}
                      {p.bio.college && (
                        <span className="text-stone-500"> · {p.bio.college}</span>
                      )}
                    </div>
                    {p.outcome_class && (
                      <span className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                        {p.outcome_class}
                      </span>
                    )}
                  </div>
                ))}
                <span className="col-start-2 text-stone-400 text-xs font-medium tracking-wider">
                  vs
                </span>
              </div>

              <div className="flex items-center justify-center gap-2 py-2 border-y border-stone-100 mb-5">
                <span className="text-[10px] uppercase tracking-wider text-stone-500">
                  Engine match
                </span>
                {pairEdge ? (() => {
                  const tier = similarityTier(pairEdge.similarity);
                  return (
                    <>
                      <StrengthDots
                        filled={tier.dots}
                        color={POSITION_COLORS[node.position]}
                      />
                      <span className="text-xs text-stone-700">{tier.label}</span>
                    </>
                  );
                })() : (
                  <>
                    <StrengthDots filled={0} color={POSITION_COLORS[node.position]} />
                    <span className="text-xs text-stone-500 italic">
                      Outside top-5 comp set
                    </span>
                  </>
                )}
              </div>

              {(compareData.aAxes.some((a) => a.value !== null) ||
                compareData.bAxes.some((a) => a.value !== null)) && (
                <section className="mb-6">
                  <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-2">
                    Trait shape
                  </h3>
                  <RadarChart
                    series={[
                      {
                        axes: compareData.aAxes,
                        color: POSITION_COLORS[node.position],
                      },
                      {
                        axes: compareData.bAxes,
                        color: POSITION_COLORS[compareWith.position],
                      },
                    ]}
                    max={5}
                  />
                  <div className="mt-2 flex justify-center gap-4 text-[11px]">
                    {[node, compareWith].map((p) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1.5 text-stone-600"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: POSITION_COLORS[p.position] }}
                        />
                        {p.name.split(" ")[0]}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {compareData.diverges.length > 0 && (
                <section className="mb-6">
                  <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">
                    Where they diverge
                  </h3>
                  <ul className="space-y-2.5">
                    {compareData.diverges.map((d) => {
                      const aWins = d.delta > 0;
                      const stronger = aWins ? node : compareWith;
                      const weaker = aWins ? compareWith : node;
                      const strongerQuote = aWins ? d.aQuote : d.bQuote;
                      return (
                        <li key={d.key} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-stone-800">
                              {prettyTraitLabel(d.key)}
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] text-stone-500 shrink-0">
                              <span
                                className="font-medium"
                                style={{ color: POSITION_COLORS[stronger.position] }}
                              >
                                {stronger.name.split(" ")[0]}
                              </span>
                              <span aria-hidden>›</span>
                              <span>{weaker.name.split(" ")[0]}</span>
                            </span>
                          </div>
                          {strongerQuote && (
                            <p className="text-xs text-stone-500 mt-1 italic leading-snug">
                              “{fillQuoteTokens(
                                strongerQuote,
                                stronger.name.split(" ")[0],
                                stronger.bio.college,
                              )}”
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {compareData.overlaps.length > 0 && (
                <section className="mb-6">
                  <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">
                    Where they overlap
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {compareData.overlaps.map((o) => (
                      <li
                        key={o.key}
                        className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-700"
                      >
                        {prettyTraitLabel(o.key)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="flex gap-2 pt-3 border-t border-stone-100">
                <button
                  onClick={() => onSelectComp(compareWith)}
                  className="flex-1 text-xs px-3 py-2 rounded-md bg-stone-900 hover:bg-stone-700 text-white transition-colors"
                >
                  Open {compareWith.name.split(" ")[0]} →
                </button>
                <button
                  onClick={onClearCompare}
                  className="text-xs px-3 py-2 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!compareMode && (
            <>

          <div className="flex items-start gap-4">
            {node.headshot_candidates[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={node.headshot_candidates[0]}
                alt={node.name}
                className="w-20 h-20 rounded-full object-cover bg-stone-100"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-semibold text-stone-700"
                style={{ backgroundColor: POSITION_COLORS[node.position] + "20" }}
              >
                {node.name
                  .split(" ")
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 2)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">{node.name}</h2>
              <div className="text-sm text-stone-600 mt-0.5">
                <span
                  className="font-medium"
                  style={{ color: POSITION_COLORS[node.position] }}
                >
                  {node.position}
                </span>
                {node.bio.college && <> · {node.bio.college}</>}
              </div>
              <div className="text-xs text-stone-500 mt-1.5 flex items-center gap-2">
                {node.draft.team_logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={node.draft.team_logo_url}
                    alt={node.draft.team ?? ""}
                    className="w-5 h-5"
                  />
                )}
                {node.draft.year && node.draft.pick ? (
                  <span>
                    {node.draft.year} · Round {node.draft.round} · Pick {node.draft.pick}
                  </span>
                ) : (
                  <span>Class of {node.draft.year}</span>
                )}
                {node.outcome_class && (
                  <span className="ml-auto px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                    {node.outcome_class}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-1 border-b border-stone-200">
            {([
              { id: "overview", label: "Overview" },
              { id: "stats", label: "Stats" },
              { id: "ask", label: "Ask" },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors ${
                  tab === t.id
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-500 hover:text-stone-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="mt-5">
              {comps.length > 0 && (
                <section>
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h3 className="text-xs uppercase tracking-wider text-stone-500">
                      Top comparisons
                    </h3>
                    <span className="text-[10px] text-stone-400 italic">
                      ⌘-click to compare
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {comps.map(({ node: c, edge }) => {
                      const tier = similarityTier(edge.similarity);
                      // Cmd/ctrl/shift-click pins as compare partner instead
                      // of swapping the primary — keeps the user "anchored"
                      // on the prospect they were exploring.
                      const handleClick = (
                        e: React.MouseEvent<HTMLButtonElement>,
                      ) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) {
                          onCompareToggle(c);
                        } else {
                          onSelectComp(c);
                        }
                      };
                      return (
                        <li key={c.id}>
                          <button
                            onClick={handleClick}
                            title="Click to open · ⌘-click to compare"
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded hover:bg-stone-100 text-left transition-colors"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: POSITION_COLORS[c.position] }}
                              />
                              <span className="truncate">{c.name}</span>
                              {c.outcome_class && (
                                <span className="text-xs text-stone-500 shrink-0">
                                  · {c.outcome_class}
                                </span>
                              )}
                            </span>
                            <span
                              className="shrink-0"
                              title={tier.label}
                              aria-label={tier.label}
                            >
                              <StrengthDots
                                filled={tier.dots}
                                color={POSITION_COLORS[c.position]}
                              />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {definingTraitQuotes.length > 0 && (
                <section className="mt-6">
                  <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">
                    Defining traits
                  </h3>
                  <ul className="space-y-3">
                    {definingTraitQuotes.map((t) => (
                      <li key={t.key} className="text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-medium tracking-wider uppercase px-1.5 py-0.5 rounded bg-stone-100 ${
                              t.direction === "strength"
                                ? "text-sky-800/85"
                                : "text-amber-900/85"
                            }`}
                          >
                            {t.direction === "strength" ? "↑ Strength" : "↓ Concern"}
                          </span>
                          <span className="text-stone-800">
                            {prettyTraitLabel(t.key)}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-1 italic leading-snug">
                          “{fillQuoteTokens(
                            t.quote,
                            node.name.split(" ")[0],
                            node.bio.college,
                          )}”
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {tab === "stats" && (
            <div className="mt-5">
              {radarAxes.some((a) => a.value !== null) ? (
                <section>
                  <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-2">
                    Trait shape
                  </h3>
                  <RadarChart
                    axes={radarAxes}
                    max={5}
                    color={POSITION_COLORS[node.position]}
                  />
                </section>
              ) : (
                <p className="text-sm text-stone-500 italic">
                  Trait scouting unavailable for this prospect.
                </p>
              )}

              <section className="mt-6">
                <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">
                  Profile
                </h3>
                <dl className="text-sm divide-y divide-stone-200">
                  {physicalRows.map((r) => (
                    <div
                      key={r.label}
                      className="flex justify-between gap-4 py-1.5"
                    >
                      <dt className="text-stone-500">{r.label}</dt>
                      <dd className="text-stone-800 text-right">
                        {r.value !== null && r.value !== undefined && r.value !== ""
                          ? r.value
                          : "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-stone-500 mt-4 italic">
                  Combine measurables (40-yard, vertical, etc.) coming in next
                  data refresh.
                </p>
              </section>
            </div>
          )}

          {tab === "ask" && (
            <div className="mt-5">
              <PlayerChat
                key={node.id}
                playerId={node.id}
                playerName={node.name}
                onFocus={onChatFocus}
              />
            </div>
          )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
