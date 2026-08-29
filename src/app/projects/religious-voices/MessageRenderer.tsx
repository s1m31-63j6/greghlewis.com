"use client";

import { useMemo } from "react";
import type { SourceAttribution } from "./useChatThread";

// Streaming-aware parser for the model's `<quote>...</quote>` and
// `<extrapolation>...</extrapolation>` tags.
//
// Quotes can carry an optional `n="N"` attribute that references the
// SOURCE PASSAGE chunk number from the per-turn user message. When
// present, we render a superscript numeral linking to the source URL.
//
// Re-runs from scratch on every accumulated-text update — simpler than a
// stateful parser, and the cost is negligible. Handles partial tags
// arriving mid-stream by stopping at the first incomplete tag boundary.

type Segment =
  | { type: "quote"; text: string; sourceN?: number }
  | { type: "extrapolation"; text: string }
  | { type: "plain"; text: string };

const QUOTE_CLOSE = "</quote>";
const EXTRAP_OPEN = "<extrapolation>";
const EXTRAP_CLOSE = "</extrapolation>";

// Matches `<quote>` or `<quote n="3">` (single or double quoted, optional spaces).
const QUOTE_OPEN_RE = /^<quote(?:\s+n=["']?(\d+)["']?)?>/;

function parseStream(text: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const openIdx = text.indexOf("<", i);
    if (openIdx === -1) {
      const tail = text.slice(i);
      // Preserve whitespace too — the space between adjacent tags is the
      // only thing keeping sentences from running together visually.
      if (tail) segments.push({ type: "plain", text: tail });
      break;
    }
    if (openIdx > i) {
      const plain = text.slice(i, openIdx);
      if (plain) segments.push({ type: "plain", text: plain });
    }
    const rest = text.slice(openIdx);
    const quoteMatch = rest.match(QUOTE_OPEN_RE);
    if (quoteMatch) {
      const openLen = quoteMatch[0].length;
      const sourceN = quoteMatch[1] ? parseInt(quoteMatch[1], 10) : undefined;
      const closeIdx = text.indexOf(QUOTE_CLOSE, openIdx + openLen);
      if (closeIdx === -1) {
        const content = text.slice(openIdx + openLen);
        if (content) segments.push({ type: "quote", text: content, sourceN });
        break;
      }
      segments.push({
        type: "quote",
        text: text.slice(openIdx + openLen, closeIdx),
        sourceN,
      });
      i = closeIdx + QUOTE_CLOSE.length;
    } else if (text.startsWith(EXTRAP_OPEN, openIdx)) {
      const closeIdx = text.indexOf(EXTRAP_CLOSE, openIdx + EXTRAP_OPEN.length);
      if (closeIdx === -1) {
        const content = text.slice(openIdx + EXTRAP_OPEN.length);
        if (content) segments.push({ type: "extrapolation", text: content });
        break;
      }
      segments.push({
        type: "extrapolation",
        text: text.slice(openIdx + EXTRAP_OPEN.length, closeIdx),
      });
      i = closeIdx + EXTRAP_CLOSE.length;
    } else {
      // Could be a partial tag mid-stream ("<quo", "</extrap…") — if the
      // remainder is a strict prefix of one of our tags, pause and wait
      // for more text. Otherwise treat "<" as literal.
      const isPartial =
        "<quote".startsWith(rest) ||
        rest.startsWith("<quote") ||
        EXTRAP_OPEN.startsWith(rest) ||
        QUOTE_CLOSE.startsWith(rest) ||
        EXTRAP_CLOSE.startsWith(rest);
      if (isPartial) break;
      segments.push({ type: "plain", text: "<" });
      i = openIdx + 1;
    }
  }
  return segments;
}

interface Props {
  content: string;
  sources?: SourceAttribution[];
  // True while text is still streaming; renders a soft cursor on the
  // tail-most segment so the user sees something is happening.
  streaming?: boolean;
}

export function MessageRenderer({ content, sources = [], streaming = false }: Props) {
  const segments = useMemo(() => parseStream(content), [content]);

  // Track which sources are actually referenced so we can show the cited
  // ones inline (as superscripts) AND build a clean "Sources:" footer in
  // the parent component.
  return (
    <div className="leading-relaxed text-[15px]">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const cursor =
          streaming && isLast ? (
            <span className="inline-block w-[2px] h-[1em] align-[-2px] bg-stone-500 ml-[1px] animate-pulse" />
          ) : null;
        if (seg.type === "quote") {
          // 1-based source index → 0-based array index
          const src = seg.sourceN && sources[seg.sourceN - 1] ? sources[seg.sourceN - 1] : null;
          return (
            <span
              key={i}
              className="text-stone-900"
              title="Drawn from this leader's published writings"
            >
              {seg.text}
              {src ? (
                <a
                  href={src.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${src.work_title}${src.year ? ` (${src.year})` : ""}`}
                  className="text-[0.7em] align-super text-stone-500 hover:text-stone-900 underline-offset-2 hover:underline ml-[1px]"
                >
                  {seg.sourceN}
                </a>
              ) : null}
              {cursor}
            </span>
          );
        }
        if (seg.type === "extrapolation") {
          // Rendered as a lighter-gray span (NOT italic). The disclaimer
          // panel describes this color, so don't reintroduce italic without
          // updating the disclaimer copy in page.tsx to match.
          return (
            <span
              key={i}
              className="text-stone-500"
              title="Extrapolation in this leader's style — not their own words"
            >
              {seg.text}
              {cursor}
            </span>
          );
        }
        // Plain segments include the inter-tag whitespace; preserve
        // newline-style breaks for paragraph spacing.
        if (seg.text.includes("\n\n")) {
          // Split into paragraph breaks
          const parts = seg.text.split(/\n\n+/);
          return (
            <span key={i}>
              {parts.map((p, j) => (
                <span key={j}>
                  {p}
                  {j < parts.length - 1 && <span className="block h-3" />}
                </span>
              ))}
              {cursor}
            </span>
          );
        }
        return (
          <span key={i} className="text-stone-700">
            {seg.text}
            {cursor}
          </span>
        );
      })}
    </div>
  );
}
