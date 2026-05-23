"use client";

import { useCallback, useState } from "react";
import type {
  ChatTurn,
  ModelChoice,
  StreamEvent,
} from "@/lib/adventureworks/types";

interface Options {
  getTurnstileToken: () => string | undefined;
  resetTurnstile: () => void;
  // Function URL (cross-origin). Defaults to the env var; passed
  // explicitly so the component can fall back to a banner if missing.
  functionUrl: string;
}

export function useChatThread({ getTurnstileToken, resetTurnstile, functionUrl }: Options) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null);

  const ask = useCallback(
    async (query: string, model: ModelChoice) => {
      const trimmed = query.trim();
      if (!trimmed || busy) return;
      const turnstileToken = getTurnstileToken();

      setBusy(true);
      setError(null);

      const userTurn: ChatTurn = { role: "user", content: trimmed };
      const assistantTurn: ChatTurn = { role: "assistant", content: "" };

      setTurns((prev) => {
        const next = [...prev, userTurn, assistantTurn];
        setStreamingIdx(next.length - 1);
        return next;
      });

      try {
        const history = turns
          .filter((t) => t.role === "user" || t.role === "assistant")
          .map((t) => ({ role: t.role, content: t.content }));

        const res = await fetch(`${functionUrl.replace(/\/$/, "")}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            model,
            history,
            turnstile_token: turnstileToken,
          }),
        });

        if (!res.ok || !res.body) {
          let errBody: { error?: string } = {};
          try {
            errBody = (await res.json()) as { error?: string };
          } catch {
            // ignore
          }
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const applyEvent = (ev: StreamEvent) => {
          setTurns((prev) => {
            const next = [...prev];
            const idx = next.length - 1;
            const cur = next[idx];
            if (!cur || cur.role !== "assistant") return prev;
            const updated: ChatTurn = { ...cur };
            if (ev.type === "status") updated.status = ev.message;
            else if (ev.type === "sql") updated.sql = ev.sql;
            else if (ev.type === "validation")
              updated.validation = { ok: ev.ok, errors: ev.errors };
            else if (ev.type === "rows")
              updated.table = {
                columns: ev.columns,
                rows: ev.rows,
                row_count: ev.row_count,
              };
            else if (ev.type === "narrative") updated.content = ev.content;
            else if (ev.type === "chart") updated.chart = ev.spec;
            else if (ev.type === "meta") updated.meta = ev.meta;
            else if (ev.type === "error") updated.errored = ev.message;
            next[idx] = updated;
            return next;
          });
          if (ev.type === "error") throw new Error(ev.message);
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
                applyEvent(JSON.parse(payload) as StreamEvent);
              } catch {
                // malformed event, skip
              }
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Request failed";
        setError(msg);
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && !last.content && !last.errored) {
            next[next.length - 1] = { ...last, errored: msg };
          }
          return next;
        });
      } finally {
        setBusy(false);
        setStreamingIdx(null);
        resetTurnstile();
      }
    },
    [busy, turns, getTurnstileToken, resetTurnstile, functionUrl],
  );

  const reset = useCallback(() => {
    setTurns([]);
    setError(null);
    setStreamingIdx(null);
  }, []);

  return { turns, busy, error, streamingIdx, ask, reset };
}
