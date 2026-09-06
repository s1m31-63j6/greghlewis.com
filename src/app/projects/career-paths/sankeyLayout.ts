/**
 * A hand-rolled vertical sankey: one band per milestone year, nodes laid
 * left to right in a fixed canonical order, ribbons dropping from a source
 * node's bottom edge to a target's top edge. Everything is in pixels of the
 * measured container, so the DOM overlay (the choice buttons) can sit on a
 * band's y without any viewBox arithmetic.
 */

import type { NodeKey } from "./engine/types.ts";
import type { Flows } from "./useModel";

export const NODE_ORDER: NodeKey[] = ["startup", "corporate", "consulting", "founder", "mba", "partner", "exited"];

export const NODE_COLOR: Record<NodeKey, string> = {
  startup: "var(--startup)",
  corporate: "var(--corporate)",
  consulting: "var(--consulting)",
  founder: "var(--founder)",
  gradschool: "var(--mba)",
  mba: "var(--mba)",
  partner: "var(--consulting)",
  exited: "var(--ink)",
};

export const NODE_LABEL: Record<NodeKey, string> = {
  startup: "Startup",
  corporate: "Corporate",
  consulting: "Consulting",
  founder: "Founder",
  gradschool: "MBA",
  mba: "MBA",
  partner: "Partner",
  exited: "Exited",
};

export interface LayoutNode {
  id: string;
  year: number;
  band: number;
  key: NodeKey;
  count: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutLink {
  id: string;
  src: LayoutNode;
  dst: LayoutNode;
  count: number;
  /** Share of the source node's careers that took this ribbon. */
  share: number;
  /** More than half of these moves were a shutdown, layoff, counseling-out or exit. */
  forced: boolean;
  /** Source span [x0a, x0b] at y0; target span [x1a, x1b] at y1. */
  x0a: number; x0b: number; y0: number;
  x1a: number; x1b: number; y1: number;
}

export interface Band { index: number; year: number; y: number }

export interface Layout {
  width: number;
  height: number;
  bandH: number;
  nodeH: number;
  marginL: number;
  bands: Band[];
  nodes: LayoutNode[];
  links: LayoutLink[];
  byId: Map<string, LayoutNode>;
}

export interface LayoutOptions {
  width: number;
  bandH: number;
  nodeH?: number;
  gap?: number;
  marginL?: number;
  padTop?: number;
  padBottom?: number;
  minW?: number;
}

/** The ribbon outline: two cubic edges joined at the node faces. */
export function ribbonPath(l: Pick<LayoutLink, "x0a" | "x0b" | "y0" | "x1a" | "x1b" | "y1">): string {
  const ym = (l.y0 + l.y1) / 2;
  return [
    `M${l.x0a},${l.y0}`,
    `C${l.x0a},${ym} ${l.x1a},${ym} ${l.x1a},${l.y1}`,
    `L${l.x1b},${l.y1}`,
    `C${l.x1b},${ym} ${l.x0b},${ym} ${l.x0b},${l.y0}`,
    "Z",
  ].join(" ");
}

/** The same ribbon with each end no narrower than `min`, for the reader's own thin path. */
export function widen(l: LayoutLink, min: number): LayoutLink {
  const grow = (a: number, b: number): [number, number] => {
    if (b - a >= min) return [a, b];
    const c = (a + b) / 2;
    return [c - min / 2, c + min / 2];
  };
  const [x0a, x0b] = grow(l.x0a, l.x0b);
  const [x1a, x1b] = grow(l.x1a, l.x1b);
  return { ...l, x0a, x0b, x1a, x1b };
}

function sum(o: Record<string, number>): number {
  let t = 0;
  for (const k in o) t += o[k];
  return t;
}

export function layoutSankey(flows: Flows, years: number[], opts: LayoutOptions): Layout {
  const nodeH = opts.nodeH ?? 16;
  const gap = opts.gap ?? 8;
  const marginL = opts.marginL ?? 56;
  const padTop = opts.padTop ?? 8;
  const padBottom = opts.padBottom ?? 8;
  const minW = opts.minW ?? 2;
  const contentW = Math.max(opts.width - marginL, 120);

  const bands: Band[] = years.map((year, index) => ({ index, year, y: padTop + index * opts.bandH }));
  const nodes: LayoutNode[] = [];
  const byId = new Map<string, LayoutNode>();

  for (const band of bands) {
    const present = NODE_ORDER
      .map((key) => ({ key, id: `${band.year}:${key}`, count: flows.nodes[`${band.year}:${key}`]?.count ?? 0 }))
      .filter((n) => n.count > 0);
    const total = present.reduce((t, n) => t + n.count, 0);
    const avail = contentW - gap * (present.length - 1) - minW * present.length;
    let x = marginL;
    for (const n of present) {
      const w = minW + (n.count / total) * avail;
      const node: LayoutNode = { ...n, year: band.year, band: band.index, x, y: band.y, w, h: nodeH };
      nodes.push(node);
      byId.set(n.id, node);
      x += w + gap;
    }
  }

  // Ribbons leave a source in target order and arrive at a target in source
  // order, so the ones that must cross do so as little as possible.
  const outCursor = new Map<string, number>();
  const inCursor = new Map<string, number>();
  const raw = Object.entries(flows.links)
    .map(([id, l]) => {
      const [s, d] = id.split(">");
      const src = byId.get(s);
      const dst = byId.get(d);
      return src && dst ? { id, src, dst, count: l.count, forcedCount: sum(l.forced) } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.src.band - b.src.band || a.src.x - b.src.x || a.dst.x - b.dst.x);

  const links: LayoutLink[] = raw.map((l) => {
    const w0 = (l.count / l.src.count) * l.src.w;
    const w1 = (l.count / l.dst.count) * l.dst.w;
    const o = outCursor.get(l.src.id) ?? 0;
    const i = inCursor.get(l.dst.id) ?? 0;
    outCursor.set(l.src.id, o + w0);
    inCursor.set(l.dst.id, i + w1);
    return {
      id: l.id, src: l.src, dst: l.dst, count: l.count,
      share: l.count / l.src.count,
      forced: l.forcedCount > l.count / 2,
      x0a: l.src.x + o, x0b: l.src.x + o + w0, y0: l.src.y + nodeH,
      x1a: l.dst.x + i, x1b: l.dst.x + i + w1, y1: l.dst.y,
    };
  });

  const height = padTop + (bands.length - 1) * opts.bandH + nodeH + padBottom;
  return { width: opts.width, height, bandH: opts.bandH, nodeH, marginL, bands, nodes, links, byId };
}
