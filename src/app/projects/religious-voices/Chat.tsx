"use client";

import { useEffect, useRef, useState } from "react";
import { MessageRenderer } from "./MessageRenderer";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";
import { STARTERS } from "./starters";
import { useChatThread } from "./useChatThread";
import type { Leader } from "@/lib/religious-voices/types";

// Cloudflare's "always passes" test sitekey. Fine for local dev without a
// real key; production must set NEXT_PUBLIC_TURNSTILE_SITE_KEY.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

interface Props {
  leader: Leader;
}

export function Chat({ leader }: Props) {
  const [value, setValue] = useState("");
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const [hasTurnstileToken, setHasTurnstileToken] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY;

  const { messages, busy, error, streamingIdx, ask, reset } = useChatThread({
    leaderId: leader.leader_id,
    getTurnstileToken: () => turnstileRef.current?.getToken(),
    resetTurnstile: () => {
      turnstileRef.current?.reset();
      setHasTurnstileToken(false);
    },
  });

  // Reset the conversation when the user switches leaders — each
  // conversation is bound to one persona.
  useEffect(() => {
    reset();
    setValue("");
    // reset is stable via useCallback in the hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leader.leader_id]);

  // Scroll to bottom as new content streams in.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, busy]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setValue("");
    void ask(q);
  };

  const askStarter = (q: string) => {
    if (busy) return;
    setValue("");
    void ask(q);
  };

  const starters = STARTERS[leader.religion] ?? [];
  const empty = messages.length === 0 && !busy;

  return (
    <div className="flex flex-col gap-4">
      {/* Thread */}
      <div
        ref={threadRef}
        className="rounded-xl border border-stone-200 bg-stone-50/50 p-5 min-h-[280px] max-h-[60vh] overflow-y-auto"
      >
        {empty ? (
          <div className="text-stone-500 text-sm">
            <p className="mb-3">
              Ask {leader.full_name.split(" ")[0]} a question. The bot will
              draw on this leader&apos;s published writings. Sourced sentences
              appear in roman; <em className="text-stone-500">italicized
              sentences</em> are extrapolation in the leader&apos;s style and
              are not their own words.
            </p>
            {starters.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => askStarter(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-stone-300 bg-white text-stone-700 hover:border-stone-500 hover:text-stone-900 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((m, i) => (
              <div key={i}>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">
                  {m.role === "user" ? "You" : leader.full_name}
                </div>
                {m.role === "user" ? (
                  <p className="text-stone-900 font-medium text-[15px] leading-relaxed">
                    {m.content}
                  </p>
                ) : (
                  <>
                    <MessageRenderer
                      content={m.content}
                      sources={m.sources}
                      streaming={i === streamingIdx && busy}
                    />
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-stone-200 text-[11px] text-stone-500 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="uppercase tracking-wider">Sources:</span>
                        {m.sources.map((s, j) => (
                          <a
                            key={j}
                            href={s.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-stone-900 underline decoration-stone-300 underline-offset-2"
                          >
                            {s.work_title}
                            {s.year ? ` (${s.year})` : ""}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {busy && messages[messages.length - 1]?.content === "" && (
              <div className="text-sm text-stone-500 italic">Listening…</div>
            )}
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-amber-700">
            <span className="font-medium">Something went wrong.</span>{" "}
            <span className="text-stone-600">{error}</span>
          </div>
        )}
      </div>

      {/* Turnstile + Input */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="shrink-0">
          <Turnstile
            ref={turnstileRef}
            siteKey={siteKey}
            onTokenChange={(t) => setHasTurnstileToken(!!t)}
          />
        </div>
        <form onSubmit={submit} className="flex-1 flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Ask ${leader.full_name}…`}
            disabled={busy}
            className="flex-1 bg-white border border-stone-300 rounded-md px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-500 transition disabled:opacity-60"
          />
          <button
            type="submit"
            data-tel="voices-chat"
            disabled={busy || !value.trim() || !hasTurnstileToken}
            title={
              !hasTurnstileToken
                ? "Complete the verification challenge to ask"
                : undefined
            }
            className="text-sm px-5 py-2.5 rounded-md bg-stone-900 hover:bg-stone-700 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "…" : "Ask"}
          </button>
        </form>
      </div>
      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            reset();
            setValue("");
          }}
          className="self-start text-[11px] text-stone-500 hover:text-stone-900 underline underline-offset-2 transition"
        >
          Start a new conversation
        </button>
      )}
    </div>
  );
}
