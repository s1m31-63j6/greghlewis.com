"use client";

// Past assistant turns rendered as compact, clickable cards beneath the
// main ResultPanel. Click to pin a past result back into the panel.

import type { ChatTurn } from "@/lib/adventureworks/types";

interface Props {
  items: { question: string; turn: ChatTurn }[];
  activeIdx: number | null;
  onSelect: (idx: number | null) => void;
  onReset: () => void;
}

export function QueryHistory({ items, activeIdx, onSelect, onReset }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-stone-500">
          Past queries ({items.length})
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-stone-500 hover:text-stone-900 underline underline-offset-2"
        >
          Clear all
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const active = activeIdx === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(active ? null : i)}
                className={`w-full text-left px-3 py-2 rounded-md border text-[13px] transition ${
                  active
                    ? "border-stone-900 bg-stone-100 text-stone-900"
                    : "border-stone-200 bg-white hover:border-stone-400 text-stone-700"
                }`}
              >
                <span className="truncate">{item.question}</span>
                {item.turn.meta && (
                  <span className="ml-2 text-[11px] text-stone-500 font-mono">
                    {item.turn.meta.model_id} · {(item.turn.meta.latency_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
