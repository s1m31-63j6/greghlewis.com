"use client";

import { useEffect, useRef, useState } from "react";
import { useChatThread, type AnswerLength } from "./useChatThread";

const STARTERS = [
  "How does the 2026 WR class compare to 2025?",
  "Find a Saquon-style runner in this draft",
  "Compare Stroud and Mendoza",
];

interface Props {
  onFocus?: (playerIds: string[]) => void;
}

export default function ChatBar({ onFocus }: Props) {
  const [value, setValue] = useState("");
  // Collapse hides the thread but PRESERVES state (messages, contextPlayerIds
  // in the hook). Re-expanding restores the conversation. Clicking outside
  // also collapses — same idea, just discovered via another gesture.
  const [collapsed, setCollapsed] = useState(false);
  // Per-conversation answer length. Default short (chat-box-friendly).
  // The setting is sticky across turns until the user flips it.
  const [length, setLength] = useState<AnswerLength>("short");
  const { messages, busy, error, ask, reset } = useChatThread({ onFocus });
  const threadRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const hasContent = messages.length > 0 || busy || !!error;
  const showThread = hasContent && !collapsed;

  // Auto-scroll the thread to the latest answer as it arrives.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, busy, showThread]);

  // Click outside collapses the thread (does NOT reset state). The user
  // explicitly resets via the "New" control.
  useEffect(() => {
    if (!hasContent || collapsed) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (busy) return;
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setCollapsed(true);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [hasContent, collapsed, busy]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setValue("");
    setCollapsed(false); // sending always opens the thread
    void ask(q, length);
  };

  const onChangeValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    // Typing into the input while collapsed should restore the thread
    // so the user can see what they're following up on.
    if (collapsed && e.target.value) setCollapsed(false);
  };

  const empty = !hasContent;

  const lengthToggle = (
    <div className="inline-flex items-center rounded-full border border-stone-200 bg-white/70 backdrop-blur-sm overflow-hidden shrink-0">
      {(["short", "long"] as AnswerLength[]).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setLength(opt)}
          aria-pressed={length === opt}
          title={
            opt === "short"
              ? "Concise answer (default)"
              : "Longer, more detailed answer"
          }
          className={`text-[10px] uppercase tracking-wider px-2 py-1 transition ${
            length === opt
              ? "bg-stone-900 text-white"
              : "text-stone-500 hover:text-stone-900"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  // Empty state: lone input + starter chips.
  if (empty) {
    return (
      <div
        ref={rootRef}
        className="absolute top-16 left-1/2 -translate-x-1/2 z-10 w-[min(640px,calc(100vw-32px))] pointer-events-auto"
      >
        <form onSubmit={submit} className="relative">
          <input
            type="text"
            value={value}
            onChange={onChangeValue}
            placeholder="Ask ScoutBot about a 2026 prospect, an archetype, a comparison…"
            className="w-full bg-white/85 backdrop-blur-md border border-stone-200 rounded-full px-5 py-2.5 pr-24 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-400 focus:bg-white shadow-sm transition"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs px-3 py-1.5 rounded-full bg-stone-900 hover:bg-stone-700 text-white transition disabled:opacity-50"
          >
            Ask
          </button>
        </form>
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap justify-center">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => void ask(s, length)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-white/70 hover:bg-white text-stone-600 hover:text-stone-900 border border-stone-200 backdrop-blur-sm transition"
            >
              {s}
            </button>
          ))}
          {lengthToggle}
        </div>
      </div>
    );
  }

  // Collapsed state: just the input row + a small chip on the right that
  // shows turn count and lets the user re-expand. State is preserved in
  // the hook; submitting or typing auto-expands.
  if (collapsed) {
    const turnCount = messages.filter((m) => m.role === "assistant").length;
    return (
      <div
        ref={rootRef}
        className="absolute top-16 left-1/2 -translate-x-1/2 z-10 w-[min(640px,calc(100vw-32px))] pointer-events-auto"
      >
        <form onSubmit={submit} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title={`Expand conversation (${turnCount} ${turnCount === 1 ? "answer" : "answers"})`}
            className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full bg-white/85 backdrop-blur-md border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-white transition flex items-center gap-1 shadow-sm"
          >
            <span className="font-mono">{turnCount}</span>
            <span aria-hidden>▾</span>
          </button>
          <div className="relative flex-1">
            <input
              type="text"
              value={value}
              onChange={onChangeValue}
              placeholder="Ask a follow-up… (conversation collapsed)"
              className="w-full bg-white/85 backdrop-blur-md border border-stone-200 rounded-full px-5 py-2.5 pr-16 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-400 focus:bg-white shadow-sm transition"
            />
            <button
              type="submit"
              disabled={!value.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs px-3 py-1.5 rounded-full bg-stone-900 hover:bg-stone-700 text-white transition disabled:opacity-50"
            >
              Ask
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Expanded state: thread above, sticky input + carat + "New" at bottom.
  return (
    <div
      ref={rootRef}
      className="absolute top-16 left-1/2 -translate-x-1/2 z-10 w-[min(640px,calc(100vw-32px))] pointer-events-auto"
    >
      <div className="bg-white/95 backdrop-blur-md border border-stone-200 rounded-2xl shadow-md flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-stone-100">
          {lengthToggle}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse conversation"
            className="text-stone-400 hover:text-stone-700 text-sm leading-none px-1 transition"
            aria-label="Collapse conversation"
          >
            <span aria-hidden>▴</span>
          </button>
        </div>

        <div
          ref={threadRef}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0"
        >
          {messages.map((m, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">
                {m.role === "user" ? "You" : "ScoutBot"}
              </div>
              <p
                className={`text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "text-stone-900 font-medium"
                    : "text-stone-800"
                }`}
              >
                {m.content}
              </p>
            </div>
          ))}
          {busy && (
            <div className="text-sm text-stone-500 italic">
              Reading the scouting reports…
            </div>
          )}
          {error && (
            <div className="text-sm text-amber-700">
              <span className="font-medium">Couldn’t reach ScoutBot.</span>{" "}
              <span className="text-stone-600">{error}</span>
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 px-3 py-2.5 flex items-center gap-2">
          <form onSubmit={submit} className="relative flex-1">
            <input
              type="text"
              value={value}
              onChange={onChangeValue}
              placeholder="Ask a follow-up…"
              autoFocus
              disabled={busy}
              className="w-full bg-white border border-stone-200 rounded-full px-4 py-1.5 pr-16 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-400 transition disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !value.trim()}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-xs px-3 py-1 rounded-full bg-stone-900 hover:bg-stone-700 text-white transition disabled:opacity-50"
            >
              {busy ? "…" : "Ask"}
            </button>
          </form>
          <button
            onClick={() => {
              reset();
              setValue("");
              setCollapsed(false);
            }}
            disabled={busy}
            title="Start a new conversation"
            className="text-[11px] text-stone-500 hover:text-stone-900 px-2 py-1 transition disabled:opacity-40"
          >
            New
          </button>
        </div>
      </div>
    </div>
  );
}
