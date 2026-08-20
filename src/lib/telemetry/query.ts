// Read + aggregate telemetry for the dashboard.
//
// The organising question is not "how many views" — it's a funnel:
// someone arrived, did they open a project, did they stay, did they actually
// touch the thing. Every aggregate below is session-scoped so the funnel
// stays monotonic and readable.

import { queryDay } from "./store";
import type { StoredEvent } from "./types";

/** Dwell above which we call a project visit a real read rather than a bounce. */
export const ENGAGED_MS = 30_000;

/** The one action per project that means "this visitor used it". */
export const SIGNATURE_LABELS: Record<string, string> = {
  "drill-decision": "Two-Minute Drill — play called",
  "chess-start": "Chess Coach — game started",
  "rag-query": "Glass Box RAG — question asked",
  "nfl-chat": "NFL Comparables — question asked",
  "voices-chat": "Religious Voices — question asked",
  "aw-query": "AdventureWorks — query run",
  "emba-adjust": "EMBA ROI — assumption changed",
  "exit-adjust": "Scale or Sell — assumption changed",
};

export interface FunnelStep {
  label: string;
  sessions: number;
}

export interface ProjectRow {
  slug: string;
  sessions: number;
  engagedSessions: number;
  medianDwellSec: number;
  medianScrollPct: number;
  actions: number;
}

export interface DailyRow {
  day: string;
  visitors: number;
  pageviews: number;
}

export interface Summary {
  days: number;
  totalEvents: number;
  visitors: number;
  sessions: number;
  funnel: FunnelStep[];
  daily: DailyRow[];
  projects: ProjectRow[];
  referrers: { host: string; sessions: number }[];
  actions: { label: string; name: string; count: number }[];
}

export function lastNDays(n: number, today = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function loadRange(days: number): Promise<StoredEvent[]> {
  const results = await Promise.all(lastNDays(days).map(queryDay));
  return results.flat();
}

/** `/projects/glass-box-rag/methodology` -> `glass-box-rag`. */
export function projectSlug(path: string): string | null {
  const m = /^\/projects\/([^/]+)/.exec(path);
  return m ? m[1] : null;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function countDistinct<T>(m: Map<T, unknown>): number {
  return m.size;
}

export function summarize(events: StoredEvent[], days: number): Summary {
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const sessionsWithProject = new Set<string>();
  const sessionsEngaged = new Set<string>();
  const sessionsWithAction = new Set<string>();

  const byDay = new Map<string, { visitors: Set<string>; pageviews: number }>();
  const byProject = new Map<
    string,
    { sessions: Set<string>; engaged: Set<string>; dwells: number[]; scrolls: number[]; actions: number }
  >();
  const byReferrer = new Map<string, Set<string>>();
  const byAction = new Map<string, number>();

  for (const e of events) {
    visitors.add(e.vid);
    sessions.add(e.sid);

    const day = new Date(e.ts).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { visitors: new Set(), pageviews: 0 });
    const d = byDay.get(day)!;
    d.visitors.add(e.vid);
    if (e.type === "pageview") d.pageviews += 1;

    if (e.ref) {
      if (!byReferrer.has(e.ref)) byReferrer.set(e.ref, new Set());
      byReferrer.get(e.ref)!.add(e.sid);
    }

    // A project counts as opened on the pageview, not the card click — that
    // way inbound links straight to a project page still register.
    const slug = projectSlug(e.path);
    if (slug) {
      if (!byProject.has(slug)) {
        byProject.set(slug, {
          sessions: new Set(),
          engaged: new Set(),
          dwells: [],
          scrolls: [],
          actions: 0,
        });
      }
      const p = byProject.get(slug)!;
      p.sessions.add(e.sid);
      sessionsWithProject.add(e.sid);

      if (e.type === "engagement") {
        p.dwells.push(e.dwellMs ?? 0);
        p.scrolls.push(e.scrollPct ?? 0);
        if ((e.dwellMs ?? 0) >= ENGAGED_MS) {
          p.engaged.add(e.sid);
          sessionsEngaged.add(e.sid);
        }
      }
      if (e.label && e.label in SIGNATURE_LABELS) {
        p.actions += 1;
      }
    }

    if (e.label && e.label in SIGNATURE_LABELS) {
      byAction.set(e.label, (byAction.get(e.label) ?? 0) + 1);
      sessionsWithAction.add(e.sid);
    }
  }

  const funnel: FunnelStep[] = [
    { label: "Arrived", sessions: sessions.size },
    { label: "Opened a project", sessions: sessionsWithProject.size },
    { label: `Stayed past ${ENGAGED_MS / 1000}s`, sessions: sessionsEngaged.size },
    { label: "Used it", sessions: sessionsWithAction.size },
  ];

  const daily: DailyRow[] = lastNDays(days).map((day) => ({
    day,
    visitors: byDay.get(day)?.visitors.size ?? 0,
    pageviews: byDay.get(day)?.pageviews ?? 0,
  }));

  const projects: ProjectRow[] = [...byProject.entries()]
    .map(([slug, p]) => ({
      slug,
      sessions: p.sessions.size,
      engagedSessions: p.engaged.size,
      medianDwellSec: Math.round(median(p.dwells) / 1000),
      medianScrollPct: median(p.scrolls),
      actions: p.actions,
    }))
    // Ranked by engaged sessions, deliberately not by raw views — the whole
    // point is to separate "looked at" from "read". Ties break on actual
    // usage before raw traffic, for the same reason: a project one person
    // read and used beats one two people bounced off.
    .sort(
      (a, b) =>
        b.engagedSessions - a.engagedSessions ||
        b.actions - a.actions ||
        b.sessions - a.sessions,
    );

  const referrers = [...byReferrer.entries()]
    .map(([host, s]) => ({ host, sessions: s.size }))
    .sort((a, b) => b.sessions - a.sessions);

  const actions = [...byAction.entries()]
    .map(([label, count]) => ({ label, name: SIGNATURE_LABELS[label] ?? label, count }))
    .sort((a, b) => b.count - a.count);

  return {
    days,
    totalEvents: events.length,
    visitors: countDistinct(new Map([...visitors].map((v) => [v, 1]))),
    sessions: sessions.size,
    funnel,
    daily,
    projects,
    referrers,
    actions,
  };
}
