"use client";

/**
 * One play, animated, with its coaching notes. This is where a coach sends a
 * player, and where the transport earns its keep.
 */

import { useMemo, useState } from "react";

import AnimatedPlay from "./AnimatedPlay";
import Field from "./Field";
import Transport from "./Transport";
import { useTimeline } from "./useTimeline";
import { resolvePlay } from "@/lib/playbook/resolve";
import { variant as variantOf } from "@/lib/playbook/field";
import { formationById } from "@/lib/playbook/formations";
import { validate, WARNING_LABEL } from "@/lib/playbook/validate";
import { TARGET_LABELS, deriveTargets } from "@/lib/playbook/search";
import type { BookStyle, FieldVariantId, Play } from "@/lib/playbook/types";

interface Props {
  play: Play;
  variant: FieldVariantId;
  style: BookStyle;
  inBook: boolean;
  readOnly: boolean;
  onEdit: () => void;
  onToggleBook: () => void;
  onClose: () => void;
  onFlipVariant?: (v: FieldVariantId) => void;
}

function usePrefersReducedMotion() {
  const [reduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  return reduced;
}

export default function PlayDetail({
  play, variant, style, inBook, readOnly, onEdit, onToggleBook, onClose, onFlipVariant,
}: Props) {
  const spec = play.spec;
  const [flip, setFlip] = useState(false);
  const [trails, setTrails] = useState(true);
  const reduced = usePrefersReducedMotion();

  const v = spec.variantScope.includes(variant) ? variant : spec.variantScope[0];
  const fv = variantOf(v);
  const resolved = useMemo(() => resolvePlay(play, v, flip, style), [play, v, flip, style]);
  const tl = useTimeline(resolved);
  const warnings = useMemo(() => validate(play, resolved, v), [play, resolved, v]);
  const targets = useMemo(() => deriveTargets(play), [play]);

  return (
    <div className="pb-detail">
      <header className="pb-detail-head">
        <button className="pb-back" onClick={onClose}>‹ Library</button>
        <div>
          <h2 className="pb-h2">{spec.name}</h2>
          <p className="pb-label">
            {[
              spec.philosophy.replace(/-/g, " "),
              spec.side === "defense"
                ? spec.coverageId?.replace(/-/g, " ")
                : formationById(spec.formationId)?.name,
              spec.personnelId ? `${spec.personnelId} personnel` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="pb-detail-actions">
          {spec.variantScope.length > 1 && onFlipVariant && (
            <div className="pb-seg">
              {spec.variantScope.map((sv) => (
                <button key={sv} aria-pressed={sv === v} onClick={() => onFlipVariant(sv)}>
                  {variantOf(sv).label}
                </button>
              ))}
            </div>
          )}
          <button className="pb-btn" onClick={() => setFlip((f) => !f)} data-tel="pb-flip" data-tel-project="playbook">
            ⇄ Flip
          </button>
          <button className={inBook ? "pb-btn pb-btn--primary" : "pb-btn"} onClick={onToggleBook}>
            {inBook ? "✓ In book" : "+ Add to book"}
          </button>
          <button className="pb-btn" onClick={onEdit} disabled={readOnly} title={readOnly ? "Create a playbook first" : undefined}>
            Edit
          </button>
        </div>
      </header>

      <div className="pb-detail-body">
        <div className="pb-detail-field">
          <Field variant={fv} ariaLabel={`${spec.name}, animated diagram`}>
            <AnimatedPlay
              play={resolved}
              timeline={tl.timeline}
              variant={fv}
              style={style}
              subscribe={tl.subscribe}
              playing={tl.playing}
              trails={trails}
            />
          </Field>
          <Transport
            timeline={tl.timeline}
            t={tl.t}
            playing={tl.playing}
            speed={tl.speed}
            loop={tl.loop}
            trails={trails}
            reducedMotion={reduced}
            onToggle={tl.toggle}
            onReset={tl.reset}
            onSeek={tl.seek}
            onStep={tl.stepForward}
            onSpeed={tl.setSpeed}
            onLoop={tl.setLoop}
            onTrails={setTrails}
          />
        </div>

        <aside className="pb-detail-side">
          {spec.reads.length > 0 && (
            <section>
              <h4 className="pb-label">Reads</h4>
              <ol className="pb-reads">
                {spec.reads.map((r) => (
                  <li key={r.order}>
                    <span className="pb-num">{r.order}</span>{" "}
                    <strong>{r.type.replace(/-/g, " ")}</strong> on <em>{r.key}</em>
                    {r.progression && <> — {r.progression.join(" → ")}</>}
                    {r.ifTake && r.ifNot && (
                      <>
                        {" "}— if he takes it, {Object.entries(r.ifTake)[0].join(" ")}; if not,{" "}
                        {Object.entries(r.ifNot)[0].join(" ")}
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {(spec.coaching.install || spec.coaching.keys || spec.coaching.vsCoverage || spec.coaching.commentary) && (
            <section>
              <h4 className="pb-label">Coaching</h4>
              {spec.coaching.install && <p className="pb-prose"><strong>Install.</strong> {spec.coaching.install}</p>}
              {spec.coaching.keys && <p className="pb-prose"><strong>Keys.</strong> {spec.coaching.keys}</p>}
              {spec.coaching.vsCoverage && <p className="pb-prose"><strong>Coverage.</strong> {spec.coaching.vsCoverage}</p>}
              {spec.coaching.commentary && <p className="pb-prose">{spec.coaching.commentary}</p>}
            </section>
          )}

          {play.notes && (
            <section>
              <h4 className="pb-label">Your notes</h4>
              <p className="pb-prose">{play.notes}</p>
            </section>
          )}

          <section>
            <h4 className="pb-label">Tagged</h4>
            <div className="pb-tags">
              {targets.map((t) => <span key={t} className="pb-tag">{TARGET_LABELS[t]}</span>)}
              {spec.situations.map((s) => <span key={s} className="pb-tag">{s.replace(/-/g, " ")}</span>)}
              {spec.tags.map((t) => <span key={t} className="pb-tag pb-tag--quiet">{t.replace(/-/g, " ")}</span>)}
            </div>
          </section>

          {resolved.omitted.length > 0 && (
            <section>
              <h4 className="pb-label">Not on this field</h4>
              <p className="pb-prose">
                {resolved.omitted.join(", ")} {resolved.omitted.length > 1 ? "have" : "has"} no place in a{" "}
                {fv.label} formation, so the concept runs with the rest.
              </p>
            </section>
          )}

          {warnings.length > 0 && (
            <section className="pb-warnings">
              <h4 className="pb-label">Checks</h4>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>
                    <span className="pb-warn-tag pb-label">{WARNING_LABEL[w.code]}</span> {w.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {play.lineage && play.lineage.source === "user" && (
            <section>
              <h4 className="pb-label">Lineage</h4>
              <p className="pb-prose">
                Derived from <code>{play.lineage.rootId}</code>, revision {play.lineage.rev}.
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
