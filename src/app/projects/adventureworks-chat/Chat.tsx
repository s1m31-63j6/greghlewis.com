"use client";

// Dashboard-first layout for the chat-based reporting engine.
//
//   ┌─────────────────────────────────────────────────────┐
//   │  Model toggle              [Clear]                  │
//   │  [ Ask the warehouse … ]                    [ Ask ] │
//   │  Turnstile widget                                   │
//   ├─────────────────────────────────────────────────────┤
//   │  ResultPanel  — large persistent chart + table      │
//   │  + narrative + SQL expander + meta                  │
//   ├─────────────────────────────────────────────────────┤
//   │  Past queries — clickable cards                     │
//   └─────────────────────────────────────────────────────┘

import { useEffect, useMemo, useRef, useState } from "react";
import { ResultPanel } from "./ResultPanel";
import { ModelToggle } from "./ModelToggle";
import { QueryHistory } from "./QueryHistory";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { STARTERS } from "./starters";
import { useChatThread } from "./useChatThread";
import type { ChatTurn, ModelChoice } from "@/lib/adventureworks/types";

const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

interface Props {
  functionUrl: string;
}

export function Chat({ functionUrl }: Props) {
  const [value, setValue] = useState("");
  const [model, setModel] = useState<ModelChoice>("claude");
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const [hasTurnstileToken, setHasTurnstileToken] = useState(false);

  const siteKey =
    process.env.NEXT_PUBLIC_ADVENTUREWORKS_TURNSTILE_SITEKEY ||
    TURNSTILE_TEST_SITE_KEY;

  const { turns, busy, error, streamingIdx, ask, reset } = useChatThread({
    getTurnstileToken: () => turnstileRef.current?.getToken(),
    resetTurnstile: () => {
      turnstileRef.current?.reset();
      setHasTurnstileToken(false);
    },
    functionUrl,
  });

  const assistantTurns = useMemo(
    () => turns.filter((t) => t.role === "assistant") as ChatTurn[],
    [turns],
  );
  const latestAssistant = assistantTurns[assistantTurns.length - 1] ?? null;
  const displayed: ChatTurn | null =
    pinnedIdx !== null ? assistantTurns[pinnedIdx] ?? latestAssistant : latestAssistant;
  const history = assistantTurns.slice(0, -1).map((t) => ({
    question: t.question ?? "(no question)",
    turn: t,
  }));
  const streamingCurrent =
    pinnedIdx === null && busy && streamingIdx !== null;

  // Reset pin whenever a new query is asked.
  useEffect(() => {
    if (busy) setPinnedIdx(null);
  }, [busy]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setValue("");
    void ask(q, model);
  };

  const askStarter = (q: string) => {
    if (busy) return;
    setValue("");
    void ask(q, model);
  };

  if (!functionUrl) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="font-medium">Chat backend not configured.</div>
        <div className="text-[13px] text-amber-800 mt-1">
          Set <code className="text-[12px] bg-amber-100 px-1 rounded">
            NEXT_PUBLIC_ADVENTUREWORKS_FUNCTION_URL
          </code>{" "}
          in the Amplify environment, redeploy, and the chat will come online.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Query bar */}
      <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ModelToggle value={model} onChange={setModel} disabled={busy} />
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                reset();
                setValue("");
                setPinnedIdx(null);
              }}
              className="text-[11px] text-stone-500 hover:text-stone-900 underline underline-offset-2"
            >
              Clear all
            </button>
          )}
        </div>
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask the warehouse…"
            disabled={busy}
            className="flex-1 bg-white border border-stone-300 rounded-md px-4 py-2.5 text-[15px] text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-500 transition disabled:opacity-60"
          />
          <button
            type="submit"
            data-tel="aw-query"
            disabled={busy || !value.trim() || !hasTurnstileToken}
            title={
              !hasTurnstileToken
                ? "Complete the verification challenge to ask"
                : undefined
            }
            className="text-sm px-6 py-2.5 rounded-md bg-stone-900 hover:bg-stone-700 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Asking…" : "Ask"}
          </button>
        </form>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <Turnstile
            ref={turnstileRef}
            siteKey={siteKey}
            onTokenChange={(t) => setHasTurnstileToken(!!t)}
          />
          {turns.length === 0 && !busy && (
            <div className="flex flex-wrap gap-1.5 max-w-[60%]">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => askStarter(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-stone-300 bg-white text-stone-700 hover:border-stone-500 hover:text-stone-900 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Something went wrong.</span>{" "}
          <span className="text-amber-800">{error}</span>
        </div>
      )}

      {/* Main result panel */}
      <ResultPanel
        turn={displayed}
        streaming={streamingCurrent && displayed === latestAssistant}
      />

      {/* History */}
      <QueryHistory
        items={history}
        activeIdx={pinnedIdx}
        onSelect={setPinnedIdx}
        onReset={() => {
          reset();
          setPinnedIdx(null);
        }}
      />
    </div>
  );
}
