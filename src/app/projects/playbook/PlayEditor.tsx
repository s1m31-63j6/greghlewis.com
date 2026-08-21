"use client";

/**
 * The play editor.
 *
 * A DRAG IS AN OVERRIDE, NOT A DEMOLITION. Player edits are stored as deltas
 * from the formation's resolved point, so the play stays "Gun Trips Right,
 * H two yards wider" — still searchable as that formation, still portable to a
 * different field size, and still improved if the formation library is later
 * corrected. There is no moment at which a play becomes geometry.
 *
 * Route edits have three levels and only the third gives anything up: changing
 * a depth writes a mod, dragging a break point writes a delta, and drawing
 * freehand replaces the points for that ONE path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Field from "./Field";
import PlayDiagram from "./PlayDiagram";
import { usePlayHistory } from "./usePlayHistory";
import {
  BlockIcon, EraseIcon, LinemanIcon, MotionIcon, RouteIcon, SelectIcon,
} from "./ToolIcons";
import { useCamera, usePlayerDrag, toModel } from "./usePointerDrag";
import { resolvePlay } from "@/lib/playbook/resolve";
import { fromSvg, svgX, svgY, variant as variantOf } from "@/lib/playbook/field";
import { ROUTES, routeById } from "@/lib/playbook/routes";
import { validate, WARNING_LABEL } from "@/lib/playbook/validate";
import type {
  Assignment,
  BookStyle,
  FieldVariantId,
  Play,
  RouteId,
  SlotId,
  Vec,
} from "@/lib/playbook/types";

interface Props {
  play: Play;
  variant: FieldVariantId;
  style: BookStyle;
  readOnly: boolean;
  onSave: (edited: Play) => void;
  onClose: () => void;
}

/** Ramer-Douglas-Peucker. What turns a shaky finger-drawn line into a route. */
function simplify(pts: Vec[], eps: number): Vec[] {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/**
 * Snap any segment within seven degrees of a cardinal or diagonal to exactly
 * that angle. This is the single most important detail in the editor: without
 * it a hand-drawn out route looks amateur, and with it it looks drafted.
 */
function straighten(pts: Vec[]): Vec[] {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1];
    const q = pts[i];
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    const deg = (ang * 180) / Math.PI;
    const nearest = Math.round(deg / 45) * 45;
    if (Math.abs(deg - nearest) <= 7) {
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const r = (nearest * Math.PI) / 180;
      out.push({ x: p.x + Math.cos(r) * len, y: p.y + Math.sin(r) * len });
    } else {
      out.push(q);
    }
  }
  return out;
}

type Tool = "select" | "route" | "block" | "motion" | "erase";

/**
 * The rail. Every one of these does something when you click a player — a
 * labelled button that does nothing is worse than an unlabelled one, and two
 * of these used to be exactly that.
 */
const TOOLS: {
  id: Tool;
  key: string;
  label: string;
  title: string;
  Icon: () => React.ReactElement;
}[] = [
  { id: "select", key: "V", label: "Select", title: "Select and move", Icon: SelectIcon },
  { id: "route", key: "R", label: "Route", title: "Drag from a player to draw a route", Icon: RouteIcon },
  { id: "block", key: "B", label: "Block", title: "Click a player to give him a block", Icon: BlockIcon },
  { id: "motion", key: "M", label: "Motion", title: "Click a player to send him in motion", Icon: MotionIcon },
  { id: "erase", key: "E", label: "Erase", title: "Click a player to clear his assignment", Icon: EraseIcon },
];

export default function PlayEditor({ play: initial, variant, style, readOnly, onSave, onClose }: Props) {
  const v = variantOf(variant);
  const { play, commit, undo, redo, reset, seal, canUndo, canRedo, dirty } = usePlayHistory(initial);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<Vec[] | null>(null);
  // Mirrored in a ref: the first pointermoves arrive before React has
  // re-rendered with the new state, and reading the stale closure dropped them.
  const drawingRef = useRef<Vec[] | null>(null);
  const setDraw = useCallback((pts: Vec[] | null) => {
    drawingRef.current = pts;
    setDrawing(pts);
  }, []);
  const [lineman, setLineman] = useState(false);
  const camRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const camera = useCamera(v);

  useEffect(() => reset(initial), [initial, reset]);

  const resolved = useMemo(() => resolvePlay(play, variant, false, style), [play, variant, style]);
  const warnings = useMemo(() => validate(play, resolved, variant), [play, resolved, variant]);

  const base = useMemo(
    () => resolvePlay({ spec: play.spec }, variant, false, style),
    [play.spec, variant, style],
  );

  /** Writes a player's position as a DELTA from where the formation put him. */
  const movePlayer = useCallback(
    (slot: string, at: Vec) => {
      const origin = base.players.find((p) => p.slot === slot)?.at;
      if (!origin) return;
      commit(
        (p) => ({
          ...p,
          overrides: {
            ...(p.overrides ?? { authoredVariant: variant }),
            authoredVariant: p.overrides?.authoredVariant ?? variant,
            players: {
              ...(p.overrides?.players ?? {}),
              [slot]: { dx: at.x - origin.x, dy: at.y - origin.y },
            },
          },
        }),
        `move ${slot}`,
        `player:${slot}`,
      );
    },
    [base.players, commit, variant],
  );

  const drag = usePlayerDrag(v, camRef, movePlayer, () => seal(), (slot) => setSelected(slot));

  const others = useMemo(
    () => resolved.players.filter((p) => p.slot !== drag.dragging).map((p) => p.at),
    [resolved.players, drag.dragging],
  );

  const setAssignment = useCallback(
    (slot: SlotId, a: Assignment, label: string, key: string) => {
      commit((p) => ({ ...p, spec: { ...p.spec, assignments: { ...p.spec.assignments, [slot]: a } } }), label, key);
    },
    [commit],
  );

  const setRoute = useCallback(
    (slot: SlotId, route: RouteId) => {
      const cur = play.spec.assignments[slot];
      const mods = cur?.kind === "route" ? cur.mods : undefined;
      setAssignment(slot, { kind: "route", route, mods }, `route ${slot}`, `route:${slot}`);
      // Replacing the preset discards any freehand geometry for that path,
      // which is the only sane reading of "give him a dig instead".
      commit(
        (p) => {
          if (!p.overrides?.paths?.[slot]) return p;
          const paths = { ...p.overrides.paths };
          delete paths[slot];
          return { ...p, overrides: { ...p.overrides, paths } };
        },
        `route ${slot}`,
        `route:${slot}`,
      );
    },
    [play.spec.assignments, setAssignment, commit],
  );

  /**
   * Give a player a block. Resolves to a short path ending in a flat bar,
   * which is what "blocking" has to look like on a diagram.
   */
  const setBlock = useCallback(
    (slot: SlotId) => {
      setAssignment(slot, { kind: "block", rule: { block: "base" } }, `block ${slot}`, `block:${slot}`);
    },
    [setAssignment],
  );

  /** Wrap or unwrap a pre-snap motion around whatever he was already doing. */
  const toggleMotion = useCallback(
    (slot: SlotId) => {
      const cur = play.spec.assignments[slot];
      if (!cur) return;
      const next: Assignment =
        cur.kind === "motion"
          ? cur.then
          : {
              kind: "motion",
              motion: { type: "jet", startMsBeforeSnap: 1400, atSnap: "moving" },
              then: cur,
            };
      setAssignment(slot, next, `motion ${slot}`, `motion:${slot}`);
    },
    [play.spec.assignments, setAssignment],
  );

  /** Clear a player's job, and any hand-drawn path that went with it. */
  const clearAssignment = useCallback(
    (slot: SlotId) => {
      commit(
        (pl) => {
          const assignments = { ...pl.spec.assignments };
          delete assignments[slot];
          const paths = { ...(pl.overrides?.paths ?? {}) };
          delete paths[slot];
          return {
            ...pl,
            spec: { ...pl.spec, assignments },
            overrides: pl.overrides ? { ...pl.overrides, paths } : undefined,
          };
        },
        `clear ${slot}`,
        null,
      );
    },
    [commit],
  );

  const setDepth = useCallback(
    (slot: SlotId, depth: number) => {
      const cur = play.spec.assignments[slot];
      if (cur?.kind !== "route") return;
      setAssignment(
        slot,
        { ...cur, mods: { ...cur.mods, depth } },
        `depth ${slot}`,
        `depth:${slot}`,
      );
    },
    [play.spec.assignments, setAssignment],
  );

  const setTiming = useCallback(
    (slot: SlotId, patch: { startDelayMs?: number; priorityOrder?: number }) => {
      const cur = play.spec.assignments[slot];
      if (!cur || cur.kind === "motion" || cur.kind === "none") return;
      setAssignment(
        slot,
        { ...cur, timing: { ...("timing" in cur ? cur.timing : {}), ...patch } } as Assignment,
        `timing ${slot}`,
        `timing:${slot}`,
      );
    },
    [play.spec.assignments, setAssignment],
  );

  /** Freehand drawing. Sample, simplify, straighten, store as a path override. */
  const finishDraw = useCallback(
    (slot: string, raw: Vec[]) => {
      if (raw.length < 2) return;
      const clean = straighten(simplify(raw, 0.3));
      commit(
        (p) => ({
          ...p,
          overrides: {
            ...(p.overrides ?? { authoredVariant: variant }),
            authoredVariant: p.overrides?.authoredVariant ?? variant,
            paths: {
              ...(p.overrides?.paths ?? {}),
              [slot]: { mode: "freehand", points: clean, curve: "polyline", cap: "arrow", style: "solid" },
            },
          },
        }),
        `draw ${slot}`,
        null,
      );
    },
    [commit, variant],
  );

  // Keyboard map. Every one of these is also reachable from the inspector, so
  // the whole editor works without a pointer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        // Undo while a path is being drawn drops the last point rather than the
        // whole path — what every drawing tool does and every clone gets wrong.
        if (drawing && drawing.length > 1) setDraw(drawing.slice(0, -1));
        else if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod) return;
      const map: Record<string, () => void> = {
        v: () => setTool("select"),
        r: () => setTool("route"),
        b: () => setTool("block"),
        m: () => setTool("motion"),
        e: () => setTool("erase"),
        l: () => {
          setLineman((x) => !x);
          camera.linemanView();
        },
        "0": camera.fit,
        Escape: () => {
          setDraw(null);
          setSelected(null);
        },
      };
      map[e.key]?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, camera, drawing, setDraw]);

  const selectedAssignment = selected ? play.spec.assignments[selected as SlotId] : undefined;
  const selectedPlayer = resolved.players.find((p) => p.slot === selected);
  // The one place a play gives up compositional identity, and only for this
  // one path. Saying so beats an inspector that still claims "7 — Corner"
  // about a line the coach drew by hand.
  const handDrawn =
    selected !== null && play.overrides?.paths?.[selected as SlotId]?.mode === "freehand";

  const restorePreset = useCallback(
    (slot: SlotId) => {
      commit(
        (p) => {
          if (!p.overrides?.paths?.[slot]) return p;
          const paths = { ...p.overrides.paths };
          delete paths[slot];
          return { ...p, overrides: { ...p.overrides, paths } };
        },
        `restore ${slot}`,
        null,
      );
    },
    [commit],
  );

  return (
    <div className="pb-editor">
      <header className="pb-editor-bar">
        <button className="pb-back" onClick={onClose}>‹ Back</button>
        <input
          className="pb-input pb-title-input"
          value={play.spec.name}
          disabled={readOnly}
          onChange={(e) =>
            commit((p) => ({ ...p, spec: { ...p.spec, name: e.target.value } }), "rename", "name")
          }
          aria-label="Play name"
        />
        <div className="pb-editor-actions">
          <button className="pb-btn" onClick={undo} disabled={!canUndo}>⌘Z Undo</button>
          <button className="pb-btn" onClick={redo} disabled={!canRedo}>Redo</button>
          <button
            className="pb-btn pb-btn--primary"
            disabled={!dirty}
            onClick={() => onSave(play)}
            data-tel="pb-save-play"
            data-tel-project="playbook"
          >
            Save as new
          </button>
        </div>
      </header>

      <div className="pb-editor-body">
        <nav className="pb-rail" aria-label="Tools">
          {TOOLS.map(({ id, key, label, title, Icon }) => (
            <button
              key={id}
              className="pb-tool"
              aria-pressed={tool === id}
              title={`${title} (${key})`}
              onClick={() => setTool(id)}
              data-tel="pb-tool"
              data-tel-project="playbook"
            >
              <Icon />
              <span className="pb-tool-label">{label}</span>
            </button>
          ))}
          <span className="pb-rail-sep" />
          {/* Below the line because it is a view, not a tool. */}
          <button
            className="pb-tool"
            aria-pressed={lineman}
            title="Lineman view (L)"
            onClick={() => {
              setLineman((x) => !x);
              camera.linemanView();
            }}
          >
            <LinemanIcon />
            <span className="pb-tool-label">Lineman</span>
          </button>
        </nav>

        <div className="pb-canvas">
          <Field
            variant={v}
            camera={camera.cam}
            cameraRef={camRef}
            svgRef={svgRef}
            showGrid
            ariaLabel={`${play.spec.name}, editable diagram`}
            onWheel={(e) => camera.onWheel(e, camRef.current)}
            onPointerDown={(e) => {
              if (tool === "select") camera.startPan(e);
            }}
            onPointerMove={(e) => {
              drag.move(e, others);
              camera.movePan(e);
              const pts = drawingRef.current;
              if (!pts) return;
              const m = toModel(e, camRef.current);
              if (!m) return;
              const p = fromSvg(m.x, m.y, v);
              const last = pts[pts.length - 1];
              // Sample every 0.8 yards. Fine enough to keep the shape, coarse
              // enough that the simplifier has something to work with.
              if (Math.hypot(p.x - last.x, p.y - last.y) > 0.8) setDraw([...pts, p]);
            }}
            onPointerUp={(e) => {
              drag.end(e, svgRef.current);
              camera.endPan(e);
              const pts = drawingRef.current;
              if (pts && selected) {
                finishDraw(selected, pts);
                setDraw(null);
              }
            }}
            onPointerCancel={(e) => {
              drag.end(e, svgRef.current);
              camera.endPan(e);
              setDraw(null);
            }}
          >
            {/* Magnet guides. Brightening the target is what makes snapping
                feel intentional rather than sticky. */}
            {drag.guides.map((g, i) =>
              g.axis === "x" ? (
                <line key={i} x1={svgX(g.at, v)} y1={0} x2={svgX(g.at, v)} y2={(v.window.aheadYd + v.window.behindYd) * 10} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ) : (
                <line key={i} x1={0} y1={svgY(g.at, v)} x2={v.viewWidthYd * 10} y2={svgY(g.at, v)} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ),
            )}

            <PlayDiagram
              play={resolved}
              variant={v}
              style={style}
              k={camera.cam.k}
              selectedSlot={selected}
              onPlayerPointerDown={(slot, e) => {
                if (readOnly) return;
                const p = resolved.players.find((x) => x.slot === slot);
                if (!p) return;
                if (tool === "route") {
                  setSelected(slot);
                  setDraw([p.at]);
                  try {
                    svgRef.current?.setPointerCapture(e.pointerId);
                  } catch {
                    // Throws for a pointer that is not active.
                  }
                  e.stopPropagation();
                  return;
                }
                if (tool === "block" || tool === "motion" || tool === "erase") {
                  setSelected(slot);
                  if (tool === "block") setBlock(slot as SlotId);
                  if (tool === "motion") toggleMotion(slot as SlotId);
                  if (tool === "erase") clearAssignment(slot as SlotId);
                  e.stopPropagation();
                  return;
                }
                drag.start(slot, p.at, e, svgRef.current);
              }}
            />

            {drawing && drawing.length > 1 && (
              <polyline
                points={drawing.map((p) => `${svgX(p.x, v)},${svgY(p.y, v)}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.2}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </Field>

          <div className="pb-camera-bar">
            <button className="pb-icon-btn" onClick={() => camera.zoomCenter(1 / 1.25)} aria-label="Zoom out">⊖</button>
            <span className="pb-num pb-zoom">{Math.round(camera.cam.k * 100)}%</span>
            <button className="pb-icon-btn" onClick={() => camera.zoomCenter(1.25)} aria-label="Zoom in">⊕</button>
            <button className="pb-btn" onClick={camera.fit}>Fit</button>
            <span className="pb-label pb-hint">Drag a player · R then drag to draw · L for lineman view</span>
          </div>
        </div>

        <aside className="pb-inspector">
          {selectedPlayer ? (
            <>
              <h3 className="pb-panel-title">{selectedPlayer.label}</h3>
              <p className="pb-label">{selectedPlayer.role}</p>

              <label className="pb-field-row">
                <span className="pb-label">X</span>
                <input
                  className="pb-input pb-num" type="number" step={0.5} disabled={readOnly}
                  value={selectedPlayer.at.x.toFixed(1)}
                  onChange={(e) => movePlayer(selectedPlayer.slot, { ...selectedPlayer.at, x: Number(e.target.value) })}
                />
              </label>
              <label className="pb-field-row">
                <span className="pb-label">Y</span>
                <input
                  className="pb-input pb-num" type="number" step={0.5} disabled={readOnly}
                  value={selectedPlayer.at.y.toFixed(1)}
                  onChange={(e) => movePlayer(selectedPlayer.slot, { ...selectedPlayer.at, y: Number(e.target.value) })}
                />
              </label>

              {handDrawn && (
                <div className="pb-hand-drawn">
                  <p className="pb-prose">
                    This path is hand-drawn, so it no longer carries a route name and
                    will not rescale to another field size.
                  </p>
                  <button
                    className="pb-btn"
                    disabled={readOnly}
                    onClick={() => restorePreset(selectedPlayer.slot as SlotId)}
                  >
                    Restore the preset
                  </button>
                </div>
              )}

              {selectedAssignment?.kind === "route" && !handDrawn && (
                <>
                  <label className="pb-field-row">
                    <span className="pb-label">Route</span>
                    <select
                      className="pb-input" disabled={readOnly}
                      value={selectedAssignment.route}
                      onChange={(e) => setRoute(selectedPlayer.slot as SlotId, e.target.value as RouteId)}
                    >
                      {ROUTES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.treeNumber !== undefined ? `${r.treeNumber} — ${r.label}` : r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="pb-field-row">
                    <span className="pb-label">Depth</span>
                    <input
                      className="pb-input pb-num" type="number" step={1} min={1} max={v.maxRouteDepthYd} disabled={readOnly}
                      value={
                        selectedAssignment.mods?.depth ??
                        routeById(selectedAssignment.route)?.nominalDepthYd ??
                        10
                      }
                      onChange={(e) => setDepth(selectedPlayer.slot as SlotId, Number(e.target.value))}
                    />
                  </label>
                </>
              )}

              {selectedAssignment && selectedAssignment.kind !== "motion" && selectedAssignment.kind !== "none" && (
                <>
                  <label className="pb-field-row">
                    <span className="pb-label">Delay</span>
                    <input
                      className="pb-input pb-num" type="number" step={50} disabled={readOnly}
                      value={("timing" in selectedAssignment && selectedAssignment.timing?.startDelayMs) || 0}
                      onChange={(e) => setTiming(selectedPlayer.slot as SlotId, { startDelayMs: Number(e.target.value) })}
                    />
                  </label>
                  <label className="pb-field-row">
                    <span className="pb-label">Read #</span>
                    <input
                      className="pb-input pb-num" type="number" step={1} min={0} max={9} disabled={readOnly}
                      value={("timing" in selectedAssignment && selectedAssignment.timing?.priorityOrder) || 0}
                      onChange={(e) => setTiming(selectedPlayer.slot as SlotId, { priorityOrder: Number(e.target.value) })}
                    />
                  </label>
                </>
              )}
            </>
          ) : (
            <>
              <h3 className="pb-panel-title">Play</h3>
              <p className="pb-prose">{play.spec.coaching.commentary ?? "Select a player to edit their assignment."}</p>
              <label className="pb-field-row pb-field-row--stack">
                <span className="pb-label">Notes — searchable</span>
                <textarea
                  className="pb-input" rows={5} disabled={readOnly}
                  value={play.notes ?? ""}
                  placeholder="Why you call this, what it beats…"
                  onChange={(e) => commit((p) => ({ ...p, notes: e.target.value }), "notes", "notes")}
                />
              </label>
            </>
          )}

          {warnings.length > 0 && (
            <div className="pb-warnings">
              <h4 className="pb-label">Checks</h4>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>
                    <span className="pb-warn-tag pb-label">{WARNING_LABEL[w.code]}</span> {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
