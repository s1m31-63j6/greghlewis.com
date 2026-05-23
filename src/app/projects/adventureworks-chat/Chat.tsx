"use client";

import { useEffect, useRef, useState } from "react";
import { MessageRenderer } from "./MessageRenderer";
import { ModelToggle } from "./ModelToggle";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { DashboardLauncher } from "./DashboardLauncher";
import { STARTERS } from "./starters";
import { useChatThread } from "./useChatThread";
import type { ModelChoice } from "@/lib/adventureworks/types";

// Cloudflare's "always passes" test sitekey. Used as a fallback so local
// dev works without a real key set in env.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

interface Props {
  functionUrl: string;
}

export function Chat({ functionUrl }: Props) {
  const [value, setValue] = useState("");
  const [model, setModel] = useState<ModelChoice>("claude");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const [hasTurnstileToken, setHasTurnstileToken] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [turns, busy]);

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

  const empty = turns.length === 0 && !busy;
  const functionUrlMissing = !functionUrl;

  if (functionUrlMissing) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="font-medium">Chat backend not configured.</div>
        <div className="text-[13px] text-amber-800 mt-1">
          Set <code className="text-[12px] bg-amber-100 px-1 rounded">
            NEXT_PUBLIC_ADVENTUREWORKS_FUNCTION_URL
          </code>{" "}
          in the Amplify environment, redeploy, and this chat will come live.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ModelToggle value={model} onChange={setModel} disabled={busy} />
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              reset();
              setValue("");
            }}
            className="text-[11px] text-stone-500 hover:text-stone-900 underline underline-offset-2 transition"
          >
            New conversation
          </button>
        )}
      </div>

      <div
        ref={threadRef}
        className="rounded-xl border border-stone-200 bg-stone-50/50 p-5 min-h-[320px] max-h-[68vh] overflow-y-auto"
      >
        {empty ? (
          <div className="text-stone-500 text-sm">
            <p className="mb-3">
              Ask the warehouse a question. The model will generate T-SQL,
              run it against AdventureWorksDW, draw the result as a chart,
              and tell you what it means.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {STARTERS.map((s) => (
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
          </div>
        ) : (
          <div className="space-y-6">
            {turns.map((t, i) => (
              <div key={i}>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">
                  {t.role === "user" ? "You" : "AdventureWorks Reporting"}
                </div>
                {t.role === "user" ? (
                  <p className="text-stone-900 font-medium text-[15px] leading-relaxed">
                    {t.content}
                  </p>
                ) : (
                  <MessageRenderer
                    turn={t}
                    streaming={i === streamingIdx && busy}
                    onLaunchDashboard={() => setDashboardOpen(true)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-amber-700">
            <span className="font-medium">Something went wrong.</span>{" "}
            <span className="text-stone-600">{error}</span>
          </div>
        )}
      </div>

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
            placeholder="Ask the warehouse…"
            disabled={busy}
            className="flex-1 bg-white border border-stone-300 rounded-md px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 focus:outline-none focus:border-stone-500 transition disabled:opacity-60"
          />
          <button
            type="submit"
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

      <DashboardLauncher
        functionUrl={functionUrl}
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
      />
    </div>
  );
}
