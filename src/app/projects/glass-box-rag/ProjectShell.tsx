"use client";

import { useState } from "react";

import { CitationsTab } from "./CitationsTab";
import { EmbeddingTab } from "./EmbeddingTab";
import { EvaluationTab } from "./EvaluationTab";
import { PipelineTab } from "./PipelineTab";
import { useGlassBoxRag } from "./useGlassBoxRag";

const STARTERS = [
  "Does market dilution from competing AI-generated works defeat fair use?",
  "Is training a large language model on copyrighted books fair use?",
  "Are Westlaw headnotes protectable original expression?",
  "As of the 2015 Authors Guild decision, what was the controlling test for transformative use?",
];

const TABS = ["Pipeline", "Citations", "Embedding map", "Evaluation"] as const;
type Tab = (typeof TABS)[number];

export function ProjectShell({ functionUrl }: { functionUrl?: string }) {
  const [tab, setTab] = useState<Tab>("Pipeline");
  const [value, setValue] = useState("");
  const { trace, busy, ask } = useGlassBoxRag(functionUrl);

  const submit = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setValue("");
    void ask(text);
  };

  if (!functionUrl) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-900">
        The retrieval service isn&apos;t configured. Set{" "}
        <code>NEXT_PUBLIC_GLASS_BOX_RAG_FUNCTION_URL</code> and redeploy.
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* left — the conversation */}
      <div className="flex flex-col gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          className="flex gap-2"
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask about AI, copyright, and fair use…"
            className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 text-[14px] outline-none focus:border-stone-500"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="rounded-md bg-stone-900 px-4 py-2 text-[14px] text-white hover:bg-stone-700 disabled:opacity-40"
          >
            {busy ? "Working…" : "Ask"}
          </button>
        </form>

        {!trace && (
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="rounded-full border border-stone-200 px-2.5 py-1 text-left text-[11px] text-stone-600 hover:bg-stone-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[280px] rounded-xl border border-stone-200 bg-stone-50/50 p-4">
          {!trace && (
            <p className="text-[13px] text-stone-500">
              Answers are grounded only in 28 published opinions on AI and copyright fair use.
              Where the courts disagree — and on the central questions they do — the answer says
              so rather than picking a side.
            </p>
          )}

          {trace?.error && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-[12px] text-red-800">
              {trace.error}
            </p>
          )}

          {trace && (
            <>
              <p className="text-[13px] font-medium text-stone-900">{trace.question}</p>
              {trace.answer ? (
                <div className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-stone-700">
                  {trace.answer}
                </div>
              ) : (
                <p className="mt-3 text-[12px] italic text-stone-400">
                  {busy ? "Retrieving and reasoning — watch the pipeline →" : ""}
                </p>
              )}

              {trace.citations.length > 0 && (
                <div className="mt-4 border-t border-stone-200 pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">
                    Opinions relied on
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {trace.citations.map((c) => (
                      <li key={c.case_id} className="text-[11px] text-stone-600">
                        {c.case_name}
                        {c.citation && <span className="text-stone-400"> · {c.citation}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* right — the instrument panel */}
      <div className="rounded-xl border border-stone-200 bg-white">
        <div className="flex gap-1 border-b border-stone-200 p-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2.5 py-1 text-[11px] ${
                t === tab
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {tab === "Pipeline" && <PipelineTab trace={trace} />}
          {tab === "Citations" && <CitationsTab trace={trace} />}
          {tab === "Embedding map" && <EmbeddingTab trace={trace} />}
          {tab === "Evaluation" && <EvaluationTab />}
        </div>
      </div>
    </div>
  );
}
