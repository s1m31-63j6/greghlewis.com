"use client";

import type { ModelChoice } from "@/lib/adventureworks/types";

interface Props {
  value: ModelChoice;
  onChange: (m: ModelChoice) => void;
  disabled?: boolean;
}

const OPTIONS: {
  value: ModelChoice;
  label: string;
  sub: string;
  disabled?: boolean;
  disabledNote?: string;
}[] = [
  {
    value: "azure-openai",
    label: "Azure OpenAI",
    sub: "gpt-4o-mini",
    disabled: true,
    disabledNote:
      "Azure OpenAI access is being provisioned on this subscription — Claude is live in the meantime.",
  },
  { value: "claude", label: "Claude", sub: "sonnet-4.6" },
];

export function ModelToggle({ value, onChange, disabled }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Model selection"
      className="inline-flex items-center rounded-full border border-stone-300 bg-stone-50 p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = o.value === value;
        const isDisabled = disabled || o.disabled;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            disabled={isDisabled}
            title={o.disabledNote}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 text-xs rounded-full transition flex items-baseline gap-1.5 ${
              active
                ? "bg-white text-stone-900 shadow-sm border border-stone-200"
                : "text-stone-500 hover:text-stone-900"
            } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span className="font-medium">{o.label}</span>
            <span className="text-[10px] text-stone-500 font-mono">{o.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
