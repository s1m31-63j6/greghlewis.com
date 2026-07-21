"use client";

import { useState } from "react";

import { CitationsTab } from "./CitationsTab";
import { COPY, useLevel } from "./copy";
import { EmbeddingTab } from "./EmbeddingTab";
import { EvaluationTab } from "./EvaluationTab";
import { Markdown } from "./Markdown";
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
  const level = useLevel();
  const { trace, busy, ask } = useGlassBoxRag(functionUrl);

  const submit = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setValue("");
    void ask(text);
  };

  if (!functionUrl) {
    return (
      <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4 text-[13px] text-yellow-800">
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
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="rounded-lg bg-blue-700 px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-40"
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
                className="rounded-full border border-slate-200 px-2.5 py-1 text-left text-[11px] text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[280px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!trace && <p className="text-[13px] text-slate-500">{COPY.chatEmpty[level]}</p>}

          {trace?.error && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-[12px] text-red-800">
              {trace.error}
            </p>
          )}

          {trace && (
            <>
              <p className="text-[13px] font-medium text-slate-900">{trace.question}</p>
              {trace.answer ? (
                <div className="mt-3">
                  <Markdown>{trace.answer}</Markdown>
                </div>
              ) : (
                <p className="mt-3 text-[12px] italic text-slate-400">
                  {busy ? COPY.chatWorking[level] : ""}
                </p>
              )}

              {trace.citations.length > 0 && (
                <div className="mt-4 border-t border-slate-200 pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    Opinions relied on
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {trace.citations.map((c) => (
                      <li key={c.case_id} className="text-[11px] text-slate-600">
                        {c.case_name}
                        {c.citation && <span className="text-slate-400"> · {c.citation}</span>}
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
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 border-b border-slate-200 bg-slate-50/60 p-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-2.5 py-1 text-[11px] transition ${
                t === tab
                  ? "bg-blue-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-blue-700"
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
