"use client";

/**
 * The signup band, mounted once in the root layout and shown above the footer.
 *
 * One mount rather than a copy on each of nine pages: the pathname already
 * says which page you are on, so the component can pick its own copy and its
 * own stored source from it. Adding a project later means adding an entry to
 * the copy table, and nothing else.
 *
 * It renders in the site's neutral chrome rather than each project's palette.
 * The dark app pages (playbook, the drill, chess) scope their own colours to
 * their own roots, so this sits in the same band the footer already occupies
 * and reads as site furniture on every page — which is what it is.
 *
 * The note field is collapsed until the address is filled in. A single input
 * with a button is a thing people fill in without thinking; a form with a
 * textarea is a task they put off. The prompt appears once they have already
 * started.
 */

import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { copyForPath } from "@/lib/subscribe/copy";

type State = "idle" | "sending" | "done" | "error";

export default function KeepMeUpdated() {
  const pathname = usePathname();
  const copy = copyForPath(pathname ?? "");

  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const noteId = useId();

  if (!copy) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!copy) return;
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
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-12"
      aria-labelledby={`${emailId}-heading`}
    >
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-6 py-7 dark:border-neutral-800 dark:bg-neutral-900/40">
        {state === "done" ? (
          <div className="max-w-xl">
            <h2
              id={`${emailId}-heading`}
              className="font-[family-name:var(--font-source-serif)] text-lg text-neutral-900 dark:text-neutral-100"
            >
              You are on the list.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Thanks. You will hear from this list when there is something worth
              sending, and never for any other reason. One click gets you off it.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="max-w-xl">
              <h2
                id={`${emailId}-heading`}
                className="font-[family-name:var(--font-source-serif)] text-lg text-neutral-900 dark:text-neutral-100"
              >
                {copy.headline}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {copy.blurb}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:max-w-xl">
              <label htmlFor={emailId} className="sr-only">
                Email address
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={emailId}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-500"
                />
                <button
                  type="submit"
                  disabled={state === "sending"}
                  data-tel={`subscribe-submit-${copy.id}`}
                  className="shrink-0 rounded-md bg-neutral-900 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-85 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                >
                  {state === "sending" ? "Sending…" : copy.cta}
                </button>
              </div>

              {/* Revealed once there is an address to attach it to. */}
              {email.length > 0 && (
                <div>
                  <label
                    htmlFor={noteId}
                    className="block text-xs text-neutral-500 dark:text-neutral-500"
                  >
                    {copy.notePrompt} <span className="opacity-70">(optional)</span>
                  </label>
                  <textarea
                    id={noteId}
                    rows={2}
                    maxLength={800}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1.5 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500"
                  />
                </div>
              )}

              {/* Honeypot. Hidden from people and from screen readers; bots
                  fill it in and get a cheerful 200 that stores nothing. */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor={`${emailId}-company`}>Company</label>
                <input
                  id={`${emailId}-company`}
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>

              {error && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <p className="text-xs text-neutral-500 dark:text-neutral-600">
                Your address is stored so I can email you, and for nothing else.
                No sharing, no selling, unsubscribe whenever.
              </p>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
