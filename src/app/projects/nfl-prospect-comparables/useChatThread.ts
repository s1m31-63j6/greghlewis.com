"use client";

import { useCallback, useState } from "react";

export type AnswerLength = "short" | "long";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Sources + mentioned players — only present on assistant messages.
  sources?: string[];
  mentionedPlayerIds?: string[];
}

// Server-Sent Event payloads emitted by /api/nfl-comparables/chat. The
// route writes one event per `data: ...` line; we parse them and update
// the assistant message progressively as text deltas arrive.
type StreamEvent =
  | { type: "meta"; sources: string[]; subjectPlayerIds: string[] }
  | { type: "text"; content: string }
  | { type: "done"; mentionedPlayerIds: string[] }
  | { type: "error"; message: string };

interface Options {
  playerId?: string;
  playerName?: string;
  // Called with the players the latest answer mentioned. The graph uses
  // this to fly camera + glow nodes. Empty array on reset.
  onFocus?: (playerIds: string[]) => void;
}

export function useChatThread({ playerId, playerName, onFocus }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Carry-over subject for pronoun fallback ("how does HE compare to…").
  const [contextPlayerIds, setContextPlayerIds] = useState<string[]>([]);

  const ask = useCallback(
    async (query: string, length: AnswerLength = "short") => {
      const trimmed = query.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      // Optimistic user-message append so the thread updates instantly.
      const userMsg: ChatMessage = { role: "user", content: trimmed };
      // Append BOTH the user message and an empty assistant placeholder
      // in the same setState — the placeholder receives streamed deltas.
      setMessages((prev) => [
        ...prev,
        userMsg,
        { role: "assistant", content: "" },
      ]);

      try {
        const res = await fetch("/api/nfl-comparables/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            playerId,
            playerName,
            // History so far (excluding the optimistic placeholder). Server
            // sees the full conversation when synthesizing.
            history: messages.map((m) => ({ role: m.role, content: m.content })),
            contextPlayerIds,
            length,
          }),
        });
        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }

        // Stream the SSE response. Each chunk may contain partial events;
        // buffer until we see `\n\n` event terminators.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assembled = "";
        let metaSubjects: string[] | null = null;
        let metaSources: string[] | null = null;
        let mentionedPlayerIds: string[] = [];

        const handleEvent = (ev: StreamEvent) => {
          if (ev.type === "text") {
            assembled += ev.content;
            // Update the placeholder assistant message in place. Identity
            // stable across updates so React reconciles with one DOM node.
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: assembled };
              }
              return next;
            });
          } else if (ev.type === "meta") {
            metaSubjects = ev.subjectPlayerIds;
            metaSources = ev.sources;
            // Drive viz zoom as soon as subjects are known — no need to
            // wait for the full answer to start animating the graph.
            if (onFocus) onFocus(ev.subjectPlayerIds);
            if (ev.subjectPlayerIds.length > 0) {
              setContextPlayerIds(ev.subjectPlayerIds);
            }
          } else if (ev.type === "done") {
            mentionedPlayerIds = ev.mentionedPlayerIds;
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE event terminator is a blank line. Process every complete
          // event in the buffer; keep the trailing partial for next read.
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
                // Skip malformed events rather than killing the stream;
                // the server is the source of truth and a single dropped
                // event is preferable to a hung UI.
              }
            }
          }
        }

        // Once the stream closes, attach final metadata to the assistant
        // message so the SidePanel can read sources / mentions from it.
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              sources: metaSources ?? [],
              mentionedPlayerIds,
            };
          }
          return next;
        });
        // Re-fire onFocus with the final mention set in case the answer
        // surfaced players the meta event didn't yet know about — keeps
        // the viz behavior consistent with the pre-streaming version.
        if (onFocus && metaSubjects) onFocus(metaSubjects);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
        // Drop the empty assistant placeholder on error so the UI doesn't
        // leave a phantom turn dangling under the user message.
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.content === "") {
            next.pop();
          }
          return next;
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, playerId, playerName, contextPlayerIds, onFocus],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setContextPlayerIds([]);
    if (onFocus) onFocus([]);
  }, [onFocus]);

  return { messages, busy, error, ask, reset };
}
