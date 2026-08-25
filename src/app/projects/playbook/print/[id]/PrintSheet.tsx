"use client";

/**
 * The three printed artifacts.
 *
 * The palette FLIPS for print — nobody prints a black field, and the token
 * block in styles.css redefines every colour under `@media print`. Defence
 * prints black rather than red by default, because most coaches print
 * monochrome and a mid-red photocopies to a mid-grey that destroys the
 * offence/defence distinction. The glyph SHAPE carries it instead, which is a
 * second reason the defender is a filled diamond rather than an X.
 *
 * The call sheet and the wristband both derive their numbers from `callNumber`
 * on the same entry, so the number on the coach's sheet and the number on the
 * quarterback's wrist cannot disagree. Getting those two out of step is the
 * most expensive mistake a playbook tool can make on a Friday night.
 */

import { useEffect, useMemo, useState } from "react";

import "../../styles.css";
import "./print.css";

import Field from "../../Field";
import PlayDiagram from "../../PlayDiagram";
import { PRODUCT } from "../../product";
import { resolvePlay } from "@/lib/playbook/resolve";
import { variant as variantOf } from "@/lib/playbook/field";
import { formationById } from "@/lib/playbook/formations";
import type { BookEntry, Playbook } from "@/lib/playbook/types";

interface Props {
  book: Playbook;
  layout: "grid12" | "callsheet" | "wristband";
  color: boolean;
}

const LAYOUT_LABEL: Record<Props["layout"], string> = {
  grid12: "Playbook",
  callsheet: "Call sheet",
  wristband: "Wristbands",
};

const PER_PAGE = 12;
const STRIPS_PER_PAGE = 10;
const ROWS_PER_STRIP = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function Diagram({ entry, book, density }: { entry: BookEntry; book: Playbook; density: "print12" | "wristband" }) {
  const spec = entry.play.spec;
  const v = spec.variantScope.includes(book.variant) ? book.variant : spec.variantScope[0];
  const fv = variantOf(v);
  const resolved = useMemo(
    () => resolvePlay(entry.play, v, false, book.style),
    [entry.play, v, book.style],
  );
  return (
    <Field variant={fv} density={density} showRules={false} ariaLabel={spec.name}>
      <PlayDiagram play={resolved} variant={fv} style={book.style} density={density} />
    </Field>
  );
}

export default function PrintSheet({ book, layout, color: initialColor }: Props) {
  const today = useMemo(
    () => new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }),
    [],
  );
  const [color, setColor] = useState(initialColor);

  /**
   * This page used to fire `window.print()` on arrival. It meant nobody could
   * look at a sheet before committing paper to it — and two pages of diagrams
   * is exactly the thing you want to check first. It also made the page
   * impossible to inspect or share, since the browser sat behind its own modal.
   * The sheet renders; you press Print when you have looked at it.
   */
  useEffect(() => {
    // @page cannot be selected by class, so the orientation is injected. The
    // call sheet is the only landscape sheet.
    const style = document.createElement("style");
    style.textContent =
      layout === "callsheet"
        ? "@page { size: Letter landscape; margin: 0.35in; }"
        : "@page { size: Letter portrait; margin: 0.4in; }";
    document.head.appendChild(style);
    return () => style.remove();
  }, [layout]);

  const sections = useMemo(() => {
    const map = new Map<string, BookEntry[]>();
    for (const e of book.entries) {
      const k = e.section ?? "Unsectioned";
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [book.entries]);

  const cls = `pb-page pb-print pb-print--${layout}${color ? " pb-print-color" : ""}`;

  const bar = (
    <div className="pb-print-bar">
      <a className="pb-back" href="/projects/playbook">‹ {PRODUCT.name}</a>
      <span className="pb-label">
        {book.name} · {LAYOUT_LABEL[layout]} · {book.entries.length} plays
      </span>
      <span className="pb-print-bar-spacer" />
      <div className="pb-seg">
        {(["grid12", "callsheet", "wristband"] as const).map((l) => (
          <a key={l} href={`?layout=${l}${color ? "&color=1" : ""}`} aria-current={l === layout}>
            {LAYOUT_LABEL[l]}
          </a>
        ))}
      </div>
      <label className="pb-chip-toggle" aria-pressed={color}>
        <input
          type="checkbox"
          checked={color}
          onChange={(e) => setColor(e.target.checked)}
          style={{ marginRight: 5 }}
        />
        Colour
      </label>
      <button className="pb-btn pb-btn--primary" onClick={() => window.print()}>
        Print
      </button>
    </div>
  );

  if (layout === "grid12") {
    const pages = chunk(book.entries, PER_PAGE);
    return (
      <main className={cls}>
        {bar}
        {pages.map((page, pi) => (
          <section className="pb-sheet pb-sheet--portrait" key={pi}>
            <header className="pb-sheet-head">
              <span>{book.name}</span>
              <span>{PRODUCT.name}</span>
              <span>
                p.{pi + 1} of {pages.length} · {today}
              </span>
            </header>
            <div className="pb-grid12">
              {page.map((e) => (
                <article className="pb-cell" key={e.play.spec.id}>
                  <div className="pb-cell-head">
                    <strong>{e.callNumber ? `${e.callNumber} · ` : ""}{e.play.spec.name}</strong>
                    <span>{formationById(e.play.spec.formationId)?.name ?? e.play.spec.formationId.replace(/-/g, " ")}</span>
                  </div>
                  <div className="pb-cell-diagram">
                    <Diagram entry={e} book={book} density="print12" />
                  </div>
                  <div className="pb-cell-meta">
                    {[
                      e.play.spec.family,
                      e.play.spec.situations[0]?.replace(/-/g, " "),
                      e.play.spec.primary ?? e.play.spec.run?.carrier,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </article>
              ))}
            </div>
            <footer className="pb-sheet-foot">{book.name}</footer>
          </section>
        ))}
      </main>
    );
  }

  if (layout === "callsheet") {
    return (
      <main className={cls}>
        {bar}
        <section className="pb-sheet pb-sheet--landscape">
          <header className="pb-sheet-head">
            <span>{book.name} · {today}</span>
            <span>Call sheet</span>
          </header>
          <div className="pb-callsheet">
            {sections.map(([name, entries]) => (
              <div className="pb-call-block" key={name}>
                <h3>{name}</h3>
                <ol>
                  {entries.map((e) => (
                    <li key={e.play.spec.id}>
                      <span className="pb-call-num">{e.callNumber ?? ""}</span>
                      <span className="pb-call-name">{e.play.spec.name}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <div className="pb-notes-area">Notes</div>
        </section>
      </main>
    );
  }

  // Wristband. The play NAME is the payload; a diagram at a quarter of an inch
  // is a memory jog at best, so blocks and labels are dropped entirely.
  const strips = chunk(book.entries, ROWS_PER_STRIP);
  const pages = chunk(strips, STRIPS_PER_PAGE);
  return (
    <main className={cls}>
      {bar}
      {pages.map((page, pi) => (
        <section className="pb-sheet pb-sheet--portrait" key={pi}>
          <div className="pb-wristbands">
            {page.map((strip, si) => (
              <div className="pb-strip" key={si}>
                <header>
                  {book.name} · Set {pi * STRIPS_PER_PAGE + si + 1}
                </header>
                <ol>
                  {strip.map((e) => (
                    <li key={e.play.spec.id}>
                      <span className="pb-strip-num">{e.callNumber ?? ""}</span>
                      <span className="pb-strip-name">
                        {e.play.spec.name.length > 22
                          ? `${e.play.spec.name.slice(0, 21)}…`
                          : e.play.spec.name}
                      </span>
                      <span className="pb-strip-glyph">
                        <Diagram entry={e} book={book} density="wristband" />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
