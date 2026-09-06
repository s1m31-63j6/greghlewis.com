"use client";

import { useCallback, useRef, useState } from "react";

// The SSE loop from religious-voices/useChatThread.ts, without the typing
// effect. Amplify's SSR buffers the stream, so on production every delta
// arrives at once anyway; we accumulate in a ref and commit the answer
// when the stream closes, and show a WORKING indicator until then.

export interface AskMessage {
  role: "user" | "assistant";
  content: string;
}

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

interface Options {
  getTurnstileToken: () => string | undefined;
  // Cloudflare tokens are single-use; reset after every submission.
  resetTurnstile: () => void;
}

export function useAsk({ getTurnstileToken, resetTurnstile }: Options) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assembled = useRef("");

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;
      const turnstileToken = getTurnstileToken();
      if (!turnstileToken && process.env.NEXT_PUBLIC_TURNSTILE_REQUIRED === "true") {
        setError("Please complete the verification challenge.");
        return;
      }

      setBusy(true);
      setError(null);
      assembled.current = "";
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

      try {
        const res = await fetch("/api/career-paths/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, history, turnstileToken }),
        });
        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (ev: StreamEvent) => {
          if (ev.type === "delta") assembled.current += ev.text;
          else if (ev.type === "error") throw new Error(ev.message);
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of raw.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              try {
                handleEvent(JSON.parse(payload) as StreamEvent);
              } catch (e) {
                if (e instanceof SyntaxError) continue; // malformed event; keep reading
                throw e;
              }
            }
          }
        }

        const answer = assembled.current.trim();
        if (!answer) throw new Error("No answer came back.");
        setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(false);
        resetTurnstile();
      }
    },
    [busy, messages, getTurnstileToken, resetTurnstile],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, busy, error, ask, reset };
}
