// Wire format for the telemetry beacon. Keys are deliberately terse — every
// byte rides in a sendBeacon body on every page, and these types are shared
// verbatim between the client collector and the ingest route.

export type EventType = "pageview" | "engagement" | "click" | "change";

/** One event as sent by the browser. */
export interface RawEvent {
  /** Event type. */
  t: EventType;
  /** Pathname the event happened on. */
  p: string;
  /** `data-tel` label, for click/change events. */
  l?: string;
  /** `data-tel-project` slug, when the element names a project. */
  pr?: string;
  /** Visible dwell time in ms — engagement events only. */
  d?: number;
  /** Max scroll depth 0-100 — engagement events only. */
  s?: number;
  /** Client-side timestamp (epoch ms). */
  ts: number;
}

/** A batch of events flushed together. */
export interface EventBatch {
  /** Session id, sessionStorage-scoped. Not a cookie. */
  sid: string;
  /** Referrer host only — never the full URL. */
  ref?: string;
  /** Viewport width bucket. */
  vw?: number;
  events: RawEvent[];
}

/** A stored row, after server-side enrichment. */
export interface StoredEvent {
  pk: string;
  sk: string;
  type: EventType;
  path: string;
  sid: string;
  vid: string;
  ts: number;
  exp: number;
  label?: string;
  proj?: string;
  ref?: string;
  vw?: number;
  dwellMs?: number;
  scrollPct?: number;
  country?: string;
}

export const MAX_EVENTS_PER_BATCH = 30;
export const MAX_BODY_BYTES = 16_384;
/** Rows expire after ~13 months, enough for year-over-year comparison. */
export const RETENTION_DAYS = 400;
