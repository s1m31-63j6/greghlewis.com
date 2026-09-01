"use client";

/**
 * The printed sheet.
 *
 * Reads the league config and this viewer's stars and removals from the shared
 * store, so the sheet reflects YOUR keepers and YOUR targets. That deliberately
 * diverges from the playbook's print route, which loads a document from
 * DynamoDB by id: there is no server copy of a draft sheet.
 *
 * It does NOT fire window.print() on arrival. Nobody should commit paper to a
 * sheet they have not looked at first.
 *
 * LAYOUT: one position per column, always. An earlier version packed tiers
 * greedily across the page to squeeze everything onto one sheet, which put two
 * positions in a column and made the reader hunt. Running to a second page is
 * the cheaper cost.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { buildBoard } from "@/lib/draft-sheet/board";
import { PLATFORMS as ALL_PLATFORMS } from "@/lib/draft-sheet/types";

/**
 * How many numeric lanes a printed column can hold.
 *
 * Measured, not chosen. A 2.5in column minus its padding leaves 2.44in; the
 * star, positional rank, team·bye, ECR and trend glyph claim 0.75in of that,
 * and each lane costs 0.17in plus a 0.022in gap. Four lanes leave the name
 * 0.812in against the 0.781in the longest name on the board needs — about a
 * thirtieth of an inch of slack. A fifth takes the name to 0.620in, and no
 * amount of shuffling the other columns buys that back.
 */
const MAX_PRINT_LANES = 4;
import type { Adp, Player } from "@/lib/draft-sheet/types";
import { useSheetState } from "../useSheetState";

/*
 * Rows that fit one column at 0.13in, after the fixed furniture and the
 * per-column header and key.
 *
 *   portrait  10.20 - head 0.42 - foot 0.28 - tracker 0.56 = 8.94in
 *             ...minus column head 0.19 and key 0.13       = 8.62in -> 66 rows
 *   landscape  7.80 - the same furniture                   = 5.94in -> 45 rows
 *
 * The tracker's height is reserved on every page even though it only prints on
 * the last one, so every column on every page has identical geometry.
 */
const ROWS = { portrait: 66, landscape: 45 };
/** Column count per page. Each column is 2.5in, which is what four ADP columns need. */
const COLS = { portrait: 3, landscape: 4 };

const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DST"] as const;

export function PrintBoard({
  layout,
  tracker,
}: {
  layout: "portrait" | "landscape";
  tracker: boolean;
  adpSource: string;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [adp, setAdp] = useState<Map<string, Adp>>(new Map());
  const [ready, setReady] = useState(false);
  const state = useSheetState();

  useEffect(() => {
    Promise.all([
      fetch("/draft-sheet/players.json").then((r) => r.json()),
      fetch("/draft-sheet/adp.json").then((r) => r.json()),
    ])
      .then(([p, a]) => {
        setPlayers(p.players);
        setAdp(new Map((a.adp as Adp[]).map((x) => [x.id, x])));
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  // `@page` cannot be selected by class, so orientation is switched by
  // injecting the rule and removing it on unmount.
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent =
      layout === "landscape"
        ? "@page { size: Letter landscape; margin: 0.35in; }"
        : "@page { size: Letter portrait; margin: 0.4in; }";
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [layout]);

  const built = useMemo(
    () => buildBoard({ players, config: state.config, prefs: state.prefs, depth: 400 }),
    [players, state],
  );

  const rowsPerCol = ROWS[layout];
  const colsPerPage = COLS[layout];

  // One column per position, in draft order, capped at what a column holds.
  const columns = useMemo(() => {
    const out: { pos: string; players: Player[] }[] = [];
    for (const pos of POS_ORDER) {
      const col = built.columns.find((c) => c.pos === pos);
      if (!col) continue;
      const flat = col.tiers.flatMap((t) =>
        t.players.map((p) => ({ p, tier: t.tier, last: false })),
      );
      if (!flat.length) continue;
      out.push({ pos, players: flat.slice(0, rowsPerCol).map((x) => x.p) });
    }
    return out;
  }, [built, rowsPerCol]);

  // Tier boundaries, so the bracket and the heavier last-in-tier rule survive.
  const tierOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const col of built.columns) {
      for (const t of col.tiers) for (const p of t.players) m.set(p.id, t.tier);
    }
    return m;
  }, [built]);

  const pages = useMemo(() => {
    const out: (typeof columns)[] = [];
    for (let i = 0; i < columns.length; i += colsPerPage) {
      out.push(columns.slice(i, i + colsPerPage));
    }
    return out.length ? out : [[]];
  }, [columns, colsPerPage]);

  const starred = new Set(state.prefs.starred);

  // The sheet prints what the reader ticked on the board — that selection is
  // in the store precisely so it can reach this route. Capped at what fits.
  const chosen = ALL_PLATFORMS.filter((p) => state.prefs.platforms.includes(p.key));
  const PLATFORMS = chosen.slice(0, MAX_PRINT_LANES);
  const dropped = chosen.slice(MAX_PRINT_LANES);
  const cfg = state.config;
  const label = `${cfg.teams} team · ${
    cfg.scoring.rec === 1 ? "full PPR" : cfg.scoring.rec === 0 ? "standard" : "half PPR"
  }${cfg.roster.SUPERFLEX ? " · superflex" : ""}`;

  return (
    <div className="ds-print">
      <div className="ds-print-bar">
        <Link href="/projects/draft-sheet">← Back to the board</Link>
        <span className="ds-print-seg">
          <a href="?layout=portrait" aria-current={layout === "portrait"}>Portrait</a>
          <a href="?layout=landscape" aria-current={layout === "landscape"}>Landscape</a>
        </span>
        <a className="ds-print-seg" href={`?layout=${layout}&tracker=${tracker ? "0" : "1"}`}
           style={{ padding: "6px 11px" }}>
          {tracker ? "Hide tracker" : "Show tracker"}
        </a>
        <span className="ds-print-note">
          Built from the settings saved in this browser. {pages.length} page
          {pages.length > 1 ? "s" : ""}.
          {/* Said out loud. Silently printing fewer columns than the reader
              ticked is how somebody ends up checking a box and wondering why
              the paper never changes. */}
          {dropped.length > 0 && (
            <>
              {" "}
              <strong>
                {dropped.map((d) => d.label).join(" and ")} left off
              </strong>{" "}
              — a printed column fits {MAX_PRINT_LANES} of these. Untick one on
              the board to make room.
            </>
          )}
        </span>
        <span className="ds-print-spacer" />
        <button type="button" className="ds-print-go" onClick={() => window.print()}
                data-tel="ds-do-print">
          Print
        </button>
      </div>

      {!ready && <p style={{ padding: "0 4px" }}>Loading…</p>}

      {ready &&
        pages.map((page, pi) => (
          <div
            key={pi}
            className={`ds-sheet ds-sheet--${layout}`}
            style={{ ["--pcells" as string]: PLATFORMS.length }}
          >
            <header className="ds-sheet-head">
              <span>Draft Sheet · 2026</span>
              <span className="ds-sheet-cfg">{label}</span>
            </header>

            <div className="ds-cols">
              {page.map((col) => (
                <div key={col.pos} className="ds-pcol">
                  <div className="ds-pcol-head">
                    {col.pos}
                    <span>{col.players.length}</span>
                  </div>

                  {/* Names the numeric columns. Without this the four ADP
                      figures are anonymous, which is exactly the confusion the
                      old "tier N+" header caused. */}
                  <div className="ds-pkey">
                    <span /><span /><span /><span />
                    <span>ECR</span>
                    {PLATFORMS.map((p) => (
                      <span key={p.key}>{p.short}</span>
                    ))}
                    <span>30d</span>
                  </div>

                  <div>
                    {col.players.map((p, i) => {
                      const a = adp.get(p.id);
                      const tier = tierOf.get(p.id);
                      const nextTier = tierOf.get(col.players[i + 1]?.id ?? "");
                      const endsTier = tier != null && nextTier != null && tier !== nextTier;
                      const ecr = p.ecr[built.board];
                      const posEcr = a?.posRankEcr ?? null;
                      const move = a?.move;
                      return (
                        <div
                          key={p.id}
                          className={`ds-prow${starred.has(p.id) ? " is-star" : ""}${
                            endsTier ? " is-last" : ""
                          }`}
                        >
                          {/* The star sits to the LEFT of the name in its own
                              cell. Appended after the name it was the first
                              thing an ellipsis ate on a long one. */}
                          <span className="ds-pstar">{starred.has(p.id) ? "★" : ""}</span>
                          <span className="ds-prank">{p.posRank[built.board]?.replace(/^[A-Z]+/, "") ?? ""}</span>
                          <span className="ds-pname">{p.short}</span>
                          <span className="ds-pteam">{p.team ?? ""}·{p.bye ?? "-"}</span>
                          <span className="ds-pecr">{ecr != null ? Math.round(ecr) : ""}</span>
                          {PLATFORMS.map((plat) => {
                            const raw = a?.raw[plat.key] ?? null;
                            const pr = a?.posRank[plat.key] ?? null;
                            const shown = plat.kind === "rank" ? pr : raw;
                            // Bold marks a real bargain on that platform.
                            // Weight photocopies; a tint does not. A price has
                            // no consensus rank to be a bargain against, so the
                            // auction lane is never marked.
                            const value =
                              plat.kind !== "cost" &&
                              pr != null && posEcr != null && pr - posEcr >= 4;
                            return (
                              <span
                                key={plat.key}
                                className={`ds-pcell${value ? " is-value" : ""}`}
                              >
                                {shown == null
                                  ? "·"
                                  : plat.kind === "cost"
                                    ? `$${Math.round(shown)}`
                                    : Math.round(shown)}
                              </span>
                            );
                          })}
                          <span className="ds-pmove">
                            {move == null ? "" : move >= 6 ? "▲" : move <= -6 ? "▼" : "–"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {tracker && pi === pages.length - 1 && (
              <div className="ds-tracker">
                <span className="ds-tracker-label">My picks</span>
                <div
                  className="ds-tracker-grid"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(16, cfg.roster.BENCH + 9)}, 1fr)`,
                  }}
                >
                  {Array.from({ length: Math.min(16, cfg.roster.BENCH + 9) }, (_, i) => (
                    <div key={i} className="ds-tracker-cell">{i + 1}</div>
                  ))}
                </div>
              </div>
            )}

            <footer className="ds-sheet-foot">
              <span>greghlewis.com/projects/draft-sheet</span>
              <span>
                Page {pi + 1} of {pages.length} · ECR is expert consensus · bold is a bargain
                on that platform
              </span>
            </footer>
          </div>
        ))}
    </div>
  );
}
