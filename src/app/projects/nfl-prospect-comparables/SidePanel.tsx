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
  comps: { node: CompNode; edge: CompEdge }[];
  traitAverages: PositionTraitAverages;
  onClose: () => void;
  onSelectComp: (node: CompNode) => void;
  onChatFocus?: (playerIds: string[]) => void;
}

type Tab = "overview" | "stats" | "ask";

const SUMMARY_TRAIT_KEYS = new Set(["ceiling", "floor"]);
// Always surface the N most-defining traits — never fewer than this even
// for "average across the board" prospects, where the section would
// otherwise collapse and the panel feel half-empty.
const DEFINING_TRAITS_COUNT = 5;

export default function SidePanel({ node, comps, traitAverages, onClose, onSelectComp, onChatFocus }: Props) {
  const open = node !== null;
  const [tab, setTab] = useState<Tab>("overview");

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
                  <h3 className="text-xs uppercase tracking-wider text-stone-500 mb-3">
                    Top comparisons
                  </h3>
                  <ul className="space-y-1.5">
                    {comps.map(({ node: c, edge }) => (
                      <li key={c.id}>
                        <button
                          onClick={() => onSelectComp(c)}
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
                          <span className="text-sm font-mono text-stone-500 shrink-0">
                            {edge.similarity.toFixed(2)}
                          </span>
                        </button>
                      </li>
                    ))}
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
                          “{t.quote}”
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
        </div>
      )}
    </aside>
  );
}
