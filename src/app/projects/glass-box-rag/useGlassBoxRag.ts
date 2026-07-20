"use client";

import { useCallback, useRef, useState } from "react";

import type { RankedDoc, StageName, StreamEvent } from "@/lib/glass-box-rag/types";

/** One stage of one hop, as the UI needs it. */
export interface StageRun {
  key: string; // `${hop}:${stage}`
  stage: StageName;
  hop: number;
  label: string;
  ms?: number;
  docs?: RankedDoc[];
  detail?: Record<string, unknown>;
  running: boolean;
}

export interface Trace {
  question: string;
  stages: StageRun[];
  analysis?: { intent: string; as_of: number | null; factors: string[]; reasoning: string };
  transform?: { hyde: string; variants: string[] };
  assessments: {
    hop: number;
    sufficient: boolean;
    reasoning: string;
    follow: { case_id: string; case_name: string; why: string }[];
  }[];
  answer: string;
  citations: { case_id: string; case_name: string; citation: string | null }[];
  meta?: { total_ms: number; hops: number; input_tokens?: number; output_tokens?: number };
  error?: string;
}

const EMPTY = (question: string): Trace => ({
  question,
  stages: [],
  assessments: [],
  answer: "",
  citations: [],
});

export function useGlassBoxRag(functionUrl: string | undefined) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string) => {
      if (busy || !functionUrl) return;
      setBusy(true);
      setTrace(EMPTY(question));

      const controller = new AbortController();
      abortRef.current = controller;

      // Accumulate answer text in a closure — reading it back out of state on every
      // token would be quadratic and racy.
      let answer = "";

      try {
        const res = await fetch(`${functionUrl.replace(/\/$/, "")}/?q=${encodeURIComponent(question)}`, {
          method: "GET",
          headers: { accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

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
                const ev = JSON.parse(payload) as StreamEvent;
                if (ev.type === "text") answer += ev.content;
                setTrace((t) => (t ? applyEvent(t, ev, answer) : t));
              } catch {
                /* swallow a malformed frame rather than killing the stream */
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          const message = e instanceof Error ? e.message : "unknown error";
          setTrace((t) => (t ? { ...t, error: message } : t));
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, functionUrl],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { trace, busy, ask, cancel };
}

function applyEvent(t: Trace, ev: StreamEvent, answer: string): Trace {
  switch (ev.type) {
    case "stage_start": {
      const key = `${ev.hop}:${ev.stage}`;
      return {
        ...t,
        stages: [
          ...t.stages.filter((s) => s.key !== key),
          { key, stage: ev.stage, hop: ev.hop, label: ev.label, running: true },
        ],
      };
    }
    case "stage_end": {
      const key = `${ev.hop}:${ev.stage}`;
      return {
        ...t,
        stages: t.stages.map((s) =>
          s.key === key ? { ...s, ms: ev.ms, docs: ev.docs, detail: ev.detail, running: false } : s,
        ),
      };
    }
    case "analysis":
      return {
        ...t,
        analysis: {
          intent: ev.intent,
          as_of: ev.as_of,
          factors: ev.factors,
          reasoning: ev.reasoning,
        },
      };
    case "transform":
      return { ...t, transform: { hyde: ev.hyde, variants: ev.variants } };
    case "assessment":
      return {
        ...t,
        assessments: [
          ...t.assessments,
          { hop: ev.hop, sufficient: ev.sufficient, reasoning: ev.reasoning, follow: ev.follow },
        ],
      };
    case "text":
      return { ...t, answer };
    case "citations":
      return { ...t, citations: ev.cases };
    case "meta":
      return {
        ...t,
        meta: {
          total_ms: ev.total_ms,
          hops: ev.hops,
          input_tokens: ev.input_tokens,
          output_tokens: ev.output_tokens,
        },
      };
    case "error":
      return { ...t, error: ev.message };
    default:
      return t;
  }
}
