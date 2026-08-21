"use client";

/**
 * A library card. The diagram is the card — the name and the metadata are the
 * caption.
 *
 * Hovering starts a slow preview of the animation, which costs nothing once the
 * timeline exists and is the moment the app sells itself. Under reduced motion
 * the hover reveals static route endpoints instead.
 */

import { useMemo } from "react";

import Field from "./Field";
import PlayDiagram from "./PlayDiagram";
import { resolvePlay } from "@/lib/playbook/resolve";
import { variant as variantOf } from "@/lib/playbook/field";
import { formationById } from "@/lib/playbook/formations";
import type { BookStyle, FieldVariantId, PlaySpec } from "@/lib/playbook/types";

interface Props {
  spec: PlaySpec;
  variant: FieldVariantId;
  style: BookStyle;
  inBook: boolean;
  onOpen: (id: string) => void;
  onToggleBook: (spec: PlaySpec) => void;
  disabled?: boolean;
}

const FAMILY_LABEL: Record<string, string> = {
  run: "Run", pass: "Pass", rpo: "RPO", screen: "Screen",
  "play-action": "Play action", option: "Option", trick: "Trick",
  front: "Front", coverage: "Coverage", pressure: "Pressure",
};

export default function PlayCard({ spec, variant, style, inBook, onOpen, onToggleBook, disabled }: Props) {
  // Fall back to the play's own first variant when the book's variant does not
  // apply, so a card never renders empty just because the filter is wide.
  const v = spec.variantScope.includes(variant) ? variant : spec.variantScope[0];
  const fv = variantOf(v);
  const resolved = useMemo(() => resolvePlay({ spec }, v, false, style), [spec, v, style]);

  const situation = spec.situations[0]?.replace(/-/g, " ");
  const target = spec.primary ?? spec.run?.carrier ?? spec.coverageId ?? "";

  return (
    <article className="pb-card">
      <button
        className="pb-card-diagram"
        onClick={() => onOpen(spec.id)}
        aria-label={`Open ${spec.name}`}
        data-tel="pb-open-play"
        data-tel-project="playbook"
      >
        <Field variant={fv} density="card" showRules={false} ariaLabel={`${spec.name} diagram`}>
          <PlayDiagram play={resolved} variant={fv} style={style} density="card" />
        </Field>
      </button>

      <div className="pb-card-body">
        <h3 className="pb-card-title">{spec.name}</h3>
        <p className="pb-card-sub">
          {spec.side === "defense"
            ? [spec.frontId, spec.coverageId].filter(Boolean).join(" · ").replace(/-/g, " ")
            : formationById(spec.formationId)?.name ?? spec.formationId.replace(/-/g, " ")}
        </p>
        <p className="pb-card-meta pb-label">
          {[FAMILY_LABEL[spec.family] ?? spec.family, situation, target].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="pb-card-foot">
        <button
          className={inBook ? "pb-btn pb-btn--primary" : "pb-btn"}
          onClick={() => onToggleBook(spec)}
          disabled={disabled}
          data-tel="pb-toggle-book"
          data-tel-project="playbook"
        >
          {inBook ? "✓ In book" : "+ Add"}
        </button>
        <span className="pb-card-variants pb-label">{spec.variantScope.join(" · ").replace(/man|flag/g, "")}</span>
      </div>
    </article>
  );
}
