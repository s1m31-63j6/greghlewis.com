"use client";

/**
 * The playbook itself: sections, ordering, call numbers, and the print and
 * share affordances.
 *
 * The call number is the field that makes the printed call sheet and the
 * printed wristband agree, because both derive from it. Getting those two out
 * of sync is the single most expensive mistake a playbook tool can make on a
 * Friday night.
 */

import { useMemo, useState } from "react";

import { PRODUCT } from "./product";
import type { usePlaybook } from "./usePlaybook";

interface Props {
  book: ReturnType<typeof usePlaybook>;
  onClose: () => void;
  onOpenPlay: (id: string) => void;
}

const SECTIONS = [
  "Openers", "Base run", "Play action", "3rd & short", "3rd & long",
  "Red zone", "Goal line", "Two-minute", "Defense",
];

export default function BookPanel({ book, onClose, onOpenPlay }: Props) {
  const [copied, setCopied] = useState(false);
  const b = book.book;

  const grouped = useMemo(() => {
    if (!b) return [];
    const map = new Map<string, typeof b.entries>();
    for (const e of b.entries) {
      const k = e.section ?? "Unsectioned";
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [b]);

  if (!b) return null;

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/projects/playbook/share/${b.id}` : "";
  const pages = Math.ceil(b.entries.length / 12);

  return (
    <div className="pb-drawer" role="dialog" aria-label="Playbook">
      <header className="pb-drawer-head">
        <div>
          <input
            className="pb-input pb-title-input"
            value={b.name}
            disabled={book.readOnly}
            onChange={(e) => book.update({ name: e.target.value })}
            aria-label="Playbook name"
          />
          <p className="pb-label">
            {b.entries.length} plays · {pages} {pages === 1 ? "page" : "pages"} at 12-up ·{" "}
            {b.variant} {book.readOnly && "· read only"}
          </p>
        </div>
        <button className="pb-icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <div className="pb-drawer-actions">
        <a className="pb-btn" href={`/projects/playbook/print/${b.id}?layout=grid12`} target="_blank" rel="noreferrer" data-tel="pb-print-book" data-tel-project="playbook">
          Print playbook
        </a>
        <a className="pb-btn" href={`/projects/playbook/print/${b.id}?layout=callsheet`} target="_blank" rel="noreferrer" data-tel="pb-print-callsheet" data-tel-project="playbook">
          Call sheet
        </a>
        <a className="pb-btn" href={`/projects/playbook/print/${b.id}?layout=wristband`} target="_blank" rel="noreferrer" data-tel="pb-print-wristband" data-tel-project="playbook">
          Wristbands
        </a>
        <button
          className="pb-btn"
          onClick={async () => {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          data-tel="pb-share"
          data-tel-project="playbook"
        >
          {copied ? "Link copied" : "Copy share link"}
        </button>
      </div>

      {b.entries.length === 0 ? (
        <p className="pb-prose pb-empty">
          Empty so far. Add plays from the library and they will appear here in call order.
        </p>
      ) : (
        <ol className="pb-book-list">
          {grouped.map(([section, entries]) => (
            <li key={section} className="pb-book-section">
              <h4 className="pb-label">{section}</h4>
              <ul>
                {entries.map((e) => {
                  const i = b.entries.indexOf(e);
                  return (
                    <li key={e.play.spec.id} className="pb-book-row">
                      <input
                        className="pb-input pb-num pb-call-number"
                        value={e.callNumber ?? ""}
                        disabled={book.readOnly}
                        aria-label={`Call number for ${e.play.spec.name}`}
                        onChange={(ev) => book.setEntry(e.play.spec.id, { callNumber: ev.target.value })}
                      />
                      <button className="pb-linkish" onClick={() => onOpenPlay(e.play.spec.id)}>
                        {e.play.spec.name}
                      </button>
                      <select
                        className="pb-input pb-section-select"
                        value={e.section ?? ""}
                        disabled={book.readOnly}
                        aria-label={`Section for ${e.play.spec.name}`}
                        onChange={(ev) => book.setEntry(e.play.spec.id, { section: ev.target.value || undefined })}
                      >
                        <option value="">Unsectioned</option>
                        {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <span className="pb-book-move">
                        <button className="pb-icon-btn" disabled={book.readOnly || i === 0} onClick={() => book.reorder(e.play.spec.id, i - 1)} aria-label="Move up">↑</button>
                        <button className="pb-icon-btn" disabled={book.readOnly || i === b.entries.length - 1} onClick={() => book.reorder(e.play.spec.id, i + 1)} aria-label="Move down">↓</button>
                        <button className="pb-icon-btn pb-btn--danger" disabled={book.readOnly} onClick={() => book.removeEntry(e.play.spec.id)} aria-label="Remove">✕</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <p className="pb-label pb-drawer-foot">{PRODUCT.name} · anyone with the link can view this book</p>
    </div>
  );
}
