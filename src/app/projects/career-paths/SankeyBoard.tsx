"use client";

/**
 * The vertical sankey, drawn progressively as the reader plays. Bands the
 * reader has reached show the crowd's flow faintly with the reader's own
 * ribbons on top; future bands are a hairline and a year label. At the end
 * the whole crowd comes up to reading opacity with share labels.
 *
 * The SVG is laid out in container pixels (measured with a ResizeObserver),
 * so the choice buttons, a plain DOM row, can sit at the current band's y.
 */

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { fmtPct } from "./format";
import {
  type Layout, type LayoutLink, type LayoutNode, layoutSankey, NODE_COLOR, NODE_LABEL, ribbonPath, widen,
} from "./sankeyLayout";
import type { AdventureView } from "./useAdventure";
import type { Flows } from "./useModel";

const PATH_MIN_W = 3;
const LABEL_SHARE = 0.03;

function useWidth(ref: React.RefObject<HTMLDivElement | null>, active: boolean): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    // ResizeObserver reports once on observe, which covers the tab unhiding.
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, active]);
  return width;
}

/** A hairline ribbon for a path step the crowd never took. */
function synthetic(src: LayoutNode, dst: LayoutNode, nodeH: number): LayoutLink {
  const cx0 = src.x + src.w / 2;
  const cx1 = dst.x + dst.w / 2;
  return {
    id: `${src.id}>${dst.id}`, src, dst, count: 0, share: 0, forced: false,
    x0a: cx0, x0b: cx0, y0: src.y + nodeH, x1a: cx1, x1b: cx1, y1: dst.y,
  };
}

interface Props {
  flows: Flows;
  years: number[];
  view: AdventureView;
  active: boolean;
  /** The choice row (or forced-event notice) for the current band. */
  overlay: ReactNode;
}

export default function SankeyBoard({ flows, years, view, active, overlay }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const measured = useWidth(wrap, active);
  const width = measured || 960;
  const narrow = width < 640;

  const layout: Layout = useMemo(
    () => layoutSankey(flows, years, { width, bandH: narrow ? 216 : 132, marginL: narrow ? 44 : 56 }),
    [flows, years, width, narrow],
  );

  const { status, pathIds, pathForced } = view;
  const done = status === "done";
  const currentBand = status === "start" ? 0 : view.step + 1;
  const pathNodes = useMemo(() => new Set(pathIds), [pathIds]);
  const pathLinks = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 1; i < pathIds.length; i++) ids.add(`${pathIds[i - 1]}>${pathIds[i]}`);
    return ids;
  }, [pathIds]);

  // The reader's ribbons, widened so a rare step is still visible, plus any
  // step the crowd's 60,000 careers never produced. Hatched when the
  // reader's own block was forced, whatever the crowd did on that ribbon.
  const ownLinks = useMemo(() => {
    const byId = new Map(layout.links.map((l) => [l.id, l]));
    const out: LayoutLink[] = [];
    pathIds.slice(1).forEach((dstId, i) => {
      const srcId = pathIds[i];
      const src = layout.byId.get(srcId);
      const dst = layout.byId.get(dstId);
      const known = byId.get(`${srcId}>${dstId}`) ?? (src && dst ? synthetic(src, dst, layout.nodeH) : null);
      if (known) out.push({ ...widen(known, PATH_MIN_W), forced: pathForced[i] });
    });
    return out;
  }, [layout, pathIds, pathForced]);

  const band = layout.bands[Math.min(currentBand, layout.bands.length - 1)];
  const overlayTop = band.y + layout.nodeH + 12;

  // Nothing draws until the container has been measured, so the reader never
  // sees a 960px layout squeezed into a phone.
  if (!measured) return <div className="cp-adv-board" ref={wrap} style={{ minHeight: layout.height }} />;

  return (
    <div className="cp-adv-board" ref={wrap}>
      <svg
        className="cp-adv-svg"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="Career flows by milestone year, with your own path highlighted"
      >
        <defs>
          <pattern id="cp-adv-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#ffffff" />
            <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2.5" style={{ stroke: "var(--forced)" }} />
          </pattern>
        </defs>

        {/* Band rules and year labels */}
        {layout.bands.map((b) => (
          <g key={b.year} className="cp-adv-band">
            <line
              x1={layout.marginL} x2={layout.width} y1={b.y + layout.nodeH} y2={b.y + layout.nodeH}
              className="cp-adv-rule"
            />
            <text x={0} y={b.y + layout.nodeH - 4} className="cp-adv-year">
              {b.year === 0 ? "Start" : `Year ${b.year}`}
            </text>
          </g>
        ))}

        {/* The crowd */}
        <g className={`cp-adv-links ${done ? "done" : ""}`}>
          {layout.links.map((l) => {
            const shown = done || l.dst.band <= currentBand;
            const own = pathLinks.has(l.id);
            const labelled = done && !own && l.share >= LABEL_SHARE && l.x0b - l.x0a >= 22;
            return (
              <g key={l.id} className={`cp-adv-link ${shown ? "shown" : ""}`}>
                <path
                  d={ribbonPath(l)}
                  fill={l.forced ? "url(#cp-adv-hatch)" : NODE_COLOR[l.src.key]}
                  fillOpacity={done ? 0.3 : 0.12}
                >
                  <title>
                    {`${NODE_LABEL[l.src.key]} at ${l.src.year} → ${NODE_LABEL[l.dst.key]} at ${l.dst.year}: `
                      + `${fmtPct(l.share, l.share < 0.01 ? 1 : 0)} of ${NODE_LABEL[l.src.key].toLowerCase()}`
                      + (l.forced ? ", mostly forced" : "")}
                  </title>
                </path>
                {labelled && (
                  <text
                    className="cp-adv-share"
                    x={(l.x0a + l.x0b) / 2}
                    y={l.y0 + 14}
                    textAnchor="middle"
                  >
                    {fmtPct(l.share)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* The reader */}
        <g className="cp-adv-own">
          {ownLinks.map((l) => (
            <path
              key={l.id}
              className="cp-adv-own-link"
              d={ribbonPath(l)}
              fill={l.forced ? "url(#cp-adv-hatch)" : NODE_COLOR[l.src.key]}
            />
          ))}
        </g>

        {/* Nodes */}
        <g className="cp-adv-nodes">
          {layout.nodes.map((n) => {
            const shown = done || n.band <= currentBand;
            const own = pathNodes.has(n.id);
            return (
              <g key={n.id} className={`cp-adv-node ${shown ? "shown" : ""} ${own ? "own" : ""}`}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={NODE_COLOR[n.key]}>
                  <title>{`${NODE_LABEL[n.key]}, year ${n.year}: ${n.count.toLocaleString()} careers`}</title>
                </rect>
                {n.w >= 64 && (
                  <text x={n.x + 6} y={n.y + n.h - 4.5} className="cp-adv-node-label">
                    {NODE_LABEL[n.key]}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {overlay && (
        <div className="cp-adv-overlay" style={{ top: overlayTop, left: layout.marginL }}>
          {overlay}
        </div>
      )}
    </div>
  );
}
