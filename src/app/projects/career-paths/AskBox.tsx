"use client";

import { useRef, useState } from "react";

import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";

import { useAsk } from "./useAsk";

// Cloudflare's "always passes" test sitekey. Fine for local dev without a
// real key; production must set NEXT_PUBLIC_TURNSTILE_SITE_KEY.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const PROJECT = "career-paths";

export default function AskBox({ starters }: { starters: string[] }) {
  const [value, setValue] = useState("");
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  const [hasTurnstileToken, setHasTurnstileToken] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY;

  const { messages, busy, error, ask, reset } = useAsk({
    getTurnstileToken: () => turnstileRef.current?.getToken(),
    resetTurnstile: () => {
      turnstileRef.current?.reset();
      setHasTurnstileToken(false);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setValue("");
    void ask(q);
  };

  return (
    <section className="cp-ask" id="ask" aria-labelledby="cp-ask-label">
      <div className="cp-kicker" id="cp-ask-label">Ask about this</div>

      <div className="cp-ask-starters">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            className="cp-ask-chip"
            disabled={busy}
            onClick={() => { setValue(""); void ask(s); }}
            data-tel="cp-ask"
            data-tel-project={PROJECT}
          >
            {s}
          </button>
        ))}
      </div>

      <form className="cp-ask-form" onSubmit={submit}>
        <input
          type="text"
          className="cp-ask-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask a question about stages, funding, or equity"
          maxLength={500}
          disabled={busy}
          aria-label="Your question"
        />
        <button
          type="submit"
          className="cp-btn primary"
          disabled={busy || !value.trim() || !hasTurnstileToken}
          title={!hasTurnstileToken ? "Complete the verification challenge to ask" : undefined}
          data-tel="cp-ask"
          data-tel-project={PROJECT}
        >
          Ask
        </button>
      </form>
      <Turnstile ref={turnstileRef} siteKey={siteKey} onTokenChange={(t) => setHasTurnstileToken(!!t)} />

      {(messages.length > 0 || busy || error) && (
        <div className="cp-ask-thread" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`cp-ask-turn ${m.role}`}>
              <div className="cp-kicker">{m.role === "user" ? "You" : "Answer"}</div>
              <p>{m.content}</p>
            </div>
          ))}
          {busy && <div className="cp-ask-working">Working…</div>}
          {error && <div className="cp-ask-error">Something went wrong. {error}</div>}
          {messages.length > 0 && !busy && (
            <button type="button" className="cp-ask-clear" onClick={() => { reset(); setValue(""); }}>
              Clear
            </button>
          )}
        </div>
      )}

      <p className="cp-ask-disclaimer">
        General explanation, not tax or financial advice. Answers draw on the brief above and on the model&apos;s general knowledge; check anything you would act on.
      </p>
    </section>
  );
}
