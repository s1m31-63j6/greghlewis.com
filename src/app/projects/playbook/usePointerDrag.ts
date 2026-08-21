"use client";

/**
 * Pointer input in SVG space, plus the snap engine.
 *
 * THE ONE THING TO GET RIGHT is the coordinate conversion. Pan and zoom are a
 * transform on a single `<g>`, never a mutated viewBox, which means one call
 * gets model coordinates including the camera:
 *
 *     new DOMPoint(e.clientX, e.clientY).matrixTransform(g.getScreenCTM()!.inverse())
 *
 * Every subtle bug in a hand-rolled SVG editor traces back to computing this
 * from getBoundingClientRect by hand instead.
 *
 * A three-pixel movement threshold keeps a click from becoming a nudge, and the
 * magnet guides are what make snapping feel intentional rather than sticky.
 */

import { useCallback, useRef, useState } from "react";

import { UPY, fromSvg, svgX, svgY } from "@/lib/playbook/field";
import type { FieldVariant, Vec } from "@/lib/playbook/types";

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export const IDENTITY: Camera = { x: 0, y: 0, k: 1 };
export const MIN_K = 0.5;
export const MAX_K = 6;

/** Screen point to SVG-model point, through the camera. */
export function toModel(e: { clientX: number; clientY: number }, cam: SVGGElement | null): { x: number; y: number } | null {
  const svg = cam?.ownerSVGElement;
  const ctm = cam?.getScreenCTM();
  // Returns null on a detached or display:none SVG, which happens the first
  // time a panel opens over a field that has not been laid out yet.
  if (!svg || !ctm) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export interface Guide {
  axis: "x" | "y";
  at: number;
}

/**
 * Half-yard grid, with magnets for the things a coach actually aligns to: the
 * line of scrimmage, yard lines, the hashes, the middle of the field, and any
 * other player's x or y.
 */
export function snap(
  p: Vec,
  v: FieldVariant,
  others: Vec[],
  free: boolean,
): { at: Vec; guides: Guide[] } {
  if (free) return { at: p, guides: [] };

  const guides: Guide[] = [];
  const MAG = 0.6; // yards

  let x = Math.round(p.x * 2) / 2;
  let y = Math.round(p.y * 2) / 2;

  const hash = v.hashSeparationYd ? [-v.hashSeparationYd / 2, v.hashSeparationYd / 2] : [];
  for (const target of [0, ...hash, ...others.map((o) => o.x)]) {
    if (Math.abs(p.x - target) < MAG) {
      x = target;
      guides.push({ axis: "x", at: target });
      break;
    }
  }
  for (const target of [0, ...others.map((o) => o.y)]) {
    if (Math.abs(p.y - target) < MAG) {
      y = target;
      guides.push({ axis: "y", at: target });
      break;
    }
  }
  // Yard lines, if nothing closer claimed it.
  if (!guides.some((g) => g.axis === "y")) {
    const nearest = Math.round(p.y / 5) * 5;
    if (Math.abs(p.y - nearest) < MAG) {
      y = nearest;
      guides.push({ axis: "y", at: nearest });
    }
  }

  return { at: { x, y }, guides };
}

interface DragState {
  slot: string;
  grab: { x: number; y: number };
  origin: Vec;
  moved: boolean;
}

export function usePlayerDrag(
  v: FieldVariant,
  camRef: React.RefObject<SVGGElement | null>,
  onMove: (slot: string, at: Vec) => void,
  onCommit: (slot: string) => void,
  onSelect: (slot: string) => void,
) {
  const drag = useRef<DragState | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);

  const start = useCallback(
    (slot: string, at: Vec, e: React.PointerEvent, capture?: Element | null) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const m = toModel(e, camRef.current);
      if (!m) return;
      // Capture on the <svg>, so a drag that leaves the glyph — which every
      // drag does immediately — keeps delivering to the same handler.
      try {
        (capture ?? (e.currentTarget as Element)).setPointerCapture(e.pointerId);
      } catch {
        // Throws for a pointer that is not active. Not worth losing the drag.
      }
      drag.current = { slot, grab: m, origin: at, moved: false };
      setDragging(slot);
      e.preventDefault();
      e.stopPropagation();
    },
    [camRef],
  );

  const move = useCallback(
    (e: React.PointerEvent, others: Vec[]) => {
      const d = drag.current;
      if (!d) return;
      const m = toModel(e, camRef.current);
      if (!m) return;

      // Three screen pixels, expressed in model units so the threshold is the
      // same physical distance at every zoom level.
      if (!d.moved && Math.hypot(m.x - d.grab.x, m.y - d.grab.y) < 3) return;
      d.moved = true;

      const raw = fromSvg(
        svgX(d.origin.x, v) + (m.x - d.grab.x),
        svgY(d.origin.y, v) + (m.y - d.grab.y),
        v,
      );
      const constrained = e.shiftKey
        ? Math.abs(raw.x - d.origin.x) > Math.abs(raw.y - d.origin.y)
          ? { x: raw.x, y: d.origin.y }
          : { x: d.origin.x, y: raw.y }
        : raw;

      const s = snap(constrained, v, others, e.altKey);
      setGuides(s.guides);
      onMove(d.slot, s.at);
    },
    [camRef, onMove, v],
  );

  const end = useCallback(
    (e: React.PointerEvent, capture?: Element | null) => {
      const d = drag.current;
      drag.current = null;
      setGuides([]);
      setDragging(null);
      if (!d) return;
      try {
        (capture ?? (e.currentTarget as Element)).releasePointerCapture(e.pointerId);
      } catch {
        // The pointer can already be released if the element unmounted.
      }
      if (d.moved) onCommit(d.slot);
      else onSelect(d.slot);
    },
    [onCommit, onSelect],
  );

  return { start, move, end, guides, dragging };
}

// ─── camera ─────────────────────────────────────────────────────────────────

export function useCamera(v: FieldVariant) {
  const [cam, setCam] = useState<Camera>(IDENTITY);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; k: number } | null>(null);

  const fit = useCallback(() => setCam(IDENTITY), []);

  /** Zoom about the cursor, which is the only zoom that does not feel wrong. */
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setCam((c) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, c.k * factor));
      if (k === c.k) return c;
      const r = k / c.k;
      return { k, x: cx - (cx - c.x) * r, y: cy - (cy - c.y) * r };
    });
  }, []);

  const zoomCenter = useCallback(
    (factor: number) => {
      const w = v.viewWidthYd * UPY;
      const h = (v.window.aheadYd + v.window.behindYd) * UPY;
      zoomAt(factor, w / 2, h / 2);
    },
    [v, zoomAt],
  );

  /**
   * Lineman view: a detail MODE rather than a zoom level. Answers the loudest
   * complaint in the category — the reference product has no zoom at all.
   */
  const linemanView = useCallback(() => {
    const w = v.viewWidthYd * UPY;
    const h = (v.window.aheadYd + v.window.behindYd) * UPY;
    const k = 2.6;
    const cx = w / 2;
    const cy = v.window.aheadYd * UPY;
    setCam((c) => (c.k === k ? IDENTITY : { k, x: w / 2 - cx * k, y: h / 2 - cy * k }));
  }, [v]);

  /**
   * Zoom only on a deliberate gesture. A plain wheel over the field used to
   * zoom the camera, which — with the field taller than the viewport — meant
   * every attempt to scroll the page resized the diagram instead. A trackpad
   * pinch arrives as a wheel event with `ctrlKey` set, so pinch still zooms,
   * and ⌘/Ctrl + wheel does too.
   */
  const onWheel = useCallback(
    (e: React.WheelEvent, camEl: SVGGElement | null) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const m = toModel(e, camEl);
      if (!m) return;
      zoomAt(Math.pow(0.999, e.deltaY), m.x, m.y);
    },
    [zoomAt],
  );

  const startPan = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: 1 };
      pan.current = null;
      return;
    }
    // Only the previous screen position is kept. Panning by the delta since the
    // last move means the camera never has to be read back during render.
    pan.current = { x: e.clientX, y: e.clientY };
  }, []);

  const movePan = useCallback(
    (e: React.PointerEvent) => {
      if (pointers.current.has(e.pointerId)) {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      // Two fingers: centroid distance ratio zooms. About thirty lines instead
      // of a gesture library.
      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = dist / (pinch.current.dist || 1);
        pinch.current.dist = dist;
        zoomCenter(ratio);
        return;
      }
      const p = pan.current;
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      pan.current = { x: e.clientX, y: e.clientY };
      setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
    },
    [zoomCenter],
  );

  const endPan = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;
  }, []);

  return { cam, setCam, fit, zoomCenter, zoomAt, linemanView, onWheel, startPan, movePan, endPan };
}
