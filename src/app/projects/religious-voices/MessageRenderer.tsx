"use client";

import { useMemo } from "react";

// Streaming-aware parser for the model's `<quote>...</quote>` and
// `<extrapolation>...</extrapolation>` tags.
//
// Re-runs from scratch on every accumulated-text update — simpler than a
// stateful parser, and the cost is negligible (≤ a few hundred characters
// of scanning per delta). Handles partial tags arriving mid-stream by
// stopping at the first incomplete tag boundary.

type Segment =
  | { type: "quote"; text: string }
  | { type: "extrapolation"; text: string }
  | { type: "plain"; text: string };

const QUOTE_OPEN = "<quote>";
const QUOTE_CLOSE = "</quote>";
const EXTRAP_OPEN = "<extrapolation>";
const EXTRAP_CLOSE = "</extrapolation>";

function parseStream(text: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const openIdx = text.indexOf("<", i);
    if (openIdx === -1) {
      const tail = text.slice(i);
      if (tail.trim()) segments.push({ type: "plain", text: tail });
      break;
    }
    if (openIdx > i) {
      const plain = text.slice(i, openIdx);
      if (plain.trim()) segments.push({ type: "plain", text: plain });
    }
    if (text.startsWith(QUOTE_OPEN, openIdx)) {
      const closeIdx = text.indexOf(QUOTE_CLOSE, openIdx + QUOTE_OPEN.length);
      if (closeIdx === -1) {
        const content = text.slice(openIdx + QUOTE_OPEN.length);
        if (content) segments.push({ type: "quote", text: content });
        break;
      }
      segments.push({
        type: "quote",
        text: text.slice(openIdx + QUOTE_OPEN.length, closeIdx),
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
      const rest = text.slice(openIdx);
      const isPartial =
        QUOTE_OPEN.startsWith(rest) ||
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
  // True while text is still streaming; renders a soft cursor on the
  // tail-most segment so the user sees something is happening.
  streaming?: boolean;
}

export function MessageRenderer({ content, streaming = false }: Props) {
  const segments = useMemo(() => parseStream(content), [content]);
  return (
    <div className="space-y-3 leading-relaxed text-[15px]">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const cursor = streaming && isLast ? <span className="inline-block w-[2px] h-[1em] align-[-2px] bg-stone-500 ml-[1px] animate-pulse" /> : null;
        if (seg.type === "quote") {
          return (
            <span
              key={i}
              className="text-stone-900 [&+span]:ml-[0.35em]"
              title="Drawn from this leader's published writings"
            >
              {seg.text}
              {cursor}
            </span>
          );
        }
        if (seg.type === "extrapolation") {
          return (
            <em
              key={i}
              className="not-italic text-stone-500 italic [&+span]:ml-[0.35em] [&+em]:ml-[0.35em]"
              title="Extrapolation in this leader's style — not their own words"
            >
              {seg.text}
              {cursor}
            </em>
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
