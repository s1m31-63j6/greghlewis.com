/**
 * Working Papers — reference implementations of the signature controls.
 * Adapt into src/components (or similar); these assume tokens.css is loaded.
 * They are intentionally small and dependency-free. React 19 + Next 16 ("use client" where interactive).
 */
"use client";

import { useId, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Paper shell: masthead, rosette, hero, dotted rules, quiet footer    */
/* ------------------------------------------------------------------ */

type Inks = { a: string; b: string; hl: string };

export function PaperShell(props: {
  no: number;
  title: string;
  note: string;            // the personal note (≤ 2 lines)
  inks: Inks;              // from palettes.json
  meta: { label: string; value: ReactNode }[]; // Paper, Author, Revised, Data…
  children: ReactNode;     // sections, each preceded by <DottedRule />
}) {
  const { no, title, note, inks, meta, children } = props;
  return (
    <div
      className="wp-page"
      style={{ "--a": inks.a, "--b": inks.b, "--hl": inks.hl, position: "relative", overflow: "hidden" } as CSSProperties}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "34px clamp(16px, 5vw, 64px) 48px", position: "relative" }}>
        <Rosette />
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 17 }}>
            <span style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>Greg Lewis</span>
            <span style={{ color: "var(--wp-label)" }}>Working Papers</span>
          </div>
          <div style={{ display: "flex", gap: 28, alignItems: "baseline", fontSize: 14, fontWeight: 500 }}>
            <span style={{ color: "var(--wp-label)" }}>No. {String(no).padStart(2, "0")}</span>
            <CircleLink href="/">Index of papers</CircleLink>
          </div>
        </header>
        <DottedRule />
        <section style={{ padding: "84px 0 72px", textAlign: "center", position: "relative" }}>
          <h1 className="wp-title">{title}</h1>
          <p className="wp-note">{note}</p>
        </section>
        {children}
        <DottedRule style={{ marginTop: 110 }} />
        <footer style={{ paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div className="wp-foot">
            {meta.map((m) => (
              <div key={m.label}><b>{m.label}</b>{m.value}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 26, paddingTop: 17, fontSize: 13, fontWeight: 500, color: "var(--wp-footer)" }}>
            <CircleLink href="#how-it-was-built">How it was built</CircleLink>
            <CircleLink href="/subscribe">Want more?</CircleLink>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function DottedRule({ style }: { style?: CSSProperties }) {
  return <div aria-hidden className="wp-rule" style={style} />;
}

/** Faint background rosette: texture only, never a mark. */
export function Rosette({ style }: { style?: CSSProperties }) {
  const angles = Array.from({ length: 18 }, (_, i) => i * 10);
  return (
    <svg aria-hidden className="wp-rosette" viewBox="-200 -200 400 400"
      style={{ left: 600, top: -170, width: 760, height: 760, ...style }}>
      {angles.map((r) => <ellipse key={r} rx={190} ry={62} transform={`rotate(${r})`} />)}
      <circle r={196} /><circle r={120} /><circle r={60} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

const CIRCLE_PATH =
  "M34 9 C86 0 168 3 191 21 C207 35 176 55 104 57 C44 59 5 49 7 31 C9 15 44 6 76 5 C102 4 128 7 146 12";

/** Arrow link: a hand-drawn circle traces round it on hover/focus. */
export function CircleLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="wp-circ" href={href}>
      {children} <span className="wp-arr">&#8594;</span>
      <svg aria-hidden viewBox="0 0 200 60" preserveAspectRatio="none">
        <path pathLength={1} d={CIRCLE_PATH} />
      </svg>
    </a>
  );
}

/** Inline/source link: ink-B underline that grows into a highlighter. */
export function InkLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="wp-x" href={href}>{children}</a>;
}

/* ------------------------------------------------------------------ */
/* Ink swipe selector (single or multi)                                */
/* ------------------------------------------------------------------ */

const TILTS = [-1.5, 1, -0.8, 1.4, -1.2, 0.8];

export function SwipeSelect<T extends string>(props: {
  label: string;                 // accessible name (and optional visible .wp-lab prefix)
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  showLabel?: boolean;
}) {
  const { label, options, value, onChange, showLabel } = props;
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    onChange(options[(i + d + options.length) % options.length].value);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {showLabel && <span className="wp-lab">{label}</span>}
      <div role="tablist" aria-label={label} className="wp-opts">
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <button key={o.value} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
              className="wp-opt" onClick={() => onChange(o.value)} onKeyDown={(e) => onKey(e, i)}>
              <span aria-hidden className="wp-ink" style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }} />
              <span className="wp-opt-t"><b>{o.label}</b><span>{o.label}</span></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SwipeToggles<T extends string>(props: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  const { label, options, value, onChange } = props;
  return (
    <div role="group" aria-label={label} className="wp-opts">
      {options.map((o, i) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} className="wp-opt"
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
            <span aria-hidden className="wp-ink" style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }} />
            <span className="wp-opt-t"><b>{o.label}</b><span>{o.label}</span></span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Actions and fields                                                  */
/* ------------------------------------------------------------------ */

export function InkAction({ children, primary, ...rest }: { children: ReactNode; primary?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={primary ? "wp-hov wp-ask" : "wp-hov"} {...rest}>
      <span>{children} &#8594;</span>
    </button>
  );
}

export function InkField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="wp-field" aria-label={props.placeholder} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Growing tooltip + a hoverable/focusable data mark                    */
/* ------------------------------------------------------------------ */

/**
 * Wrap any absolutely-positioned mark. The tooltip mounts on hover/focus so its
 * grow animation plays from the anchor (--ox/--oy). Place it so it stays on screen.
 */
export function TipMark(props: {
  ariaLabel: string;
  title: ReactNode;
  detail?: ReactNode;
  place?: "above" | "below";
  align?: "left" | "right";
  onHover?: (on: boolean) => void;  // e.g. dim other categories
  children: ReactNode;               // the mark itself
  style?: CSSProperties;
}) {
  const { ariaLabel, title, detail, place = "above", align = "left", onHover, children, style } = props;
  const [open, setOpen] = useState(false);
  const id = useId();
  const set = (v: boolean) => { setOpen(v); onHover?.(v); };
  const tipPos: CSSProperties = {
    ...(place === "above" ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }),
    ...(align === "left" ? { left: 0 } : { right: 0 }),
    whiteSpace: "nowrap",
    ["--ox" as string]: align === "left" ? "14px" : "calc(100% - 14px)",
    ["--oy" as string]: place === "above" ? "100%" : "0%",
  };
  return (
    <span tabIndex={0} aria-label={ariaLabel} aria-describedby={open ? id : undefined}
      onMouseEnter={() => set(true)} onMouseLeave={() => set(false)}
      onFocus={() => set(true)} onBlur={() => set(false)}
      style={{ position: "relative", display: "inline-block", outline: 0, ...style }}>
      {children}
      {open && (
        <span id={id} role="tooltip" className="wp-tip" style={tipPos}>
          <b>{title}</b>
          {detail && <small>{detail}</small>}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Selection marker that floods with ink (e.g. Bond Yields episodes)    */
/* ------------------------------------------------------------------ */

export function FloodMarker(props: { n: number; selected: boolean; label: string; onSelect: () => void; onHover?: (on: boolean) => void; style?: CSSProperties }) {
  const { n, selected, label, onSelect, onHover, style } = props;
  return (
    <button type="button" className="wp-mark" aria-pressed={selected} aria-label={label}
      onClick={onSelect} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)} onBlur={() => onHover?.(false)}
      style={{ width: 24, height: 24, borderRadius: "50%", border: "1.5px solid var(--a)", padding: 0,
        fontSize: 11, fontWeight: 700, color: selected ? "var(--wp-paper)" : "var(--a)", ...style }}>
      <span aria-hidden className="wp-flood" />
      <span style={{ position: "relative" }}>{n}</span>
    </button>
  );
}

/** A detail panel that re-inks (left→right wipe) whenever `contentKey` changes. */
export function ReinkPanel({ contentKey, children }: { contentKey: string | number; children: ReactNode }) {
  // Re-keying remounts the inner node so the wipe animation replays.
  return <div key={contentKey} className="wp-reink">{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Caption under every chart                                           */
/* ------------------------------------------------------------------ */

export function Caption({ title, legend, sources }: {
  title: ReactNode;
  legend?: { swatch: CSSProperties; label: ReactNode }[];
  sources: { label: string; href: string }[];
}) {
  return (
    <div className="wp-cap">
      <b>{title}</b>
      {legend?.map((l, i) => (
        <span key={i} className="wp-sw"><span style={{ width: 16, height: 11, ...l.swatch }} />{l.label}</span>
      ))}
      <span>
        Data:{" "}
        {sources.map((s, i) => (
          <span key={s.href}>{i > 0 && ", "}<InkLink href={s.href}>{s.label}</InkLink></span>
        ))}
      </span>
    </div>
  );
}
