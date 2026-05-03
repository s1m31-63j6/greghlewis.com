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

// Side panel is 420px wide on sm+ screens. When the panel is open the
// visual center of the viewport shifts left, so framing the target at
// the canvas center actually parks it under the panel. We pan both the
// camera and the lookAt rightward in world space so the target rides
// the visible-area center instead. Threshold: only do this when the
// panel actually pushes the visible area meaningfully (sm+ breakpoint).
const PANEL_OFFSET_RATIO = 0.18; // ~ camDist * this in the camera-right direction

function cameraPosFor(frame: SceneFrame) {
  return {
    x: frame.center.x + frame.camDist * CAM_OBLIQUE.x,
    y: frame.center.y + frame.camDist * CAM_OBLIQUE.y,
    z: frame.center.z + frame.camDist * CAM_OBLIQUE.z,
  };
}

// Right vector for a camera at `cam` looking at `target`, in the world
// XZ plane (y stays fixed). Used to pan the view sideways without
// changing the camera's pitch/distance.
function cameraRightVecXZ(
  cam: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): { x: number; z: number } {
  // forward = target - cam; right = cross(forward, worldUp=(0,1,0)) = (fz, 0, -fx)
  const fx = target.x - cam.x;
  const fz = target.z - cam.z;
  const rx = fz, rz = -fx;
  const rmag = Math.hypot(rx, rz) || 1;
  return { x: rx / rmag, z: rz / rmag };
}

// True when the page-level side panel covers the right portion of the
// canvas — i.e., on sm+ breakpoints. Server-render guard so SSR doesn't
// throw; we'll also re-evaluate on the client at fly time.
function panelIsOverlay(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= 640;
}

// Apply the side-panel rightward shift to a (camPos, lookAt) pair when
// the panel is open. Mutates copies and returns them so callers can pass
// the result straight to `graph.cameraPosition`.
function offsetForPanel(
  camPos: { x: number; y: number; z: number },
  lookAt: { x: number; y: number; z: number },
  camDist: number,
  panelOpen: boolean,
): { cam: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number } } {
  if (!panelOpen || !panelIsOverlay()) {
    return { cam: { ...camPos }, lookAt: { ...lookAt } };
  }
  const rv = cameraRightVecXZ(camPos, lookAt);
  const offset = camDist * PANEL_OFFSET_RATIO;
  return {
    cam: { x: camPos.x + rv.x * offset, y: camPos.y, z: camPos.z + rv.z * offset },
    lookAt: { x: lookAt.x + rv.x * offset, y: lookAt.y, z: lookAt.z + rv.z * offset },
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

// Donut/ring sprite drawn to canvas. Used as a halo around the selected
// or compare-pinned prospect so the active subjects pop out of the cloud.
// Stays as a sprite (always faces camera) so the ring reads as a flat
// outline regardless of camera angle — feels editorial, not gamey.
function makeRingSprite(opts: {
  color: string;
  size?: number;
  thickness?: number;
  opacity?: number;
}): Sprite {
  const { color, size = 4.5, thickness = 1.5, opacity = 0.85 } = opts;
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1;
  const canvasSize = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = canvasSize * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2 - thickness, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new CanvasTexture(canvas);
  tex.minFilter = tex.magFilter = 1006;
  const mat = new SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    // depthTest=false so the ring renders through any nodes that happen
    // to overlap it from the current camera angle (otherwise the cluster
    // can occlude the very thing the ring is supposed to highlight).
    depthTest: false,
    opacity,
  });
  const s = new Sprite(mat);
  s.scale.set(size, size, 1);
  s.raycast = () => {};
  s.renderOrder = 998;
  return s;
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
  // Scene-level halo + label sprites for the active subject(s). Created
  // once at mount; repositioned on selection change. Keeping them off the
  // ForceGraph node-object pipeline lets us swap text/visibility cheaply
  // without rebuilding the graph instance.
  const selectedHaloRef = useRef<Sprite | null>(null);
  const compareHaloRef = useRef<Sprite | null>(null);
  // Node-child label cache (in-graph, fixed labels for the highlight
  // cohort) and scene-level label cache (built lazily for any node that
  // becomes selected or compared). Two separate caches because a single
  // Sprite can only have one parent — the highlight node-child label and
  // the selection-aura scene label have to be distinct instances.
  const labelCacheRef = useRef<Map<string, Sprite>>(new Map());
  const sceneLabelCacheRef = useRef<Map<string, Sprite>>(new Map());
  // Tracks which node id each aura slot is currently showing so the
  // updater knows what to hide when the slot changes.
  const previousAuraRef = useRef<{
    selected: string | null;
    compare: string | null;
  }>({ selected: null, compare: null });
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

    const labelCache = labelCacheRef.current;
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
      // Edges react to selection. With 1500+ comp edges, an even hairline
      // wash hides the actual comp web that the selected node sits in. When
      // a node is selected, edges connected to it pop (chroma + width); the
      // rest fade toward the background. The pair edge between selected +
      // compare partner gets the strongest treatment so the comparison reads
      // as a literal connection, not just two pinned points.
      .linkColor((raw) => {
        const link = raw as Omit<GraphLink, "source" | "target"> & {
          source: string | GraphNode;
          target: string | GraphNode;
        };
        const sId = typeof link.source === "object" ? link.source.id : link.source;
        const tId = typeof link.target === "object" ? link.target.id : link.target;
        const sel = selectedIdRef.current;
        const cmp = compareWithRef.current;
        const touchesSel = sel !== null && (sId === sel || tId === sel);
        const touchesCmp = cmp !== null && (sId === cmp || tId === cmp);
        // Pair edge: both endpoints pinned. Strongest possible treatment.
        if (touchesSel && touchesCmp) return "rgba(20,20,20,0.95)";
        // Default state (nothing selected): muted hairline wash.
        if (sel === null && cmp === null) return "rgba(40,40,50,0.30)";
        // Connected to the active subject(s): legible graphite.
        if (touchesSel) return "rgba(20,20,30,0.70)";
        if (touchesCmp) return "rgba(20,20,30,0.45)";
        // Disconnected: ghost. Stays in scene so viewer feels the cloud,
        // but doesn't compete with the focused web.
        return "rgba(40,40,50,0.05)";
      })
      // Opacity baked into the rgba above; 1.0 here so the multiplier doesn't
      // pull our deliberately-strong selection edges back down.
      .linkOpacity(1.0)
      .linkWidth((raw) => {
        const link = raw as Omit<GraphLink, "source" | "target"> & {
          source: string | GraphNode;
          target: string | GraphNode;
        };
        const sId = typeof link.source === "object" ? link.source.id : link.source;
        const tId = typeof link.target === "object" ? link.target.id : link.target;
        const sel = selectedIdRef.current;
        const cmp = compareWithRef.current;
        const touchesSel = sel !== null && (sId === sel || tId === sel);
        const touchesCmp = cmp !== null && (sId === cmp || tId === cmp);
        const base = Math.max(0.04, link.similarity * 0.18);
        if (touchesSel && touchesCmp) return base * 4;
        if (touchesSel) return base * 2.4;
        if (touchesCmp) return base * 1.6;
        return base;
      })
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

    // Halo + label sprites for the active subject(s). Created hidden;
    // selection/compare effects toggle visibility + reposition.
    const selectedHalo = makeRingSprite({
      color: "#1a1a1a",
      size: 5.0,
      thickness: 2.0,
      opacity: 0.95,
    });
    selectedHalo.visible = false;
    scene.add(selectedHalo);
    selectedHaloRef.current = selectedHalo;

    const compareHalo = makeRingSprite({
      color: "#1a1a1a",
      size: 5.0,
      thickness: 1.5,
      opacity: 0.7,
    });
    compareHalo.visible = false;
    scene.add(compareHalo);
    compareHaloRef.current = compareHalo;

    // Scene-level label sprites are built per-node on demand (cached) and
    // toggled visible here. No fixed selectedLabel/compareLabel sprite —
    // each prospect has its own canvas-baked sprite the first time it
    // becomes the active subject, then re-used on subsequent reselects.

    // Position labels were rendered in 3D space above each cluster. They
    // visually competed with the more-specific archetype labels at the same
    // centroid, and the position is already encoded by node color + the
    // colored Header chips that act as the legend. Empty array kept so the
    // filter effect's iteration is a no-op without a separate code path.
    const ambientLabels: { pos: Position; sprite: Sprite }[] = [];
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

    // Snapshot the scene-label cache for the cleanup closure: lint warns
    // that `.current` could change between effect-run and cleanup. In our
    // case it can't (only this effect mutates it on mount/unmount), but
    // capturing the reference is the cheap correct pattern.
    const sceneLabelsSnapshot = sceneLabelCacheRef.current;
    return () => {
      window.removeEventListener("resize", handleResize);
      for (const { sprite } of ambientLabels) scene.remove(sprite);
      for (const { sprite } of archetypeLabels) scene.remove(sprite);
      if (selectedHaloRef.current) scene.remove(selectedHaloRef.current);
      if (compareHaloRef.current) scene.remove(compareHaloRef.current);
      for (const sprite of sceneLabelsSnapshot.values()) {
        scene.remove(sprite);
      }
      sceneLabelsSnapshot.clear();
      selectedHaloRef.current = null;
      compareHaloRef.current = null;
      ambientLabelsRef.current = [];
      archetypeLabelsRef.current = [];
      graph._destructor();
      graphRef.current = null;
      labelCache.clear();
    };
  }, [data, archetypes, onSelect]);

  // Update the scene-level aura (halo + label) for one of the two slots.
  // Slot determines which halo sprite to move and how the label looks
  // (primary uses solid bg, compare uses a position-tinted accent so the
  // pair reads as related-but-distinct from any camera angle).
  const updateAura = (
    slot: "selected" | "compare",
    nodeId: string | null,
    graph: ForceGraphInstance,
  ) => {
    const halo =
      slot === "selected" ? selectedHaloRef.current : compareHaloRef.current;
    if (!halo) return;
    const sceneCache = sceneLabelCacheRef.current;
    const childCache = labelCacheRef.current;
    const scene = graph.scene() as Scene;

    // Hide any previous label for this slot — track via a per-slot ref
    // outside the cache so we know which sprite to flip off. Important
    // guard: skip cleanup if the prev node is currently the OTHER slot's
    // active aura too (e.g. user single-clicks the compare partner to
    // promote it; the compare effect would otherwise hide the label the
    // selection effect just showed for the same node).
    const prevId = previousAuraRef.current[slot];
    const stillInOtherSlot =
      prevId !== null &&
      (prevId === selectedIdRef.current || prevId === compareWithRef.current);
    if (prevId && prevId !== nodeId && !stillInOtherSlot) {
      const prevLabel = sceneCache.get(prevId);
      if (prevLabel) prevLabel.visible = false;
      // Re-show the in-node-child label if this prospect is in the
      // highlight cohort (we hid it when promoting to scene-level).
      const prevChildLabel = childCache.get(prevId);
      if (prevChildLabel) prevChildLabel.visible = true;
    }

    if (nodeId === null) {
      halo.visible = false;
      previousAuraRef.current[slot] = null;
      return;
    }

    const node = nodesByPositionRef.current.find((n) => n.id === nodeId);
    if (!node) {
      halo.visible = false;
      previousAuraRef.current[slot] = null;
      return;
    }

    halo.position.set(node.x, node.y, node.z);
    // Compare halo borrows the partner's position color so it reads as
    // chromatic-but-secondary against the primary's solid black ring.
    const haloMat = halo.material as SpriteMaterial;
    haloMat.color.set(slot === "selected" ? "#1a1a1a" : POSITION_COLORS[node.position]);
    haloMat.needsUpdate = true;
    halo.visible = true;

    // Get-or-build a scene-level label for this node and position it.
    let label = sceneCache.get(nodeId);
    if (!label) {
      // yOffset=0 here because we're applying the lift in world coords
      // below (scene-level sprites can't borrow the relative-position
      // trick that node-child sprites use).
      label = makeTextSprite({
        text: node.name,
        color: "#1a1a1a",
        bg:
          slot === "selected"
            ? "rgba(252,252,250,0.95)"
            : "rgba(252,252,250,0.85)",
        fontSize: 22,
        fontWeight: 600,
        scale: 0.04,
        yOffset: 0,
      });
      scene.add(label);
      sceneCache.set(nodeId, label);
    }
    // Lift label above the halo so name + ring don't overlap visually.
    // 4 units mirrors the in-node-child label's offset for highlight nodes.
    label.position.set(node.x, node.y + 4, node.z);
    label.visible = true;
    // Hide the in-node-child label if this is a highlight node — the
    // scene-level one stands in for it (with bigger bg + halo).
    const childLabel = childCache.get(nodeId);
    if (childLabel) childLabel.visible = false;

    previousAuraRef.current[slot] = nodeId;
  };

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
        const camPos = {
          x: target.x + dx * ratio,
          y: target.y + dy * ratio,
          z: target.z + dz * ratio,
        };
        const lookAt = { x: target.x, y: target.y, z: target.z };
        // Pan view rightward so target appears in the left ~60% of the
        // canvas (the side panel takes the right ~30%). Panel is always
        // open during a selection-driven fly.
        const framed = offsetForPanel(camPos, lookAt, targetDist, true);
        graph.cameraPosition(framed.cam, framed.lookAt, 1100);
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
    // Refresh nodeVal + edge styling so selection-driven size + edge focus
    // pick up the change without rebuilding the graph instance.
    graph.nodeVal(graph.nodeVal());
    graph.linkColor(graph.linkColor());
    graph.linkWidth(graph.linkWidth());
    updateAura("selected", selectedId, graph);
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
    graph.linkColor(graph.linkColor());
    graph.linkWidth(graph.linkWidth());
    updateAura("compare", compareWithId, graph);
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
    // If a selection survives the filter change, the side panel is still
    // open — pan rightward so the cluster doesn't end up half under it.
    const framed = offsetForPanel(
      cameraPosFor(frame),
      frame.center,
      frame.camDist,
      previousSelectedRef.current !== null,
    );
    graph.cameraPosition(framed.cam, framed.lookAt, 800);
  }, [filter]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
