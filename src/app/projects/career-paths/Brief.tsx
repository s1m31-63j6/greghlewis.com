"use client";

/**
 * Tab three: the funding brief. One reading column with a sticky contents
 * list beside it, the two wide tables dropped in after the sections that
 * introduce them, the questions as a copyable list, the glossary, and the
 * ask box at the end. All copy lives in src/lib/career-paths/brief.ts.
 */

import { useState, useSyncExternalStore } from "react";

import { BRIEF, FUNDING_TABLE, GLOSSARY, QUESTIONS_TO_ASK, STAGE_LADDER, STARTERS } from "@/lib/career-paths/brief";

import AskBox from "./AskBox";
import { FundingTable, ScrollTable, StageTable } from "./ComparisonTable";
import EquityFlow from "./EquityFlow";
import Glossary from "./Glossary";
import { STAGES, type Stage } from "./engine/types.ts";
import { fmtDollars, fmtPct } from "./format";
import type { Model } from "./useModel";

const STAGE_LABEL: Record<Stage, string> = {
  seed: "Seed",
  seriesAB: "Series A-B",
  growth: "Growth",
  bootstrapped: "Bootstrapped",
  pe: "Private equity",
};

const CONTENTS = [
  ...BRIEF.map((s) => ({ id: s.id, heading: s.heading })),
  { id: "glossary", heading: "Glossary" },
  { id: "ask", heading: "Ask about this" },
];

function CopyList({ items }: { items: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(items.map((q, i) => `${i + 1}. ${q}`).join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <button type="button" className="cp-btn" onClick={copy} data-tel="cp-copy-questions" data-tel-project="career-paths">
      {copied ? "Copied" : "Copy list"}
    </button>
  );
}

function StageParams({ model }: { model: Model }) {
  const rows = STAGES.map((s) => {
    const p = model.params.startup[s];
    return {
      stage: STAGE_LABEL[s],
      fail: fmtPct(p.failHazard),
      exit: fmtPct(p.exitHazard),
      exitMedian: fmtDollars(p.exitMedian),
      prefStack: fmtDollars(p.prefStack),
      grant: fmtPct(p.grantPctFD.technical, 3),
      cash: fmtPct(1 - p.salaryDiscount),
    };
  });
  return (
    <div className="cp-note cp-brief-params cp-brief-wide">
      <p>The simulation on tab one uses these stage parameters:</p>
      <ScrollTable>
        <table className="cp-table cp-brief-params-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th className="num">Annual shutdown odds</th>
              <th className="num">Annual exit odds</th>
              <th className="num">Median exit</th>
              <th className="num">Preference stack</th>
              <th className="num">New-grad grant</th>
              <th className="num">Cash pay vs market</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stage}>
                <td>{r.stage}</td>
                <td className="num">{r.fail}</td>
                <td className="num">{r.exit}</td>
                <td className="num">{r.exitMedian}</td>
                <td className="num">{r.prefStack}</td>
                <td className="num">{r.grant}</td>
                <td className="num">{r.cash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}

// The contents rail's shown/hidden choice, kept in localStorage and read
// through useSyncExternalStore so the server render and the first client
// render agree (the server always says shown).
const CONTENTS_KEY = "cp-brief-contents";
const contentsListeners = new Set<() => void>();
let contentsPref: boolean | null = null;

function readContents(): boolean {
  if (contentsPref === null) {
    try { contentsPref = localStorage.getItem(CONTENTS_KEY) !== "hidden"; } catch { contentsPref = true; }
  }
  return contentsPref;
}
function writeContents(shown: boolean) {
  contentsPref = shown;
  try { localStorage.setItem(CONTENTS_KEY, shown ? "shown" : "hidden"); } catch {}
  contentsListeners.forEach((fn) => fn());
}
function subscribeContents(fn: () => void) {
  contentsListeners.add(fn);
  return () => { contentsListeners.delete(fn); };
}

export default function Brief({ model }: { model: Model | null }) {
  const contents = useSyncExternalStore(subscribeContents, readContents, () => true);
  const toggleContents = () => writeContents(!contents);

  return (
    <div className="cp-brief" data-contents={contents ? "shown" : "hidden"}>
      <nav className="cp-brief-contents" aria-label="Contents">
        <div className="cp-brief-contents-head">
          {contents && <div className="cp-kicker">Contents</div>}
          <button
            type="button" className="cp-btn cp-brief-contents-toggle" onClick={toggleContents}
            aria-expanded={contents} data-tel="cp-brief-contents" data-tel-project="career-paths"
          >
            {contents ? "Hide contents" : "Show contents"}
          </button>
        </div>
        {contents && (
          <ol>
            {CONTENTS.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`}>
                  <span className="cp-num">{String(i + 1).padStart(2, "0")}</span>
                  {c.heading}
                </a>
              </li>
            ))}
          </ol>
        )}
      </nav>

      <article className="cp-brief-column">
        {BRIEF.map((s) => (
          <section key={s.id} id={s.id} className="cp-brief-section">
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}

            {s.id === "funding-models" && <FundingTable rows={FUNDING_TABLE} />}

            {s.id === "equity-mechanics" && <EquityFlow model={model} />}

            {s.id === "the-stage-ladder" && (
              <>
                <StageTable rows={STAGE_LADDER} />
                {model && <StageParams model={model} />}
              </>
            )}

            {s.id === "questions-to-ask" && (
              <>
                <ol className="cp-brief-questions">
                  {QUESTIONS_TO_ASK.map((q) => <li key={q}>{q}</li>)}
                </ol>
                <CopyList items={QUESTIONS_TO_ASK} />
              </>
            )}
          </section>
        ))}

        <Glossary entries={GLOSSARY} />
        <AskBox starters={STARTERS} />
      </article>
    </div>
  );
}
