// Site telemetry collector.
//
// `instrumentation-client.ts` is a Next 15.3+ file convention: it runs after
// the document loads but BEFORE React hydration, entirely outside the React
// tree. See node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation-client.md.
//
// That placement is the whole point. The alternative — a "use client"
// component in the root layout watching usePathname() — would push a client
// boundary into src/app/layout.tsx, which is currently a pure server
// component, and would re-render on every navigation. This does neither.
//
// Clicks are captured by ONE delegated listener reading `data-tel`
// attributes, so instrumenting a new element is adding an HTML attribute
// rather than threading a callback through props.
//
// Everything is fire-and-forget via sendBeacon: the browser owns the request,
// it survives unload, and it can never block navigation or interaction.

import type { EventBatch, RawEvent } from "@/lib/telemetry/types";
import { MAX_EVENTS_PER_BATCH } from "@/lib/telemetry/types";

declare global {
  interface Window {
    __tel?: (label: string, project?: string) => void;
  }
}

const ENDPOINT = "/api/events";
const OPT_OUT_KEY = "tel:optout";
const SESSION_KEY = "tel:sid";
const FLUSH_INTERVAL_MS = 10_000;

let queue: RawEvent[] = [];
let sessionId = "";
let enabled = false;

// Labels already fired this session. Dragging a range slider emits a change
// event per step; we only care that the visitor touched the control at all.
const firedOnce = new Set<string>();

// --- engagement tracking -------------------------------------------------
// Dwell counts only time the tab is actually visible, so a page left open in
// a background tab overnight does not read as deep engagement.

let currentPath = "";
let visibleSince = 0;
let dwellMs = 0;
let maxScrollPct = 0;

function now(): number {
  return Date.now();
}

function optedOut(): boolean {
  try {
    if (new URLSearchParams(location.search).has("notrack")) {
      localStorage.setItem(OPT_OUT_KEY, "1");
    }
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // Private browsing with storage disabled — fall back to a per-load id.
    return crypto.randomUUID();
  }
}

function referrerHost(): string | undefined {
  // Host only. The full referrer URL can carry search terms and other
  // incidental detail we have no reason to keep.
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).host;
    return host === location.host ? undefined : host;
  } catch {
    return undefined;
  }
}

function flush(): void {
  if (queue.length === 0) return;
  const batch: EventBatch = {
    sid: sessionId,
    ref: referrerHost(),
    vw: window.innerWidth,
    events: queue.slice(0, MAX_EVENTS_PER_BATCH),
  };
  queue = queue.slice(MAX_EVENTS_PER_BATCH);
  try {
    const body = new Blob([JSON.stringify(batch)], { type: "application/json" });
    navigator.sendBeacon(ENDPOINT, body);
  } catch {
    // Never let telemetry surface an error into the page.
  }
}

function push(event: RawEvent): void {
  if (!enabled) return;
  // The dashboard must not appear in its own numbers.
  if (event.p.startsWith("/telemetry")) return;
  queue.push(event);
  if (queue.length >= MAX_EVENTS_PER_BATCH) flush();
}

function scrollPct(): number {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - window.innerHeight;
  // Full-screen project pages don't scroll at all; treat them as fully seen
  // rather than as 0% engagement.
  if (scrollable <= 0) return 100;
  return Math.min(100, Math.round(((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100));
}

function startPage(path: string): void {
  currentPath = path;
  visibleSince = document.visibilityState === "visible" ? now() : 0;
  dwellMs = 0;
  maxScrollPct = scrollPct();
  push({ t: "pageview", p: path, ts: now() });
}

/** Emit the engagement summary for the page we are leaving. */
function endPage(): void {
  if (!currentPath) return;
  if (visibleSince) {
    dwellMs += now() - visibleSince;
    visibleSince = 0;
  }
  push({
    t: "engagement",
    p: currentPath,
    d: dwellMs,
    s: maxScrollPct,
    ts: now(),
  });
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    if (visibleSince) {
      dwellMs += now() - visibleSince;
      visibleSince = 0;
    }
    // The tab may never come back — settle up now while we still can.
    endPage();
    flush();
    // Re-arm so a returning visitor is still measured.
    visibleSince = now();
    dwellMs = 0;
  } else {
    visibleSince = now();
  }
}

function labelled(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-tel]");
}

function record(el: HTMLElement, type: "click" | "change"): void {
  const label = el.dataset.tel;
  if (!label) return;
  const project = el.dataset.telProject;
  const key = `${label}:${project ?? ""}`;
  // One event per label per session: we want "did they engage", not a
  // keystroke log.
  if (firedOnce.has(key)) return;
  firedOnce.add(key);
  push({ t: type, p: location.pathname, l: label, pr: project, ts: now() });
}

function init(): void {
  if (optedOut()) return;
  enabled = true;
  sessionId = getSessionId();

  startPage(location.pathname);

  document.addEventListener(
    "click",
    (e) => {
      const el = labelled(e.target);
      if (el) record(el, "click");
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "change",
    (e) => {
      const el = labelled(e.target);
      if (el) record(el, "change");
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    "scroll",
    () => {
      const pct = scrollPct();
      if (pct > maxScrollPct) maxScrollPct = pct;
    },
    { passive: true },
  );

  // Escape hatch for interactions no HTML attribute can reach (canvas and
  // WebGL surfaces, for one). See src/lib/telemetry/track.ts.
  window.__tel = (label: string, project?: string) => {
    const el = document.createElement("span");
    el.dataset.tel = label;
    if (project) el.dataset.telProject = project;
    record(el, "click");
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", () => {
    endPage();
    flush();
  });

  setInterval(flush, FLUSH_INTERVAL_MS);
}

try {
  init();
} catch {
  // A broken collector must never break the site.
}

/**
 * Next calls this when a client-side navigation begins. Close out the page
 * being left, then open the new one.
 */
export function onRouterTransitionStart(url: string): void {
  if (!enabled) return;
  try {
    endPage();
    const path = new URL(url, location.origin).pathname;
    startPage(path);
    flush();
  } catch {
    // ignore
  }
}
