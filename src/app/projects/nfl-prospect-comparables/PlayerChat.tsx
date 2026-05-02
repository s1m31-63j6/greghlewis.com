"use client";

import { useEffect, useRef, useState } from "react";
import { useChatThread } from "./useChatThread";

interface Props {
  playerId: string;
  playerName: string;
  onFocus?: (playerIds: string[]) => void;
}

// Caller is expected to pass `key={playerId}` so React remounts and resets
// state when the side panel switches prospects — avoids effect-driven resets.
export default function PlayerChat({ playerId, playerName, onFocus }: Props) {
  const [value, setValue] = useState("");
  const { messages, busy, error, ask, reset } = useChatThread({
    playerId,
    playerName,
    onFocus,
  });
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, busy]);

  const firstName = playerName.split(" ")[0];
  const starters = [
    `What's ${firstName}'s archetype?`,
    `What's the biggest concern in his profile?`,
    `Which historical player does he most resemble?`,
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setValue("");
    void ask(q);
  };

  const empty = messages.length === 0 && !busy && !error;

  return (
    <div>
      <p className="text-xs text-stone-500 mb-3">
        Ask anything about {playerName}.
      </p>

      {empty ? (
        <>
          <form onSubmit={submit} className="relative">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Ask about ${firstName}…`}
              className="w-full bg-white border border-stone-200 rounded-full px-4 py-2 pr-20 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-400 transition"
            />
            <button
              type="submit"
              disabled={!value.trim()}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-xs px-3 py-1.5 rounded-full bg-stone-900 hover:bg-stone-700 text-white transition disabled:opacity-50"
            >
              Ask
            </button>
          </form>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {starters.map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 border border-stone-200 transition"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-stone-50 border border-stone-200 rounded-xl flex flex-col max-h-[55vh]">
          <div
            ref={threadRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 min-h-0"
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
          <div className="border-t border-stone-200 px-2 py-2 flex items-center gap-1.5">
            <form onSubmit={submit} className="relative flex-1">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Ask a follow-up…"
                autoFocus
                disabled={busy}
                className="w-full bg-white border border-stone-200 rounded-full px-3 py-1.5 pr-14 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-400 transition disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || !value.trim()}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 text-xs px-2.5 py-1 rounded-full bg-stone-900 hover:bg-stone-700 text-white transition disabled:opacity-50"
              >
                {busy ? "…" : "Ask"}
              </button>
            </form>
            <button
              onClick={() => {
                reset();
                setValue("");
              }}
              disabled={busy}
              title="Start a new conversation"
              className="text-[10px] text-stone-500 hover:text-stone-900 px-1.5 transition disabled:opacity-40"
            >
              New
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
