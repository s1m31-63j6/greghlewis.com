"use client";

/**
 * The transport. A scrub bar, a snap marker, per-player lanes.
 *
 * The playhead is a 3px vertical BAR rather than a circle — sharp, and it reads
 * as a playhead rather than as a slider knob. Everything left of the snap is
 * shaded, because pre-snap motion lives in negative time.
 *
 * 0.25x is listed first deliberately: that is coaching-tape speed, and it is
 * the one that actually gets used.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { SPEEDS, type Speed, type Timeline } from "./useTimeline";

interface Props {
  timeline: Timeline;
  t: number;
  playing: boolean;
  speed: Speed;
  loop: boolean;
  trails: boolean;
  reducedMotion: boolean;
  onToggle: () => void;
  onReset: () => void;
  onSeek: (t: number) => void;
  onStep: () => void;
  onSpeed: (s: Speed) => void;
  onLoop: (v: boolean) => void;
  onTrails: (v: boolean) => void;
  onDelay?: (slot: string, startSec: number) => void;
}

const fmt = (s: number) => {
  const sign = s < 0 ? "-" : "";
  const a = Math.abs(s);
  return `${sign}${Math.floor(a / 60)}:${(a % 60).toFixed(2).padStart(5, "0")}`;
};

export default function Transport({
  timeline, t, playing, speed, loop, trails, reducedMotion,
  onToggle, onReset, onSeek, onStep, onSpeed, onLoop, onTrails, onDelay,
}: Props) {
  const [lanes, setLanes] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  const span = timeline.endSec - timeline.startSec || 1;
  const pct = (v: number) => ((v - timeline.startSec) / span) * 100;

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = track.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      onSeek(timeline.startSec + f * span);
    },
    [onSeek, span, timeline.startSec],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (scrubbing.current) seekFromEvent(e.clientX);
    };
    const up = () => {
      scrubbing.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [seekFromEvent]);

  const moving = timeline.tracks.filter((x) => x.role !== "coverage" && x.role !== "block");

  return (
    <div className="pb-transport">
      <div className="pb-transport-row">
        <button
          className="pb-play"
          onClick={reducedMotion ? onStep : onToggle}
          aria-label={reducedMotion ? "Step forward" : playing ? "Pause" : "Play"}
          data-tel="pb-play"
          data-tel-project="playbook"
        >
          {reducedMotion ? "▶|" : playing ? "❙❙" : "▶"}
        </button>
        <button className="pb-icon-btn" onClick={onReset} aria-label="Rewind">⟲</button>

        <span className="pb-num pb-time">
          {fmt(t)} <span className="pb-time-total">/ {fmt(timeline.endSec)}</span>
        </span>

        <button className="pb-chip-toggle" aria-pressed={lanes} onClick={() => setLanes((v) => !v)}>
          Lanes
        </button>

        <div className="pb-seg pb-speed">
          {SPEEDS.map((s) => (
            <button key={s} aria-pressed={speed === s} onClick={() => onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>

        <button className="pb-chip-toggle" aria-pressed={loop} onClick={() => onLoop(!loop)}>Loop</button>
        <button className="pb-chip-toggle" aria-pressed={trails} onClick={() => onTrails(!trails)}>Trails</button>
      </div>

      <div
        className="pb-scrub"
        ref={track}
        onPointerDown={(e) => {
          scrubbing.current = true;
          seekFromEvent(e.clientX);
        }}
        role="slider"
        tabIndex={0}
        aria-label="Play timeline"
        aria-valuemin={timeline.startSec}
        aria-valuemax={timeline.endSec}
        aria-valuenow={t}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.5 : 0.05;
          if (e.key === "ArrowLeft") onSeek(t - step);
          if (e.key === "ArrowRight") onSeek(t + step);
          if (e.key === "Home") onSeek(timeline.startSec);
          if (e.key === "End") onSeek(timeline.endSec);
        }}
      >
        {timeline.startSec < 0 && (
          <div className="pb-presnap" style={{ width: `${pct(0)}%` }} />
        )}
        <div className="pb-scrub-fill" style={{ width: `${pct(t)}%` }} />
        {timeline.startSec < 0 && (
          <div className="pb-snap-mark" style={{ left: `${pct(0)}%` }}>
            <span className="pb-label">Snap</span>
          </div>
        )}
        <div className="pb-playhead" style={{ left: `${pct(t)}%` }} />
      </div>

      {lanes && (
        <div className="pb-lanes">
          {moving.map((tr) => (
            <div className="pb-lane" key={`${tr.slot}-${tr.role}`}>
              <span className="pb-label pb-lane-name">{tr.slot}</span>
              <div className="pb-lane-track">
                <div
                  className={`pb-lane-bar pb-lane-bar--${tr.role}`}
                  style={{ left: `${pct(tr.startSec)}%`, width: `${((tr.endSec - tr.startSec) / span) * 100}%` }}
                  title={`${tr.slot}: starts ${tr.startSec.toFixed(2)}s, runs ${(tr.endSec - tr.startSec).toFixed(2)}s`}
                />
                {onDelay && (
                  <input
                    className="pb-lane-delay"
                    type="range"
                    min={-1.5}
                    max={2}
                    step={0.05}
                    value={tr.startSec}
                    aria-label={`${tr.slot} start delay`}
                    onChange={(e) => onDelay(tr.slot, Number(e.target.value))}
                  />
                )}
              </div>
              <span className="pb-num pb-lane-num">{tr.startSec.toFixed(2)}s</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
