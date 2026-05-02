"use client";

import { useCallback, useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Sources + mentioned players — only present on assistant messages.
  sources?: string[];
  mentionedPlayerIds?: string[];
}

interface ChatResponse {
  answer: string;
  sources: string[];
  // Players the retrieval was anchored on this turn — the SUBJECT(s).
  // Drives viz zoom; analyst comps mentioned in passing don't.
  subjectPlayerIds: string[];
  mentionedPlayerIds: string[];
}

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
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      // Optimistic user-message append so the thread updates instantly.
      const userMsg: ChatMessage = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      try {
        const res = await fetch("/api/nfl-comparables/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            playerId,
            playerName,
            // History so far (excluding the message we just appended). Server
            // sees the full conversation when synthesizing.
            history: messages.map((m) => ({ role: m.role, content: m.content })),
            contextPlayerIds,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ChatResponse;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            mentionedPlayerIds: data.mentionedPlayerIds,
          },
        ]);
        // Sticky subject for the next turn's pronoun fallback.
        if (data.subjectPlayerIds.length > 0) {
          setContextPlayerIds(data.subjectPlayerIds);
        }
        // Viz zoom anchors on the SUBJECT, not the broader mention set.
        if (onFocus) onFocus(data.subjectPlayerIds);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
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
