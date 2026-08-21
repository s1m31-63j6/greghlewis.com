"use client";

/**
 * Creating a playbook. No account, no email — the URL that comes back IS the
 * playbook, which is the whole sharing model and also the whole onboarding.
 */

import { useState } from "react";

import { MVP_VARIANTS, variant as variantOf } from "@/lib/playbook/field";
import type { FieldVariantId, Playbook } from "@/lib/playbook/types";

interface Props {
  onCreate: (name: string, variant: FieldVariantId) => Promise<Playbook | null>;
  onClose: () => void;
  error?: string | null;
}

export default function NewBook({ onCreate, onClose, error }: Props) {
  const [name, setName] = useState("");
  const [variant, setVariant] = useState<FieldVariantId>("11man");
  const [busy, setBusy] = useState(false);

  return (
    <div className="pb-modal" role="dialog" aria-label="New playbook" aria-modal="true">
      <div className="pb-modal-card pb-panel">
        <h2 className="pb-h2">New playbook</h2>
        <p className="pb-prose">
          No account needed. You get a link — anyone with it can view the book, and this
          browser keeps the key that lets you edit it.
        </p>

        <label className="pb-field-row pb-field-row--stack">
          <span className="pb-label">Name</span>
          <input
            className="pb-input"
            value={name}
            autoFocus
            placeholder="Varsity 2026"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="pb-field-row pb-field-row--stack">
          <span className="pb-label">Team size</span>
          <div className="pb-seg">
            {MVP_VARIANTS.map((v) => (
              <button key={v} aria-pressed={variant === v} onClick={() => setVariant(v)}>
                {variantOf(v).label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="pb-prose pb-error">{error}</p>}

        <div className="pb-modal-actions">
          <button className="pb-btn" onClick={onClose}>Cancel</button>
          <button
            className="pb-btn pb-btn--primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const created = await onCreate(name.trim() || "Untitled Playbook", variant);
              setBusy(false);
              if (created) onClose();
            }}
            data-tel="pb-create-book"
            data-tel-project="playbook"
          >
            {busy ? "Creating…" : "Create playbook"}
          </button>
        </div>
      </div>
    </div>
  );
}
