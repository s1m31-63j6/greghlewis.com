"use client";

import { useCallback, useState } from "react";

export interface SourceAttribution {
  work_title: string;
  year: number | null;
  source_url: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceAttribution[];
}

type StreamEvent =
  | { type: "meta"; sources: SourceAttribution[] }
  | { type: "text"; content: string }
  | {
      type: "done";
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    }
  | { type: "error"; message: string };

interface Options {
  leaderId: string;
  getTurnstileToken: () => string | undefined;
  // Reset the Turnstile widget after each submission so the user solves a
  // fresh challenge for the next message. Cloudflare tokens are
  // single-use; reusing one will fail server-side verification.
  resetTurnstile: () => void;
}

export function useChatThread({ leaderId, getTurnstileToken, resetTurnstile }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Streaming state for the assistant placeholder — the MessageRenderer
  // uses this to draw a cursor on the tail segment.
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null);

  const ask = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || busy) return;
      const turnstileToken = getTurnstileToken();
      if (!turnstileToken && process.env.NEXT_PUBLIC_TURNSTILE_REQUIRED === "true") {
        setError("Please complete the verification challenge.");
        return;
      }

      setBusy(true);
      setError(null);

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      setMessages((prev) => {
        const next = [...prev, userMsg, { role: "assistant" as const, content: "" }];
        setStreamingIdx(next.length - 1);
        return next;
      });

      try {
        const historyForServer = messages.map((m) => ({ role: m.role, content: m.content }));
        // The frontend now calls the Python FastAPI service directly
        // (LangChain + sentence-transformers + Chroma + Anthropic SDK).
        // In dev, both run on localhost; in prod, set this env var to
        // the deployed Python service URL.
        const apiBase =
          process.env.NEXT_PUBLIC_RELIGIOUS_VOICES_API || "http://localhost:8000";
        const res = await fetch(`${apiBase}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            leaderId,
            history: historyForServer,
            turnstileToken,
          }),
        });
        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assembled = "";
        let metaSources: SourceAttribution[] = [];

        const handleEvent = (ev: StreamEvent) => {
          if (ev.type === "text") {
            assembled += ev.content;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: assembled };
              }
              return next;
            });
          } else if (ev.type === "meta") {
            metaSources = ev.sources;
            // Attach sources to the assistant placeholder NOW so the
            // MessageRenderer can render inline superscript references
            // (e.g. "...the gift of the Sabbath³") as the text streams
            // in, rather than only after the full answer arrives.
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, sources: ev.sources };
              }
              return next;
            });
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
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
              } catch {
                // swallow malformed events rather than killing the stream
              }
            }
          }
        }

        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, sources: metaSources };
          }
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.content === "") next.pop();
          return next;
        });
      } finally {
        setBusy(false);
        setStreamingIdx(null);
        resetTurnstile();
      }
    },
    [busy, messages, leaderId, getTurnstileToken, resetTurnstile],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setStreamingIdx(null);
  }, []);

  return { messages, busy, error, streamingIdx, ask, reset };
}
