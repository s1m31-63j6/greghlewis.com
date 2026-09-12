"use client";

import type { Scoring } from "@/lib/start-sit/types";
import { PASS_TD_OPTIONS, REC_OPTIONS } from "@/lib/start-sit/types";

export function ScoringControl({
  scoring, onChange,
}: {
  scoring: Scoring;
  onChange: (s: Scoring) => void;
}) {
  return (
    <div className="ss-scoring" data-tour="scoring">
      <div className="ss-control-group">
        <span className="ss-control-label">Scoring</span>
        <div className="ss-seg" role="group" aria-label="Points per reception">
          {REC_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="ss-seg-btn"
              aria-pressed={scoring.rec === o.value}
              onClick={() => onChange({ ...scoring, rec: o.value })}
              data-tel="ss-scoring"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ss-control-group">
        <div className="ss-seg" role="group" aria-label="Points per passing touchdown">
          {PASS_TD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="ss-seg-btn"
              aria-pressed={scoring.passTd === o.value}
              onClick={() => onChange({ ...scoring, passTd: o.value })}
              data-tel="ss-scoring"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
