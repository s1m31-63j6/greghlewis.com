"use client";

import { useEffect, useRef } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import {
  CanvasTexture,
  Group,
  Sprite,
  SpriteMaterial,
  type Object3D,
  type Scene,
} from "three";
import {
  POSITION_COLORS,
  type CompGraphData,
  type CompNode,
  type Position,
} from "./types";
import type { FilterMode } from "./Header";

type GraphNode = Omit<CompNode, "x" | "y" | "z"> & {
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
};

type GraphLink = {
  source: string;
  target: string;
  similarity: number;
};

interface Props {
  data: CompGraphData;
  selectedId: string | null;
  // Second pinned prospect for compare mode. Renders as a position-colored
  // ring (vs. the primary's solid black fill) so the user can read which
  // node is the "anchor" vs. the "compare partner" at a glance.
  compareWithId: string | null;
  onSelect: (node: CompNode | null) => void;
  // Cmd/shift click handler for pinning a compare partner without
  // displacing the primary selection.
  onCompareToggle: (node: CompNode) => void;
  filter: FilterMode;
  // Players that the chat answer mentioned. When non-empty, the camera
  // flies to fit them and they read as full-chroma against a paled rest.
  chatFocusedIds: string[];
  // Sub-cluster archetype assignments. Currently consumed by SidePanel for
  // the chip; the graph accepts the prop so the data is in scope for a
  // future 3D archetype-label sprite pass without re-piping props.
  archetypes: import("./archetypes").ArchetypeAssignments | null;
}

type ForceGraphInstance = ForceGraph3DInstance;

const CLUSTER_SEPARATION = 3.0;
// UMAP intra-cluster spread is only ~3-6 units; with cluster centers at ±42
// each cluster collapses into a visual dot. Stretch intra-cluster relative
// positions so individual prospects within a cluster are distinguishable.
const INTRA_CLUSTER_SPREAD = 12.0;

// Per-position z-tilt added to the bundle's flat 2D position_offsets_3d, so
// QB↔WR sit slightly below the camera focus and RB↔TE slightly above. Reads
// as 3D depth without re-running the engine.
const POSITION_Z_TILT: Record<Position, number> = {
  QB: -8,
  WR: -8,
  RB: 8,
  TE: 8,
};

// Deterministic per-node jitter so identical UMAP coords don't render on
// top of each other. Hash the id, map to [-1, 1], scale to JITTER_AMP.
const JITTER_AMP = 1.4;
function jitter(id: string, axis: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= axis * 2654435761;
  // Map to [-1, 1]
  return (((h >>> 0) % 10000) / 10000 - 0.5) * 2 * JITTER_AMP;
}

type SceneFrame = {
  center: { x: number; y: number; z: number };
  camDist: number;
};

function frameFor(
  nodes: { x: number; y: number; z: number }[],
  fovHalfDeg = 22.5,
  fillFactor = 0.7,
): SceneFrame {
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  let zMin = Infinity, zMax = -Infinity;
  for (const n of nodes) {
    if (n.x < xMin) xMin = n.x; if (n.x > xMax) xMax = n.x;
    if (n.y < yMin) yMin = n.y; if (n.y > yMax) yMax = n.y;
    if (n.z < zMin) zMin = n.z; if (n.z > zMax) zMax = n.z;
  }
  const center = {
    x: (xMin + xMax) / 2,
    y: (yMin + yMax) / 2,
    z: (zMin + zMax) / 2,
  };
  const halfDiag = Math.hypot(
    (xMax - xMin) / 2,
    (yMax - yMin) / 2,
    (zMax - zMin) / 2,
  );
  const camDist = halfDiag / Math.tan((Math.PI / 180) * fovHalfDeg) * fillFactor;
  return { center, camDist };
}

const CAM_OBLIQUE = { x: 0.25, y: -0.55, z: 0.85 };

function cameraPosFor(frame: SceneFrame) {
  return {
    x: frame.center.x + frame.camDist * CAM_OBLIQUE.x,
    y: frame.center.y + frame.camDist * CAM_OBLIQUE.y,
    z: frame.center.z + frame.camDist * CAM_OBLIQUE.z,
  };
}

// On a light background we want recessive nodes to be LIGHTER (closer to bg),
// not darker — so the highlight cohort pops while the historical cohort
// reads as a quiet, dimmer cloud. mix(hex, white, t) where larger t → paler.
function paleMix(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b))
    .toString(16)
    .padStart(6, "0")}`;
}

function makeTextSprite(opts: {
  text: string;
  color: string;
  bg?: string;
  fontSize?: number;
  fontWeight?: number;
  scale?: number;
  yOffset?: number;
  opacity?: number;
  // alwaysOnTop: render the sprite through any geometry in front of it,
  // and bump renderOrder so it draws after the rest of the scene. Used
  // for archetype labels so they're never occluded by the node cloud
  // regardless of camera angle.
  alwaysOnTop?: boolean;
}): Sprite {
  const {
    text,
    color,
    bg = "rgba(10,10,10,0.78)",
    fontSize = 24,
    fontWeight = 600,
    scale = 0.045,
    yOffset = 5,
    opacity = 1,
    alwaysOnTop = false,
  } = opts;
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1;
  const padX = 12;
  const padY = 6;
  const canvas = document.createElement("canvas");
  const measureCtx = canvas.getContext("2d")!;
  measureCtx.font = `${fontWeight} ${fontSize}px ui-sans-serif, system-ui, -apple-system`;
  const textWidth = measureCtx.measureText(text).width;
  const w = Math.ceil(textWidth + padX * 2);
  const h = fontSize + padY * 2;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  if (bg) {
    ctx.fillStyle = bg;
    const r = 4;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.font = `${fontWeight} ${fontSize}px ui-sans-serif, system-ui, -apple-system`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  const tex = new CanvasTexture(canvas);
  tex.minFilter = tex.magFilter = 1006;
  const mat = new SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    // depthTest=false is what makes the sprite render through any nodes
    // or edges that happen to be in front of it from the current camera.
    depthTest: !alwaysOnTop,
    opacity,
  });
  const sprite = new Sprite(mat);
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.position.y = yOffset;
  sprite.raycast = () => {};
  if (alwaysOnTop) sprite.renderOrder = 999;
  return sprite;
}

export default function CompGraph({
  data,
  selectedId,
  compareWithId,
  onSelect,
  onCompareToggle,
  filter,
  chatFocusedIds,
  archetypes,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphInstance | null>(null);
  const ambientLabelsRef = useRef<{ pos: Position; sprite: Sprite }[]>([]);
  // Sub-cluster archetype sprites — one per (position, archetype). More
  // prominent than the ambient position labels because users actually need
  // to read these. Hidden when the position filter excludes the cluster.
  const archetypeLabelsRef = useRef<{ pos: Position; sprite: Sprite }[]>([]);
  const initialFrameRef = useRef<SceneFrame | null>(null);
  const nodesByPositionRef = useRef<GraphNode[]>([]);
  const previousSelectedRef = useRef<string | null>(null);
  const filterRef = useRef<FilterMode>(filter);
  // eslint-disable-next-line react-hooks/refs -- intentional render-time mirror so effects below can read the latest filter without re-firing
  filterRef.current = filter;
  // Recolor effect needs to know the latest chat-focused set without
  // re-firing when only the focus changes. The dedicated focus effect
  // handles the camera; this ref lets the recolor read it on demand.
  const chatFocusedRef = useRef<Set<string>>(new Set());
  // Compare partner id, mirrored for the recolor callback (same pattern as
  // chatFocusedRef — node color closure reads it on demand without
  // recreating the ForceGraph3D instance).
  const compareWithRef = useRef<string | null>(null);
  // Same pattern for selectedId: the nodeVal closure (set up at construct
  // time) needs to size up the active node, but we don't want React to
  // rebuild the entire graph just because selection changed.
  const selectedIdRef = useRef<string | null>(null);
  // eslint-disable-next-line react-hooks/refs
  selectedIdRef.current = selectedId;
  // Click handlers updated via ref so we can swap them without rebuilding
  // the ForceGraph instance when the parent re-renders with new closures.
  const onSelectRef = useRef(onSelect);
  const onCompareToggleRef = useRef(onCompareToggle);
  // eslint-disable-next-line react-hooks/refs -- render-time handler mirror
  onSelectRef.current = onSelect;
  // eslint-disable-next-line react-hooks/refs
  onCompareToggleRef.current = onCompareToggle;

  useEffect(() => {
    if (!containerRef.current) return;

    const offsets = data.meta.position_offsets_3d;
    const boost = CLUSTER_SEPARATION - 1;

    const rawNodes = data.nodes.filter(
      (n): n is CompNode & { x: number; y: number; z: number } =>
        n.visible_in_graph && n.x !== null && n.y !== null && n.z !== null,
    );
    // Per-position raw-UMAP centroid. Used to stretch intra-cluster offsets.
    const umapCentroids: Partial<Record<Position, [number, number, number, number]>> = {};
    for (const n of rawNodes) {
      const c = umapCentroids[n.position] ?? [0, 0, 0, 0];
      c[0] += n.x; c[1] += n.y; c[2] += n.z; c[3] += 1;
      umapCentroids[n.position] = c;
    }
    const meanFor = (p: Position) => {
      const c = umapCentroids[p]!;
      return [c[0] / c[3], c[1] / c[3], c[2] / c[3]] as const;
    };

    const visibleNodes: GraphNode[] = rawNodes.map((n) => {
      const off = offsets[n.position];
      const [mx, my, mz] = meanFor(n.position);
      // Recenter intra-cluster relative position, stretch, then place at
      // boosted cluster centroid + z-tilt + per-node jitter (breaks ties
      // between near-identical UMAP coords like Drew Allar / Carson Beck).
      const rx = (n.x - mx) * INTRA_CLUSTER_SPREAD + jitter(n.id, 0);
      const ry = (n.y - my) * INTRA_CLUSTER_SPREAD + jitter(n.id, 1);
      const rz = (n.z - mz) * INTRA_CLUSTER_SPREAD + jitter(n.id, 2);
      const x = mx + rx + off[0] * boost;
      const y = my + ry + off[1] * boost;
      const z = mz + rz + off[2] * boost + POSITION_Z_TILT[n.position];
      // fx/fy/fz freeze the node so the d3-force simulation can't drag
      // clusters back together — UMAP+offset positions are authoritative.
      return { ...n, x, y, z, fx: x, fy: y, fz: z };
    });
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges: GraphLink[] = data.edges
      .filter((e) => e.in_graph && visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, similarity: e.similarity }));

    const centroids: Partial<Record<Position, { x: number; y: number; z: number; count: number }>> = {};
    for (const n of visibleNodes) {
      const c = centroids[n.position] ?? { x: 0, y: 0, z: 0, count: 0 };
      c.x += n.x; c.y += n.y; c.z += n.z; c.count += 1;
      centroids[n.position] = c;
    }
    const initialFrame = frameFor(visibleNodes);
    initialFrameRef.current = initialFrame;
    nodesByPositionRef.current = visibleNodes;

    const labelCache = new Map<string, Sprite>();
    const emptyObject = new Group();
    const getLabel = (n: GraphNode): Object3D => {
      if (!n.highlight) return emptyObject;
      let s = labelCache.get(n.id);
      if (!s) {
        s = makeTextSprite({
          text: n.name,
          color: "#1a1a1a",
          bg: "rgba(252,252,250,0.92)",
          fontSize: 22,
          fontWeight: 600,
          scale: 0.04,
          yOffset: 4,
        });
        labelCache.set(n.id, s);
      }
      return s;
    };

    const graph = new ForceGraph3D(containerRef.current)
      .backgroundColor("#fafaf7")
      .graphData({ nodes: visibleNodes, links: visibleEdges })
      .nodeId("id")
      .nodeLabel((raw) => {
        const n = raw as GraphNode;
        return `<div style="font:600 13px ui-sans-serif,system-ui;color:#1a1a1a;background:rgba(252,252,250,0.96);padding:6px 10px;border-radius:6px;border:1px solid rgba(20,20,20,0.12);box-shadow:0 2px 8px rgba(0,0,0,0.08)">${n.name}<div style="font-weight:400;color:rgba(40,40,40,0.6);font-size:11px;margin-top:2px">${n.position} · ${n.bio.college ?? "—"}</div></div>`;
      })
      .nodeColor((raw) => {
        const n = raw as GraphNode;
        const base = POSITION_COLORS[n.position];
        // Highlight: full deep color. Historical: paled 70% toward bg so it
        // recedes as a quiet cloud without disappearing.
        return n.highlight ? base : paleMix(base, 0.7);
      })
      // Pen-drawn aesthetic: tiny, smooth dots. Resolution 16 kills the
      // polygonal facets we had at res 10. Selected + compare partner are
      // sized up so the pair reads as the active subject from any angle.
      .nodeVal((raw) => {
        const n = raw as GraphNode;
        if (n.id === selectedIdRef.current || n.id === compareWithRef.current)
          return 0.45;
        return n.highlight ? 0.22 : 0.05;
      })
      .nodeOpacity(1.0)
      .nodeResolution(16)
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((raw): Object3D => getLabel(raw as GraphNode))
      // Hairline edges in muted graphite — reads as pen, not marker.
      .linkColor(() => "rgba(40,40,50,0.28)")
      .linkOpacity(0.55)
      .linkWidth((raw) => Math.max(0.04, (raw as GraphLink).similarity * 0.18))
      // Lock down node dragging — positions are precomputed/frozen, dragging
      // would only ever desync the visual from the underlying coords.
      .enableNodeDrag(false)
      // Nodes are fixed via fx/fy/fz, so there's nothing for the simulation
      // to do. Skip ticks entirely to avoid the camera-yank on engine stop.
      .cooldownTicks(0)
      .onNodeClick((raw, event) => {
        const n = raw as GraphNode;
        // Cmd/ctrl/shift modifier → pin as compare partner instead of
        // displacing the primary selection. ForceGraph3D forwards the
        // native MouseEvent as the second arg.
        const ev = event as MouseEvent | undefined;
        if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey)) {
          onCompareToggleRef.current(n as unknown as CompNode);
          return;
        }
        onSelectRef.current(n as unknown as CompNode);
        // Camera fly is handled by the selection useEffect below so manual
        // clicks and chat-driven selections behave identically.
      })
      .onBackgroundClick(() => onSelectRef.current(null));

    graphRef.current = graph;

    // Frame the camera obliquely (slightly tilted, slightly rotated) so the
    // x/y cross of clusters reads as 3D depth instead of a flat disc. Set
    // synchronously after graphData so the user only ever sees the settled view.
    graph.cameraPosition(cameraPosFor(initialFrame), initialFrame.center, 0);

    const scene = graph.scene() as Scene;
    const ambientLabels: { pos: Position; sprite: Sprite }[] = [];
    (Object.entries(centroids) as [Position, NonNullable<typeof centroids[Position]>][]).forEach(
      ([pos, c]) => {
        if (!c || c.count === 0) return;
        const cx = c.x / c.count;
        const cy = c.y / c.count;
        const cz = c.z / c.count;
        const sprite = makeTextSprite({
          text: pos,
          color: POSITION_COLORS[pos],
          bg: "",
          fontSize: 96,
          fontWeight: 700,
          scale: 0.13,
          yOffset: 0,
          opacity: 0.13,
        });
        sprite.position.set(cx, cy + 18, cz);
        scene.add(sprite);
        ambientLabels.push({ pos, sprite });
      },
    );
    ambientLabelsRef.current = ambientLabels;

    // Sub-cluster archetype labels. Compute centroids in DISPLAY space (the
    // raw archetype.centroid is pre-spread/offset/jitter), then render a
    // sprite per cluster styled to read at a glance — full-chroma position
    // color, light pill background for legibility against the node cloud.
    const archetypeLabels: { pos: Position; sprite: Sprite }[] = [];
    if (archetypes) {
      type ArchAcc = { x: number; y: number; z: number; count: number; pos: Position };
      const archDisplayCentroids = new Map<string, ArchAcc>();
      for (const n of visibleNodes) {
        const archId = archetypes.nodeArchetype.get(n.id);
        if (!archId) continue;
        const cur = archDisplayCentroids.get(archId) ?? {
          x: 0, y: 0, z: 0, count: 0, pos: n.position,
        };
        cur.x += n.x; cur.y += n.y; cur.z += n.z; cur.count += 1;
        archDisplayCentroids.set(archId, cur);
      }
      for (const [archId, acc] of archDisplayCentroids) {
        if (acc.count === 0) continue;
        const arch = archetypes.archetypeById.get(archId);
        if (!arch) continue;
        const cx = acc.x / acc.count;
        const cy = acc.y / acc.count;
        const cz = acc.z / acc.count;
        const sprite = makeTextSprite({
          text: arch.label,
          color: POSITION_COLORS[acc.pos],
          bg: "rgba(252,252,250,0.70)",
          fontSize: 32,
          fontWeight: 600,
          scale: 0.055,
          // Slightly above the cluster's mean y so the label rides over
          // the node cloud rather than sitting inside it.
          yOffset: 8,
          opacity: 0.75,
          // Always-on-top so labels stay legible from any camera angle —
          // the always-on-top trick does the visual heavy lifting, so the
          // base size + opacity stay subtle.
          alwaysOnTop: true,
        });
        sprite.position.set(cx, cy, cz);
        scene.add(sprite);
        archetypeLabels.push({ pos: acc.pos, sprite });
      }
    }
    archetypeLabelsRef.current = archetypeLabels;

    const handleResize = () => {
      if (!containerRef.current) return;
      graph
        .width(containerRef.current.clientWidth)
        .height(containerRef.current.clientHeight);
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      for (const { sprite } of ambientLabels) scene.remove(sprite);
      for (const { sprite } of archetypeLabels) scene.remove(sprite);
      ambientLabelsRef.current = [];
      archetypeLabelsRef.current = [];
      graph._destructor();
      graphRef.current = null;
      labelCache.clear();
    };
  }, [data, archetypes, onSelect]);

  // Selection-driven recolor + camera fly. Fires for both manual clicks
  // and programmatic selection (e.g., chat resolves a single subject), so
  // the fly behavior is consistent regardless of how selection was set.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    // Fly to the newly-selected node (preserves view direction so the
    // user's mental orientation isn't lost on a chat-driven selection).
    if (selectedId !== null && selectedId !== previousSelectedRef.current) {
      const target = nodesByPositionRef.current.find((n) => n.id === selectedId);
      if (target) {
        const cam = graph.cameraPosition();
        const dx = cam.x - target.x;
        const dy = cam.y - target.y;
        const dz = cam.z - target.z;
        const currentDist = Math.hypot(dx, dy, dz) || 1;
        const targetDist = 28;
        const ratio = targetDist / currentDist;
        graph.cameraPosition(
          {
            x: target.x + dx * ratio,
            y: target.y + dy * ratio,
            z: target.z + dz * ratio,
          },
          { x: target.x, y: target.y, z: target.z },
          1100,
        );
      }
    }

    graph.nodeColor((raw) => {
      const n = raw as GraphNode;
      const base = POSITION_COLORS[n.position];
      const isHighlight = n.highlight;
      const isChatFocus = chatFocusedRef.current.has(n.id);
      // Single-selection takes precedence — solid black against cream pops
      // best for the active panel subject.
      if (n.id === selectedId) return "#1a1a1a";
      // Compare partner: full position chroma + sized up. Reads as a peer
      // of the primary without looking selected (different fill, different
      // size from the primary's solid black).
      if (n.id === compareWithRef.current) return base;
      // Multi-mention chat focus (no selection): focus nodes get full chroma,
      // everything else extra-paled so the answer's subjects read clearly.
      if (chatFocusedRef.current.size > 0) {
        if (isChatFocus) return base;
        return paleMix(base, isHighlight ? 0.7 : 0.9);
      }
      if (selectedId === null) return isHighlight ? base : paleMix(base, 0.7);
      return paleMix(base, isHighlight ? 0.55 : 0.82);
    });
    // Refresh nodeVal too so the compare partner picks up the size bump.
    graph.nodeVal(graph.nodeVal());
    if (selectedId === null && previousSelectedRef.current !== null && chatFocusedRef.current.size === 0) {
      const activeFilter = filterRef.current;
      const targetNodes =
        activeFilter === "ALL"
          ? nodesByPositionRef.current
          : nodesByPositionRef.current.filter((n) => n.position === activeFilter);
      if (targetNodes.length > 0) {
        const f = frameFor(targetNodes, 22.5, activeFilter === "ALL" ? 0.75 : 1.4);
        graph.cameraPosition(cameraPosFor(f), f.center, 900);
      }
    }
    previousSelectedRef.current = selectedId;
  }, [selectedId]);

  // Compare-partner pin/unpin: just mirror to the ref + retrigger color/size.
  // No camera fly here — the user already has the primary framed and we
  // don't want a second jolt when they cmd-click a peer.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    compareWithRef.current = compareWithId;
    graph.nodeColor(graph.nodeColor());
    graph.nodeVal(graph.nodeVal());
  }, [compareWithId]);

  // Chat-focus driven camera fly + recolor.
  // - 1 mentioned player: handled by selectedId via CompExplorer (auto-select),
  //   so this effect only runs for 2+ mentions.
  // - 2+: fit camera to the bounding box of those nodes and recolor.
  // - cleared (length 0): restore framing for the active filter.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    chatFocusedRef.current = new Set(chatFocusedIds);

    if (chatFocusedIds.length >= 2) {
      const all = nodesByPositionRef.current;
      const targets = all.filter((n) => chatFocusedRef.current.has(n.id));
      if (targets.length > 0) {
        // Generous fillFactor so the camera doesn't cram the cluster
        // against the viewport edge — readable at one glance is the goal.
        const frame = frameFor(targets, 22.5, 1.3);
        graph.cameraPosition(cameraPosFor(frame), frame.center, 1100);
      }
    } else if (chatFocusedIds.length === 0 && selectedId === null) {
      // Restore default framing only when there's nothing else focused.
      const activeFilter = filterRef.current;
      const targetNodes =
        activeFilter === "ALL"
          ? nodesByPositionRef.current
          : nodesByPositionRef.current.filter((n) => n.position === activeFilter);
      if (targetNodes.length > 0) {
        const f = frameFor(targetNodes, 22.5, activeFilter === "ALL" ? 0.75 : 1.4);
        graph.cameraPosition(cameraPosFor(f), f.center, 900);
      }
    }

    // Re-trigger the color callback so chat-focus styling applies.
    graph.nodeColor(graph.nodeColor());
  }, [chatFocusedIds, selectedId]);

  // Position filter — controls visibility + flies camera to the cluster's
  // own oblique frame (preserves the camera angle, doesn't yank to a chain).
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const matches = (n: GraphNode) => filter === "ALL" || n.position === filter;
    graph.nodeVisibility((raw) => matches(raw as GraphNode));
    graph.linkVisibility((raw) => {
      const link = raw as GraphLink & {
        source: string | GraphNode;
        target: string | GraphNode;
      };
      const src = typeof link.source === "object" ? link.source : null;
      const tgt = typeof link.target === "object" ? link.target : null;
      if (!src || !tgt) return filter === "ALL";
      return matches(src) && matches(tgt);
    });
    // Hide ambient labels for non-matching positions. The lint rule flags
    // these as "ref mutation" — they're actually Three.js scene-graph
    // mutations on objects we own (sprites we created), which is the
    // correct way to update the rendered scene from a React effect.
    for (const { pos, sprite } of ambientLabelsRef.current) {
      // eslint-disable-next-line react-hooks/immutability
      sprite.visible = filter === "ALL" || pos === filter;
    }
    for (const { pos, sprite } of archetypeLabelsRef.current) {
      // eslint-disable-next-line react-hooks/immutability
      sprite.visible = filter === "ALL" || pos === filter;
    }
    const targetNodes =
      filter === "ALL"
        ? nodesByPositionRef.current
        : nodesByPositionRef.current.filter((n) => n.position === filter);
    if (targetNodes.length === 0) return;
    // fillFactor < 1.0 pushes the camera closer than fit-exactly. The All
    // view tolerates some crop because the cluster cross is still readable.
    // For a single-cluster filter view we want breathing room around the
    // cluster, so push the camera further out.
    const frame = frameFor(targetNodes, 22.5, filter === "ALL" ? 0.75 : 1.4);
    graph.cameraPosition(cameraPosFor(frame), frame.center, 800);
  }, [filter]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
