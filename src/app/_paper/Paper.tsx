"use client";

/**
 * Working Papers: the shared chrome and controls every paper is printed
 * with. Styles come from design/working-papers/tokens.css (imported once
 * in globals.css); inks come from design/working-papers/palettes.json.
 * The spec is design/working-papers/README.md.
 */

import Link from "next/link";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import "./paper.css";

export type Inks = { a: string; b: string; hl: string };

/* ── Shell: masthead, rosette, hero, footer ─────────────────────────── */

export function PaperShell({ no, title, note, inks, meta, links, project, children }: {
  no: number;
  title: string;
  /** The personal note under the title, two lines at most. */
  note: string;
  inks: Inks;
  /** Footer fields: Paper, Author, Revised, Data. */
  meta: { label: string; value: ReactNode }[];
  /** Footer arrow links, after the fields. */
  links: { href: string; label: string; tel?: string }[];
  project: string;
  children: ReactNode;
}) {
  return (
    <div className="wp-page wp-shell" style={{ "--a": inks.a, "--b": inks.b, "--hl": inks.hl } as CSSProperties} data-tel-project={project}>
      <div className="wp-sheet">
        <Rosette />
        <header className="wp-mast">
          <div className="wp-mast-l"><b>Greg Lewis</b><span>Working Papers</span></div>
          <div className="wp-mast-r">
            <span>No. {String(no).padStart(2, "0")}</span>
            <CircleLink href="/">Index of papers</CircleLink>
          </div>
        </header>
        <DottedRule />
        <section className="wp-hero">
          <h1 className="wp-title">{title}</h1>
          <p className="wp-note">{note}</p>
        </section>
        {children}
        <DottedRule className="wp-foot-rule" />
        <footer className="wp-footer">
          <div className="wp-foot">
            {meta.map((m) => <div key={m.label}><b>{m.label}</b>{m.value}</div>)}
          </div>
          <div className="wp-foot-links">
            {links.map((l) => <CircleLink key={l.href} href={l.href} tel={l.tel}>{l.label}</CircleLink>)}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function DottedRule({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={`wp-rule${className ? ` ${className}` : ""}`} style={style} />;
}

/** Faint background texture behind the hero. Never a mark. */
export function Rosette() {
  return (
    <svg aria-hidden className="wp-rosette" viewBox="-200 -200 400 400">
      {Array.from({ length: 18 }, (_, i) => <ellipse key={i} rx={190} ry={62} transform={`rotate(${i * 10})`} />)}
      <circle r={196} /><circle r={120} /><circle r={60} />
    </svg>
  );
}

/* ── Links ───────────────────────────────────────────────────────────── */

const CIRCLE = "M34 9 C86 0 168 3 191 21 C207 35 176 55 104 57 C44 59 5 49 7 31 C9 15 44 6 76 5 C102 4 128 7 146 12";

/** Arrow link: a hand-drawn circle traces round it on hover. */
export function CircleLink({ href, children, tel }: { href: string; children: ReactNode; tel?: string }) {
  return (
    <Link className="wp-circ" href={href} data-tel={tel}>
      {children} <span className="wp-arr">&#8594;</span>
      <svg aria-hidden viewBox="0 0 200 60" preserveAspectRatio="none"><path pathLength={1} d={CIRCLE} /></svg>
    </Link>
  );
}

/** Inline link: an ink-B underline that grows into a highlighter. */
export function InkLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a className="wp-x" href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
      {children}
    </a>
  );
}

/* ── Ink swipe selector ──────────────────────────────────────────────── */

const TILTS = [-1.5, 1, -0.8, 1.4, -1.2, 0.8];

export function SwipeSelect<T extends string>({ label, options, value, onChange, tel }: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  tel?: string;
}) {
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    onChange(options[(i + d + options.length) % options.length].value);
  };
  return (
    <div role="tablist" aria-label={label} className="wp-opts">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} className="wp-opt"
            onClick={() => onChange(o.value)} onKeyDown={(e) => onKey(e, i)} data-tel={tel}>
            <span aria-hidden className="wp-ink" style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }} />
            <span className="wp-opt-t"><b>{o.label}</b><span>{o.label}</span></span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Caption under every chart ───────────────────────────────────────── */

export type Swatch = "halftone" | "flat" | "line";

const SWATCH: Record<Swatch, CSSProperties> = {
  halftone: { backgroundImage: "radial-gradient(var(--a) 1.4px, transparent 1.7px)", backgroundSize: "5px 5px" },
  flat: { background: "var(--b)" },
  line: { background: "linear-gradient(var(--a), var(--a)) center / 100% 2px no-repeat" },
};

export function Caption({ title, legend, sources }: {
  title: ReactNode;
  legend?: { swatch: Swatch; label: ReactNode }[];
  sources: { label: string; href: string }[];
}) {
  return (
    <div className="wp-cap">
      <b>{title}</b>
      {legend?.map((l, i) => <span key={i} className="wp-sw"><span className="wp-sw-box" style={SWATCH[l.swatch]} />{l.label}</span>)}
      <span>
        Data:{" "}
        {sources.map((s, i) => <span key={s.href}>{i > 0 && ", "}<InkLink href={s.href}>{s.label}</InkLink></span>)}
      </span>
    </div>
  );
}
