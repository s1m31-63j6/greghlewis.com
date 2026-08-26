"use client";

/**
 * The formation builder.
 *
 * Drag players around a field; every drop is immediately reinterpreted through
 * `snap.ts` into the vocabulary the shipped formations are written in — a side,
 * a named split, on or off the line. The diagram you are looking at is drawn
 * from the SNAPPED formation, never from the raw pointer position, so a player
 * visibly settles into his alignment when you let go. That settle is the
 * feature: it is the moment the tool tells you what it recorded.
 *
 * Why not just store where the player was dropped? Because a formation is the
 * one object in this app that has to survive being asked a question it was not
 * drawn for. "Show me this on a flag field." "Mirror it." "Find every play from
 * a trips look." Coordinates answer none of those. The split table does.
 *
 * The inspector is the escape hatch and the teacher at once: it names the
 * alignment each player landed in, says how far the drop was from it, and lets
 * you set it by name when the guess was wrong. Backfield alignments that share
 * a lateral position — `i`, `dot` and `pistol` are all x = 0 — are flagged as
 * ambiguous rather than guessed at confidently.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import Field from "./Field";
import PlayDiagram from "./PlayDiagram";
import { toModel, useCamera, usePlayerDrag } from "./usePointerDrag";
import { fromSvg, svgX, svgY, variant as variantOf } from "@/lib/playbook/field";
import { resolveFormation } from "@/lib/playbook/formations";
import { DEFAULT_STYLE } from "@/lib/playbook/resolve";
import {
  BACK_SLOTS,
  RECEIVER_SLOTS,
  nearestSplit,
  renumber,
  snapBack,
  snapQb,
  snapReceiver,
} from "@/lib/playbook/snap";
import { formationWarnings, validateFormation } from "@/lib/playbook/validate";
import type {
  BackAlign,
  BackSpot,
  BookStyle,
  FieldVariantId,
  Formation,
  ReceiverSpot,
  ResolvedPlay,
  Side,
  SlotId,
  SplitName,
  Vec,
} from "@/lib/playbook/types";

const SPLITS: SplitName[] = ["wide", "plus", "slot", "nasty", "wing", "tight", "attached"];
const BACK_ALIGNS: BackAlign[] = ["i", "dot", "offset", "split", "pistol", "diamond", "wing", "slot"];

interface Props {
  /** Null starts from an empty field; a formation starts from a copy of it. */
  initial: Formation | null;
  variant: FieldVariantId;
  style?: BookStyle;
  readOnly?: boolean;
  onSave: (formation: Formation) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

/** A blank one still gets a quarterback and a back — nobody starts from nothing. */
function blankFormation(): Formation {
  return {
    id: `u_form_${Math.random().toString(36).slice(2, 10)}`,
    name: "New formation",
    aliases: [],
    strength: "R",
    qb: { align: "gun" },
    backs: [{ slot: "RB", align: "offset", side: "R", priority: 1 }],
    receivers: [],
    tags: ["custom"],
  };
}

/** A copy carries its own id and says what it came from. */
function copyOf(f: Formation): Formation {
  return {
    ...f,
    id: `u_form_${Math.random().toString(36).slice(2, 10)}`,
    name: `${f.name} (copy)`,
    tags: [...new Set([...f.tags, "custom"])],
  };
}

export default function FormationBuilder({
  initial,
  variant,
  style = DEFAULT_STYLE,
  readOnly = false,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const v = variantOf(variant);
  const camera = useCamera(v);
  const camRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [draft, setDraft] = useState<Formation>(() =>
    initial ? (initial.id.startsWith("u_form_") ? initial : copyOf(initial)) : blankFormation(),
  );
  const [selected, setSelected] = useState<SlotId | null>(null);
  /** Where a drag currently is, before it is committed and snapped. */
  const [dragAt, setDragAt] = useState<{ slot: string; at: Vec } | null>(null);

  const resolved = useMemo(() => resolveFormation(draft, variant, false), [draft, variant]);
  // Memoised because the fallback object would otherwise be a new identity on
  // every render, which re-runs every callback that snaps against it.
  const qbAt = useMemo(() => resolved.points.QB ?? { x: 0, y: -5 }, [resolved.points.QB]);

  /** PlayDiagram speaks in resolved plays; a formation is one with no jobs. */
  const asPlay: ResolvedPlay = useMemo(
    () => ({
      players: resolved.players.map((p) =>
        dragAt && p.slot === dragAt.slot ? { ...p, at: dragAt.at } : p,
      ),
      paths: [],
      ball: null,
      zones: [],
      annotations: [],
      omitted: resolved.omitted,
      warnings: [],
      durationMs: 0,
    }),
    [resolved, dragAt],
  );

  const problems = useMemo(() => validateFormation(draft), [draft]);
  const warnings = useMemo(
    () => (problems.length ? [] : formationWarnings(draft, variant)),
    [draft, variant, problems.length],
  );

  /** Re-snap one player from a dropped point. */
  const place = useCallback(
    (slot: string, at: Vec) => {
      setDraft((f) => {
        if (slot === "QB") return { ...f, qb: snapQb(at, variant) };

        const back = f.backs.find((b) => b.slot === slot);
        if (back) {
          const s = snapBack(at, qbAt, variant);
          return {
            ...f,
            backs: f.backs.map((b) =>
              b.slot === slot ? { ...b, align: s.align, side: s.side, depthYd: s.depthYd } : b,
            ),
          };
        }

        const rec = f.receivers.find((r) => r.slot === slot);
        if (rec) {
          const s = snapReceiver(at, variant, { blockingLegal: v.blockingLegal });
          const receivers = f.receivers.map((r) =>
            r.slot === slot
              ? { ...r, side: s.side, split: s.split, onLine: s.onLine, depthYd: s.depthYd }
              : r,
          );
          return { ...f, receivers: renumber(receivers, variant) };
        }
        return f;
      });
      setDragAt(null);
    },
    [qbAt, v.blockingLegal, variant],
  );

  const drag = usePlayerDrag(
    v,
    camRef,
    (slot, at) => setDragAt({ slot, at }),
    (slot) => {
      const at = dragAt?.slot === slot ? dragAt.at : null;
      if (at) place(slot, at);
      else setDragAt(null);
      setSelected(slot as SlotId);
    },
    (slot) => setSelected(slot as SlotId),
  );

  const others = useMemo(
    () => resolved.players.filter((p) => p.slot !== drag.dragging).map((p) => p.at),
    [resolved.players, drag.dragging],
  );

  /** Drop a new player wherever the field was clicked. */
  const addAt = useCallback(
    (at: Vec) => {
      setDraft((f) => {
        const taken = new Set([
          "QB",
          ...f.backs.map((b) => b.slot),
          ...f.receivers.map((r) => r.slot),
        ]);
        // Behind the ball and near the middle reads as a back; anything else is
        // a receiver. It is a guess, and the inspector can overrule it.
        const wantsBack = at.y < -2 && Math.abs(at.x) < 6;
        const pool = wantsBack ? BACK_SLOTS : RECEIVER_SLOTS;
        const slot = [...pool, ...RECEIVER_SLOTS, ...BACK_SLOTS].find((s) => !taken.has(s));
        if (!slot) return f;

        const priority = f.backs.length + f.receivers.length + 1;
        if (wantsBack) {
          const s = snapBack(at, qbAt, variant);
          return {
            ...f,
            backs: [...f.backs, { slot, align: s.align, side: s.side, depthYd: s.depthYd, priority }],
          };
        }
        const s = snapReceiver(at, variant, { blockingLegal: v.blockingLegal });
        const receivers: ReceiverSpot[] = [
          ...f.receivers,
          { slot, side: s.side, order: 1, split: s.split, onLine: s.onLine, depthYd: s.depthYd, priority },
        ];
        return { ...f, receivers: renumber(receivers, variant) };
      });
    },
    [qbAt, v.blockingLegal, variant],
  );

  const removeSlot = useCallback((slot: SlotId) => {
    setDraft((f) => ({
      ...f,
      backs: f.backs.filter((b) => b.slot !== slot),
      receivers: f.receivers.filter((r) => r.slot !== slot),
    }));
    setSelected(null);
  }, []);

  const patchReceiver = useCallback((slot: SlotId, patch: Partial<ReceiverSpot>) => {
    setDraft((f) => ({
      ...f,
      receivers: renumber(
        f.receivers.map((r) => (r.slot === slot ? { ...r, ...patch } : r)),
        variant,
      ),
    }));
  }, [variant]);

  const patchBack = useCallback((slot: SlotId, patch: Partial<BackSpot>) => {
    setDraft((f) => ({
      ...f,
      backs: f.backs.map((b) => (b.slot === slot ? { ...b, ...patch } : b)),
    }));
  }, []);

  const selectedBack = draft.backs.find((b) => b.slot === selected);
  const selectedRec = draft.receivers.find((r) => r.slot === selected);

  /** What the inspector reports about the last drop for this player. */
  const drift = useMemo(() => {
    if (!selected) return null;
    const at = resolved.points[selected];
    if (!at) return null;
    if (selectedRec) {
      const m = nearestSplit(Math.abs(at.x), v);
      return `${m.name} puts him ${m.yd.toFixed(1)} yd off the ball`;
    }
    if (selectedBack) {
      const s = snapBack(at, qbAt, variant);
      return s.ambiguous
        ? "Several backfield alignments describe this spot — pick the one you call it."
        : null;
    }
    return null;
  }, [selected, resolved.points, selectedRec, selectedBack, v, qbAt, variant]);

  return (
    <div className="pb-editor">
      <header className="pb-editor-bar">
        <button className="pb-back" onClick={onCancel}>‹ Back</button>
        <input
          className="pb-input pb-title-input"
          value={draft.name}
          disabled={readOnly}
          onChange={(e) => setDraft((f) => ({ ...f, name: e.target.value }))}
          aria-label="Formation name"
        />
        <div className="pb-editor-actions">
          {onDelete && (
            <button className="pb-btn pb-btn--danger" onClick={onDelete} disabled={readOnly}>
              Delete
            </button>
          )}
          <button
            className="pb-btn pb-btn--primary"
            disabled={readOnly || problems.length > 0}
            title={problems[0]}
            onClick={() => onSave(draft)}
            data-tel="pb-save-formation"
            data-tel-project="playbook"
          >
            Save formation
          </button>
        </div>
      </header>

      <div className="pb-editor-body pb-editor-body--formation">
        <div className="pb-canvas">
          <Field
            variant={v}
            camera={camera.cam}
            cameraRef={camRef}
            svgRef={svgRef}
            showGrid
            ariaLabel={`${draft.name}, editable formation`}
            onWheel={(e) => camera.onWheel(e, camRef.current)}
            onPointerDown={(e) => camera.startPan(e)}
            onDoubleClick={(e) => {
              // A real dblclick rather than `detail === 2` on pointerdown:
              // pointer events do not carry a reliable click count, which is
              // why the first version of this silently never fired.
              if (readOnly) return;
              const m = toModel(e, camRef.current);
              if (m) addAt(fromSvg(m.x, m.y, v));
            }}
            onPointerMove={(e) => {
              drag.move(e, others);
              camera.movePan(e);
            }}
            onPointerUp={(e) => {
              drag.end(e, svgRef.current);
              camera.endPan(e);
            }}
            onPointerCancel={(e) => {
              drag.end(e, svgRef.current);
              camera.endPan(e);
            }}
          >
            {drag.guides.map((g, i) =>
              g.axis === "x" ? (
                <line key={i} x1={svgX(g.at, v)} y1={0} x2={svgX(g.at, v)} y2={(v.window.aheadYd + v.window.behindYd) * 10} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ) : (
                <line key={i} x1={0} y1={svgY(g.at, v)} x2={v.viewWidthYd * 10} y2={svgY(g.at, v)} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ),
            )}

            <PlayDiagram
              play={asPlay}
              variant={v}
              style={style}
              k={camera.cam.k}
              selectedSlot={selected}
              onPlayerPointerDown={(slot, e) => {
                if (readOnly) return;
                const p = resolved.players.find((x) => x.slot === slot);
                if (!p) return;
                drag.start(slot, p.at, e, svgRef.current);
              }}
            />
          </Field>

          <div className="pb-camera-bar">
            <button className="pb-icon-btn" onClick={() => camera.zoomCenter(1 / 1.25)} aria-label="Zoom out">⊖</button>
            <span className="pb-num pb-zoom">{Math.round(camera.cam.k * 100)}%</span>
            <button className="pb-icon-btn" onClick={() => camera.zoomCenter(1.25)} aria-label="Zoom in">⊕</button>
            <button className="pb-btn" onClick={camera.fit}>Fit</button>
            <span className="pb-label pb-hint">
              Drag a player to align him · double-click the grass to add one
            </span>
          </div>
        </div>

        <aside className="pb-inspector">
          {selected && (selectedRec || selectedBack || selected === "QB") ? (
            <>
              <h3 className="pb-panel-title">{selected}</h3>
              <p className="pb-label">{selectedRec ? "receiver" : selected === "QB" ? "quarterback" : "back"}</p>

              {selectedRec && (
                <>
                  <label className="pb-field-row">
                    <span className="pb-label">Side</span>
                    <select
                      className="pb-input" disabled={readOnly} value={selectedRec.side}
                      onChange={(e) => patchReceiver(selectedRec.slot, { side: e.target.value as Side })}
                    >
                      <option value="L">Left</option>
                      <option value="R">Right</option>
                    </select>
                  </label>
                  <label className="pb-field-row">
                    <span className="pb-label">Split</span>
                    <select
                      className="pb-input" disabled={readOnly} value={selectedRec.split}
                      onChange={(e) => patchReceiver(selectedRec.slot, { split: e.target.value as SplitName })}
                    >
                      {SPLITS.map((s) => (
                        <option key={s} value={s}>{s} — {v.splits[s].toFixed(1)} yd</option>
                      ))}
                    </select>
                  </label>
                  <p className="pb-label pb-hint">#{selectedRec.order} from the sideline</p>
                  {v.blockingLegal && (
                    <label className="pb-field-row">
                      <span className="pb-label">On the line</span>
                      <input
                        type="checkbox" disabled={readOnly} checked={selectedRec.onLine}
                        onChange={(e) => patchReceiver(selectedRec.slot, { onLine: e.target.checked })}
                      />
                    </label>
                  )}
                </>
              )}

              {selectedBack && (
                <>
                  <label className="pb-field-row">
                    <span className="pb-label">Alignment</span>
                    <select
                      className="pb-input" disabled={readOnly} value={selectedBack.align}
                      onChange={(e) => patchBack(selectedBack.slot, { align: e.target.value as BackAlign })}
                    >
                      {BACK_ALIGNS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <label className="pb-field-row">
                    <span className="pb-label">Side</span>
                    <select
                      className="pb-input" disabled={readOnly} value={selectedBack.side}
                      onChange={(e) => patchBack(selectedBack.slot, { side: e.target.value as Side | "mid" })}
                    >
                      <option value="mid">Middle</option>
                      <option value="L">Left</option>
                      <option value="R">Right</option>
                    </select>
                  </label>
                </>
              )}

              {selected === "QB" && (
                <label className="pb-field-row">
                  <span className="pb-label">Alignment</span>
                  <select
                    className="pb-input" disabled={readOnly} value={draft.qb.align}
                    onChange={(e) =>
                      setDraft((f) => ({ ...f, qb: { align: e.target.value as Formation["qb"]["align"] } }))
                    }
                  >
                    <option value="under">Under centre</option>
                    <option value="pistol">Pistol</option>
                    <option value="gun">Shotgun</option>
                  </select>
                </label>
              )}

              {drift && <p className="pb-label pb-hint">{drift}</p>}

              {selected !== "QB" && !readOnly && (
                <div className="pb-inspector-foot">
                  <button className="pb-btn pb-btn--danger" onClick={() => removeSlot(selected)}>
                    Remove {selected}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="pb-panel-title">{draft.name}</h3>
              <p className="pb-label pb-hint">
                {draft.backs.length + draft.receivers.length} skill players ·{" "}
                {v.label}
              </p>

              <label className="pb-field-row">
                <span className="pb-label">Strength</span>
                <select
                  className="pb-input" disabled={readOnly} value={draft.strength}
                  onChange={(e) => setDraft((f) => ({ ...f, strength: e.target.value as Side }))}
                >
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                </select>
              </label>
              <p className="pb-label pb-hint">
                Strength is the side this is drawn to. The other one is a flip, never a
                second formation.
              </p>

              <div className="pb-field-row pb-field-row--stack">
                <span className="pb-label">Add a player</span>
                <div className="pb-add-row">
                  <button
                    className="pb-btn"
                    disabled={readOnly}
                    onClick={() => addAt({ x: v.splits.slot, y: -1 })}
                  >
                    ＋ Receiver
                  </button>
                  <button
                    className="pb-btn"
                    disabled={readOnly}
                    onClick={() => addAt({ x: 0, y: qbAt.y - 2.5 })}
                  >
                    ＋ Back
                  </button>
                </div>
              </div>

              <p className="pb-label pb-hint">
                Or double-click the grass. Drag anyone to align him; select him to
                set the alignment by name.
              </p>
            </>
          )}

          {(problems.length > 0 || warnings.length > 0) && (
            <div className="pb-form-notes">
              {problems.map((p) => (
                <p key={p} className="pb-note pb-note--problem">{p}</p>
              ))}
              {warnings.map((w) => (
                <p key={w} className="pb-note">{w}</p>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
