"use client";

/**
 * Tab three: the funding brief. One centered reading column; the two wide
 * tables and the equity-flow card grow past it to the container width. A
 * floating "Contents" pill sits in the left gutter (or above the column
 * on narrow screens), names the section under the reader, and opens a
 * menu of every section. All copy lives in src/lib/career-paths/brief.ts.
 */

import { useEffect, useId, useRef, useState } from "react";

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
  ...BRIEF.map((s) => ({ id: s.id, label: s.short })),
  { id: "glossary", label: "Glossary" },
  { id: "ask", label: "Ask about this" },
];

// ── Contents pill ────────────────────────────────────────────────────

/**
 * The floating contents control. Its label is "Contents" until a section
 * has reached the line 30% down the viewport, then the last section to
 * have done so. The sections are contiguous, so an IntersectionObserver
 * on a thin band at that line fires whenever the reader crosses from one
 * to another (a jump that skips the band still changes what intersects
 * it); the callback then reads every section's position afresh rather
 * than trusting the entries, which stay silent for elements that jump
 * from above the band to below it.
 */
function Contents({ items }: { items: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useEffect(() => {
    const targets = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => !!el);
    const update = () => {
      const line = window.innerHeight * 0.3;
      const hit = [...targets].reverse().find((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top <= line;
      });
      setCurrent(hit?.id ?? null);
    };
    const io = new IntersectionObserver(update, { rootMargin: "-30% 0px -69% 0px" });
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  // Outside click and Escape close the menu; Escape also returns focus.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    const focus = menuRef.current?.querySelector<HTMLElement>('[aria-current="true"]')
      ?? menuRef.current?.querySelector<HTMLElement>("button");
    focus?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const jump = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const label = items.find((i) => i.id === current)?.label ?? "Contents";

  return (
    <div className="cp-brief-contents">
      <div className="cp-brief-contents-pill" ref={rootRef}>
        <button
          type="button" className="cp-btn cp-brief-contents-btn" ref={btnRef}
          aria-expanded={open} aria-controls={menuId} aria-haspopup="menu" aria-label={`Contents: ${label}`}
          onClick={() => setOpen((o) => !o)} data-tel="cp-brief-contents" data-tel-project="career-paths"
        >
          <span className="cp-brief-contents-label">{label}</span>
          <svg className="cp-brief-contents-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <ul className="cp-brief-contents-menu" role="menu" id={menuId} ref={menuRef} aria-label="Contents">
            {items.map((c, i) => (
              <li key={c.id} role="none">
                <button type="button" role="menuitem" aria-current={c.id === current} onClick={() => jump(c.id)}>
                  <span className="cp-num">{String(i + 1).padStart(2, "0")}</span>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────

function CopyList({ items }: { items: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(items.map((q, i) => `${i + 1}. ${q}`).join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="cp-brief-copy">
      <button type="button" className="cp-btn" onClick={copy} data-tel="cp-copy-questions" data-tel-project="career-paths">
        {copied ? "Copied" : "Copy list"}
      </button>
    </div>
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
      <div className="cp-kicker">Where the simulation&apos;s stage parameters come from</div>
      <p>The simulation on tab one collapses the ladder above into five stages and runs on these parameters:</p>
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

// ── The brief ────────────────────────────────────────────────────────

export default function Brief({ model }: { model: Model | null }) {
  return (
    <div className="cp-brief">
      <Contents items={CONTENTS} />

      <article className="cp-brief-column">
        {BRIEF.map((s) => {
          const [lead, ...rest] = s.paragraphs;
          return (
            <section key={s.id} id={s.id} className="cp-brief-section">
              <h2>{s.heading}</h2>
              {s.takeaway && <p className="cp-brief-takeaway">{s.takeaway}</p>}
              {lead && <p>{lead}</p>}

              {s.id === "funding-models" && <FundingTable rows={FUNDING_TABLE} />}
              {s.id === "the-stage-ladder" && <StageTable rows={STAGE_LADDER} />}

              {rest.map((p, i) => <p key={i}>{p}</p>)}

              {s.id === "equity-mechanics" && <EquityFlow model={model} />}

              {s.callout && (
                <aside className="cp-note cp-brief-callout">
                  <div className="cp-kicker">{s.callout.title}</div>
                  <p>{s.callout.body}</p>
                </aside>
              )}

              {s.id === "the-stage-ladder" && model && <StageParams model={model} />}

              {s.id === "questions-to-ask" && (
                <>
                  <ol className="cp-brief-questions">
                    {QUESTIONS_TO_ASK.map((q) => <li key={q}>{q}</li>)}
                  </ol>
                  <CopyList items={QUESTIONS_TO_ASK} />
                </>
              )}
            </section>
          );
        })}

        <Glossary entries={GLOSSARY} />
        <AskBox starters={STARTERS} />
      </article>
    </div>
  );
}
