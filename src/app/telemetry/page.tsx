// Private telemetry dashboard.
//
// Access is a `?k=` query parameter compared against TELEMETRY_KEY; anything
// else 404s, so the route never advertises that it exists. That's deliberately
// the smallest possible gate — no login form, no session, no middleware (note
// that Next 16 renamed `middleware` to `proxy`, and this repo has neither).
// The tradeoff is that the key sits in browser history on Greg's own machine,
// which is an acceptable price for a personal dashboard with no PII behind it.

import { timingSafeEqual } from "node:crypto";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ENGAGED_MS, loadRange, summarize } from "@/lib/telemetry/query";
import type { Summary } from "@/lib/telemetry/query";
import { TrendChart } from "./TrendChart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Telemetry",
  robots: { index: false, follow: false },
};

function keyMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function pct(n: number, of: number): string {
  return of === 0 ? "—" : `${Math.round((n / of) * 100)}%`;
}

const PROJECT_NAMES: Record<string, string> = {
  "two-minute-drill": "Two-Minute Drill",
  "chess-coach": "Chess Coach",
  "glass-box-rag": "Glass Box RAG",
  "nfl-prospect-comparables": "NFL Comparables",
  "religious-voices": "Religious Voices",
  "adventureworks-chat": "AdventureWorks Chat",
  "emba-roi-analysis": "EMBA ROI",
  "scale-or-sell": "Scale or Sell",
};

/** Prose title that states the finding, rather than describing the axes. */
function headline(s: Summary): string {
  const [arrived, opened, stayed, used] = s.funnel.map((f) => f.sessions);
  if (arrived === 0) return "No sessions recorded yet in this window.";
  const parts = [
    `${opened} of ${arrived} session${arrived === 1 ? "" : "s"} opened a project`,
    `${stayed} stayed past ${ENGAGED_MS / 1000} seconds`,
    `${used} actually used one`,
  ];
  return `${parts.join(", ")}.`;
}

export default async function TelemetryPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string; d?: string }>;
}) {
  const { k, d } = await searchParams;
  const expected = process.env.TELEMETRY_KEY;
  if (!expected || !k || !keyMatches(k, expected)) notFound();

  const days = Math.min(90, Math.max(1, Number(d) || 30));
  const summary = summarize(await loadRange(days), days);
  const maxFunnel = summary.funnel[0]?.sessions || 1;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 font-[family-name:var(--font-inter)]">
      <header className="border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
          Last {days} days · {summary.totalEvents.toLocaleString()} events
        </span>
        <h1 className="mt-3 font-[family-name:var(--font-source-serif)] text-3xl leading-snug tracking-tight text-neutral-900 dark:text-neutral-100">
          {headline(summary)}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400">
          {summary.visitors.toLocaleString()} distinct visitor
          {summary.visitors === 1 ? "" : "s"} across {summary.sessions.toLocaleString()} session
          {summary.sessions === 1 ? "" : "s"}. Visitors are counted by a daily-rotating salted
          hash — no cookie, no stored IP.
        </p>
        <nav className="mt-4 flex gap-4 font-mono text-[11px] uppercase tracking-[0.12em]">
          {[7, 30, 90].map((n) => (
            <a
              key={n}
              href={`/telemetry?k=${encodeURIComponent(k)}&d=${n}`}
              className={
                n === days
                  ? "text-[#1B4F7A] underline underline-offset-4 dark:text-[#7BA8CB]"
                  : "text-neutral-400 underline-offset-4 hover:underline"
              }
            >
              {n}d
            </a>
          ))}
        </nav>
      </header>

      {/* The funnel — the reason this dashboard exists. */}
      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-source-serif)] text-xl text-neutral-900 dark:text-neutral-100">
          Where people drop off
        </h2>
        <div className="mt-5 space-y-3">
          {summary.funnel.map((step, i) => {
            const prev = i === 0 ? null : summary.funnel[i - 1].sessions;
            return (
              <div key={step.label} className="flex items-center gap-4">
                <span className="w-40 shrink-0 text-[13px] text-neutral-700 dark:text-neutral-300">
                  {step.label}
                </span>
                <div className="relative h-7 flex-1 bg-neutral-100 dark:bg-neutral-900">
                  <div
                    className="flex h-full items-center bg-[#1B4F7A] px-2"
                    style={{
                      width:
                        step.sessions === 0
                          ? "0%"
                          : `${Math.max(6, (step.sessions / maxFunnel) * 100)}%`,
                    }}
                  >
                    {step.sessions > 0 && (
                      <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-medium text-white">
                        {step.sessions}
                      </span>
                    )}
                  </div>
                  {step.sessions === 0 && (
                    <span className="absolute inset-y-0 left-2 flex items-center font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-neutral-400">
                      0
                    </span>
                  )}
                </div>
                <span className="w-14 shrink-0 text-right font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-neutral-500">
                  {prev === null ? "" : pct(step.sessions, prev)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-[family-name:var(--font-source-serif)] text-xl text-neutral-900 dark:text-neutral-100">
          Daily traffic
        </h2>
        <p className="mt-1 text-[13px] text-neutral-500">
          Navy line: distinct visitors. Bars behind it: pageviews.
        </p>
        <div className="mt-4">
          <TrendChart data={summary.daily} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-[family-name:var(--font-source-serif)] text-xl text-neutral-900 dark:text-neutral-100">
          Projects, ranked by who actually stayed
        </h2>
        <p className="mt-1 text-[13px] text-neutral-500">
          Sorted by engaged sessions, not raw views — the point is to separate looked-at from read.
        </p>
        {summary.projects.length === 0 ? (
          <p className="mt-4 font-mono text-sm text-neutral-500">No project visits yet.</p>
        ) : (
          <table className="mt-5 w-full text-[13px]">
            <thead>
              <tr className="border-b border-neutral-200 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500 dark:border-neutral-800">
                <th className="pb-2 font-normal">Project</th>
                <th className="pb-2 text-right font-normal">Sessions</th>
                <th className="pb-2 text-right font-normal">Engaged</th>
                <th className="pb-2 text-right font-normal">Med. dwell</th>
                <th className="pb-2 pl-4 font-normal">Med. scroll</th>
                <th className="pb-2 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="font-[family-name:var(--font-jetbrains-mono)] text-[12px]">
              {summary.projects.map((p) => (
                <tr key={p.slug} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2 font-[family-name:var(--font-inter)] text-[13px] text-neutral-900 dark:text-neutral-100">
                    {PROJECT_NAMES[p.slug] ?? p.slug}
                  </td>
                  <td className="py-2 text-right text-neutral-600 dark:text-neutral-400">
                    {p.sessions}
                  </td>
                  <td className="py-2 text-right text-neutral-900 dark:text-neutral-100">
                    {p.engagedSessions}
                  </td>
                  <td className="py-2 text-right text-neutral-600 dark:text-neutral-400">
                    {p.medianDwellSec}s
                  </td>
                  <td className="py-2 pl-4">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 bg-neutral-100 dark:bg-neutral-900">
                        <span
                          className="block h-full bg-[#7BA8CB]"
                          style={{ width: `${p.medianScrollPct}%` }}
                        />
                      </span>
                      <span className="text-[11px] text-neutral-500">{p.medianScrollPct}%</span>
                    </span>
                  </td>
                  <td className="py-2 text-right text-neutral-900 dark:text-neutral-100">
                    {p.actions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-12 grid gap-10 sm:grid-cols-2">
        <section>
          <h2 className="font-[family-name:var(--font-source-serif)] text-xl text-neutral-900 dark:text-neutral-100">
            Signature actions
          </h2>
          {summary.actions.length === 0 ? (
            <p className="mt-3 font-mono text-sm text-neutral-500">None yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {summary.actions.map((a) => (
                <li key={a.label} className="flex justify-between gap-4 text-[13px]">
                  <span className="text-neutral-700 dark:text-neutral-300">{a.name}</span>
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px] text-neutral-900 dark:text-neutral-100">
                    {a.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-[family-name:var(--font-source-serif)] text-xl text-neutral-900 dark:text-neutral-100">
            Where they came from
          </h2>
          {summary.referrers.length === 0 ? (
            <p className="mt-3 font-mono text-sm text-neutral-500">
              All direct — no external referrers.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {summary.referrers.slice(0, 10).map((r) => (
                <li key={r.host} className="flex justify-between gap-4 text-[13px]">
                  <span className="text-neutral-700 dark:text-neutral-300">{r.host}</span>
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px] text-neutral-900 dark:text-neutral-100">
                    {r.sessions}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
