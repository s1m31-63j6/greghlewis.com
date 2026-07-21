"use client";

import { useState } from "react";

import { GLOSSARY, useLevel } from "./copy";

/**
 * A dedicated glossary, for readers who want the terms collected in one place
 * rather than discovering them inline via <Term> tooltips. Toggled from the top
 * bar; definitions track the current reading level.
 */
export function Glossary() {
  const [open, setOpen] = useState(false);
  const level = useLevel();
  const entries = Object.values(GLOSSARY);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-md border px-2 py-0.5 text-[11px] transition ${
          open
            ? "border-blue-700 bg-blue-700 text-white"
            : "border-slate-200 text-slate-500 hover:bg-slate-100"
        }`}
      >
        Glossary
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 max-h-[60vh] w-[min(20rem,80vw)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">
              The terms on this page
            </p>
            <dl className="space-y-2.5">
              {entries.map((e) => (
                <div key={e.term}>
                  <dt className="text-[12px] font-medium text-slate-900">{e.term}</dt>
                  <dd className="mt-0.5 text-[11px] leading-snug text-slate-600">{e[level]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
