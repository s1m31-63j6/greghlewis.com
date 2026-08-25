"use client";

/**
 * The signup form itself.
 *
 * Split from the page so the page can stay a server component: the copy and
 * the source are resolved on the server from `?from=`, and only the three
 * fields and their states need to run in the browser.
 *
 * Both fields are shown at once here, unlike the old inline band that hid the
 * note until an address was typed. Somebody who followed a button to a page
 * whose whole purpose is this form has already decided to fill it in, and
 * hiding half of it would only make them wonder what else is missing.
 */

import { useState } from "react";

import type { SignupCopy } from "@/lib/subscribe/copy";

type State = "idle" | "sending" | "done" | "error";

export default function UpdatesForm({ copy }: { copy: SignupCopy }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 px-6 py-7 dark:border-neutral-800 dark:bg-neutral-900/40">
        <h2 className="font-[family-name:var(--font-source-serif)] text-lg text-neutral-900 dark:text-neutral-100">
          You are on the list.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Thanks. You will hear from this list when there is something worth
          sending, and never for any other reason. One click gets you off it.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, note, company, source: copy.id }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Something went wrong. Try again in a moment.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("Could not reach the server. Try again in a moment.");
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-xl">
      <label
        htmlFor="signup-email"
        className="block font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500"
      >
        Email
      </label>
      <input
        id="signup-email"
        type="email"
        required
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-500"
      />

      <label
        htmlFor="signup-note"
        className="mt-5 block font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500"
      >
        {copy.notePrompt} <span className="opacity-70">(optional)</span>
      </label>
      <textarea
        id="signup-note"
        rows={4}
        maxLength={800}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-1.5 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-relaxed text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
      />

      {/* Honeypot. Hidden from people and from screen readers; bots fill it in
          and get a cheerful 200 that stores nothing. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="signup-company">Company</label>
        <input
          id="signup-company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        data-tel={`subscribe-submit-${copy.id}`}
        className="mt-6 rounded-md bg-neutral-900 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-85 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {state === "sending" ? "Sending…" : copy.cta}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-600">
        Your address is stored so I can email you, and for nothing else. No
        sharing, no selling, unsubscribe whenever.
      </p>
    </form>
  );
}
