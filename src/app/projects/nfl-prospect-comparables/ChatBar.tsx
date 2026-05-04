"use client";

import { useEffect, useRef, useState } from "react";
import { useChatThread, type AnswerLength } from "./useChatThread";

// Rotated through the empty-state input as carousel placeholder text.
// Slot 0 is the static intro; the others showcase capability ranges
// (class-level, find-style, comparison) so the user sees what kinds
// of questions land before typing.
const SUGGESTIONS = [
  "Ask ScoutBot about a 2026 prospect, an archetype, a comparison…",
  "Try: How does the 2026 WR class compare to 2025?",
  "Try: Find a Saquon-style runner in this draft",
  "Try: Compare Stroud and Mendoza",
];
const SUGGESTION_INTERVAL_MS = 3500;

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
  // Carousel index for the empty-state placeholder. Pauses on focus and
  // when the user has typed anything — keeps the carousel from feeling
  // like a moving target while the user is composing.
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
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

  // Carousel suggestions. Paused while the user is typing or focused on
  // the input — a moving placeholder under the cursor would be jarring.
  useEffect(() => {
    if (inputFocused || value) return;
    const id = setInterval(() => {
      setSuggestionIdx((i) => (i + 1) % SUGGESTIONS.length);
    }, SUGGESTION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [inputFocused, value]);

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

  // Compact length toggle, sized to live inline inside the chat input
  // immediately to the left of the Ask button. The same component slots
  // into all three input states (empty / collapsed / expanded follow-up).
  const lengthToggle = (
    <div className="inline-flex items-center rounded-full border border-stone-200 bg-white/95 overflow-hidden shrink-0">
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
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 transition ${
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

  // Empty state: input only, with rotating placeholder suggestions
  // and the length toggle pinned inside the bar next to Ask. No more
  // pill row underneath — the suggestions live in the input itself.
  if (empty) {
    const showCarousel = !value && !inputFocused;
    return (
      <div
        ref={rootRef}
        className="absolute z-10 pointer-events-auto top-2 inset-x-2 md:top-16 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[min(640px,calc(100vw-32px))]"
      >
        <form onSubmit={submit} className="relative">
          <input
            type="text"
            value={value}
            onChange={onChangeValue}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            // Empty native placeholder so our carousel overlay has a
            // clean slot. The browser's placeholder still kicks in if
            // JS is somehow disabled — graceful enough.
            placeholder=""
            aria-label="Ask ScoutBot"
            className="w-full bg-white/85 backdrop-blur-md border border-stone-200 rounded-full px-5 py-2.5 pr-[148px] text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-400 focus:bg-white shadow-sm transition"
          />
          {showCarousel && (
            <span
              key={suggestionIdx}
              aria-hidden
              className="absolute inset-y-0 left-5 right-[148px] flex items-center text-sm text-stone-500 pointer-events-none truncate animate-[chatSuggestionEnter_400ms_ease-out]"
            >
              {SUGGESTIONS[suggestionIdx]}
            </span>
          )}
          <div className="absolute right-[60px] top-1/2 -translate-y-1/2">
            {lengthToggle}
          </div>
          <button
            type="submit"
            disabled={!value.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs px-3 py-1.5 rounded-full bg-stone-900 hover:bg-stone-700 text-white transition disabled:opacity-50"
          >
            Ask
          </button>
        </form>
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
        className="absolute z-10 pointer-events-auto top-2 inset-x-2 md:top-16 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[min(640px,calc(100vw-32px))]"
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
              className="w-full bg-white/85 backdrop-blur-md border border-stone-200 rounded-full px-5 py-2.5 pr-[148px] text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-400 focus:bg-white shadow-sm transition"
            />
            <div className="absolute right-[60px] top-1/2 -translate-y-1/2">
              {lengthToggle}
            </div>
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
      className="absolute z-10 pointer-events-auto top-2 inset-x-2 md:top-16 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[min(640px,calc(100vw-32px))]"
    >
      <div className="bg-white/95 backdrop-blur-md border border-stone-200 rounded-2xl shadow-md flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-end px-3 py-1.5 border-b border-stone-100">
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
              className="w-full bg-white border border-stone-200 rounded-full px-4 py-1.5 pr-[140px] text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-400 transition disabled:opacity-60"
            />
            <div className="absolute right-[56px] top-1/2 -translate-y-1/2">
              {lengthToggle}
            </div>
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
