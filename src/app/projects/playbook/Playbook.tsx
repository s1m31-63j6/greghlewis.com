"use client";

/**
 * The app shell.
 *
 * One route with view state rather than six routes, deliberately: the editor
 * and the library share a loaded book and a loaded library, and remounting
 * those on every navigation would make the fastest interaction in the product
 * (browse, open, edit, back) the slowest.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import "./styles.css";

import BookPanel from "./BookPanel";
import Facets from "./Facets";
import NewBook from "./NewBook";
import PlayCard from "./PlayCard";
import PlayDetail from "./PlayDetail";
import PlayEditor from "./PlayEditor";
import { PRODUCT } from "./product";
import { useLibrary, useSearch } from "./useLibrary";
import { usePlaybook } from "./usePlaybook";
import { MVP_VARIANTS, variant as variantOf } from "@/lib/playbook/field";
import { blankPlay } from "@/lib/playbook/blank";
import type { FieldVariantId, Play, PlaySpec } from "@/lib/playbook/types";
import WantMore from "@/app/_subscribe/WantMore";

type View = { kind: "library" } | { kind: "play"; id: string } | { kind: "edit"; id: string };

export default function Playbook() {
  const lib = useLibrary();
  const book = usePlaybook();
  const [view, setView] = useState<View>({ kind: "library" });
  const [side, setSide] = useState<"offense" | "defense">("offense");
  const [variant, setVariant] = useState<FieldVariantId>("11man");
  const [dense, setDense] = useState(false);
  const [showBook, setShowBook] = useState(false);
  // A brand-new play exists only here until "Save as new" puts it in the book.
  const [draft, setDraft] = useState<Play | null>(null);

  const bookVariant = book.book?.variant ?? variant;
  const userPlays = useMemo(() => book.book?.entries.map((e) => e.play) ?? [], [book.book]);
  const search = useSearch(lib.index, userPlays, variant);

  const inBook = useMemo(
    () => new Set(userPlays.map((p) => p.lineage?.rootId ?? p.spec.id)),
    [userPlays],
  );

  const results = useMemo(
    () => search.results.filter((e) => e.f.side === side),
    [search.results, side],
  );

  /** Library plays and a coach's own plays resolve through the same lookup. */
  const findPlay = useCallback(
    (id: string): Play | null => {
      if (draft?.spec.id === id) return draft;
      const owned = userPlays.find((p) => p.spec.id === id);
      if (owned) return owned;
      const spec = lib.byId.get(id);
      return spec ? { spec } : null;
    },
    [draft, lib.byId, userPlays],
  );

  const toggleBook = useCallback(
    (spec: PlaySpec) => {
      if (!book.book) {
        setShowBook(true);
        return;
      }
      const existing = book.book.entries.find(
        (e) => (e.play.lineage?.rootId ?? e.play.spec.id) === spec.id,
      );
      if (existing) book.removeEntry(existing.play.spec.id);
      else book.addFromLibrary(spec);
    },
    [book],
  );

  /** Apply a library-level choice and go look at the results. */
  const browse = useCallback(
    (patch: { side?: "offense" | "defense"; variant?: FieldVariantId }) => {
      if (patch.side) setSide(patch.side);
      if (patch.variant) setVariant(patch.variant);
      setView({ kind: "library" });
    },
    [],
  );

  const startBlank = useCallback(() => {
    if (!book.book) {
      setShowBook(true);
      return;
    }
    const play = blankPlay(book.book.variant, side);
    setDraft(play);
    setView({ kind: "edit", id: play.spec.id });
  }, [book.book, side]);

  const active = view.kind === "library" ? null : findPlay(view.id);

  if (view.kind === "edit" && active) {
    return (
      <main className="pb-page">
        <PlayEditor
          play={active}
          variant={bookVariant}
          style={book.style}
          readOnly={!book.book || book.readOnly}
          onSave={(edited) => {
            const saved = book.commitEdit(active, edited);
            setDraft(null);
            setView({ kind: "play", id: saved.spec.id });
          }}
          onClose={() => setView({ kind: "play", id: view.id })}
        />
      </main>
    );
  }

  return (
    <main className="pb-page">
      <header className="pb-bar" data-side={side}>
        <Link href="/" className="pb-back">‹ All projects</Link>
        <span className="pb-wordmark">
          <span aria-hidden>▚</span> {PRODUCT.name}
        </span>

        {/* Side and team size are choices about the LIBRARY, so picking one
            from inside a play takes you back to it with that choice applied.
            They used to change state invisibly and read as dead buttons. */}
        <div className="pb-seg" role="group" aria-label="Side of the ball">
          <button aria-pressed={side === "offense"} onClick={() => browse({ side: "offense" })}>Offense</button>
          <button aria-pressed={side === "defense"} onClick={() => browse({ side: "defense" })}>Defense</button>
        </div>

        <div className="pb-seg" role="group" aria-label="Team size">
          {MVP_VARIANTS.map((v) => (
            <button key={v} aria-pressed={variant === v} onClick={() => browse({ variant: v })}>
              {variantOf(v).label}
            </button>
          ))}
        </div>

        <span className="pb-bar-spacer" />

        <WantMore project="playbook" className="pb-btn pb-btn-ghost" />

        <button
          className="pb-btn"
          onClick={() => setShowBook(true)}
          data-tel="pb-open-book"
          data-tel-project="playbook"
        >
          {book.book ? `${book.book.name} · ${book.book.entries.length}` : "＋ New playbook"}
        </button>
        {book.saving && <span className="pb-label pb-saving">Saving…</span>}
      </header>

      {showBook && (
        <BookPanel
          book={book}
          onClose={() => setShowBook(false)}
          onOpenPlay={(id: string) => {
            setShowBook(false);
            setView({ kind: "play", id });
          }}
        />
      )}

      {view.kind === "play" && active ? (
        <PlayDetail
          play={active}
          variant={bookVariant}
          style={book.style}
          inBook={inBook.has(active.lineage?.rootId ?? active.spec.id)}
          readOnly={!book.book || book.readOnly}
          onEdit={() => setView({ kind: "edit", id: view.id })}
          onToggleBook={() => toggleBook(active.spec)}
          onClose={() => setView({ kind: "library" })}
          onFlipVariant={setVariant}
        />
      ) : (
        <div className="pb-browse">
          <aside className="pb-rail-facets" aria-label="Filters">
            <div className="pb-facet-head">
              <h3 className="pb-panel-title">Filter</h3>
              {search.chipCount > 0 && (
                <button className="pb-btn" onClick={search.clear}>Clear</button>
              )}
            </div>
            <Facets entries={results} filters={search.active} onSet={search.setFilter} />
          </aside>

          <section className="pb-results">
            <div className="pb-searchbar">
              <input
                className="pb-input"
                value={search.query}
                onChange={(e) => search.setQuery(e.target.value)}
                placeholder="mesh vs cover 3 · target:TE · 3rd-long · air raid"
                aria-label="Search plays"
                data-tel="pb-search"
                data-tel-project="playbook"
              />
              <div className="pb-seg">
                <button aria-pressed={search.scope === "library"} onClick={() => search.setScope("library")}>
                  Library
                </button>
                <button aria-pressed={search.scope === "book"} onClick={() => search.setScope("book")}>
                  My book
                </button>
              </div>
              <button className="pb-chip-toggle" aria-pressed={dense} onClick={() => setDense((d) => !d)}>
                Dense
              </button>
            </div>

            {/* What the search understood, so a coach can see that "first down"
                became a situation filter — and drop it. */}
            {(search.understood.length > 0 || search.freeWords.length > 0) && (
              <div className="pb-understood">
                <span className="pb-label">Reading that as</span>
                {search.understood.map((c) => (
                  <button
                    key={c.matched}
                    className="pb-chip"
                    onClick={() => search.dropConstraint(c.matched)}
                    title={`Remove "${c.label}"`}
                  >
                    {c.label} <span aria-hidden>✕</span>
                  </button>
                ))}
                {search.freeWords.map((w) => (
                  <span key={w} className="pb-chip pb-chip--text">“{w}”</span>
                ))}
              </div>
            )}

            <p className="pb-label pb-count">
              {lib.loading
                ? "Loading library…"
                : `${results.length} of ${
                    search.scope === "book" ? userPlays.length : lib.index.filter((e) => e.f.side === side).length
                  } plays`}
              {lib.meta && search.scope === "library" && !lib.loading && (
                <> · {lib.meta.formationCount} formations · {lib.meta.routeCount} routes</>
              )}
            </p>

            {lib.error && <p className="pb-prose pb-error">Could not load the library: {lib.error}</p>}

            {dense ? (
              <table className="pb-dense">
                <thead>
                  <tr>
                    <th className="pb-label">Play</th>
                    <th className="pb-label">Formation</th>
                    <th className="pb-label">Type</th>
                    <th className="pb-label">Situation</th>
                    <th className="pb-label">Target</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {results.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <button className="pb-linkish" onClick={() => setView({ kind: "play", id: e.id })}>
                          {e.name}
                        </button>
                      </td>
                      <td>{e.f.formationName}</td>
                      <td>{e.f.type}</td>
                      <td>{e.f.situations.slice(0, 2).join(", ").replace(/-/g, " ")}</td>
                      <td>{e.f.target.join(", ")}</td>
                      <td>
                        <button
                          className="pb-btn"
                          onClick={() => {
                            const spec = lib.byId.get(e.id) ?? userPlays.find((p) => p.spec.id === e.id)?.spec;
                            if (spec) toggleBook(spec);
                          }}
                        >
                          {inBook.has(e.id) ? "✓" : "+"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="pb-grid">
                {/* Only with nothing filtered — otherwise it is a card that
                    ignores the search you just typed. */}
                {search.scope === "library" && search.chipCount === 0 && !search.query.trim() && (
                  <button
                    className="pb-card pb-card--new"
                    onClick={startBlank}
                    data-tel="pb-build-own"
                    data-tel-project="playbook"
                  >
                    <span className="pb-card-new-mark" aria-hidden>＋</span>
                    <span className="pb-card-title">Build your own</span>
                    <span className="pb-prose">
                      Start from a {variantOf(variant).label} formation and draw it yourself.
                    </span>
                  </button>
                )}
                {results.map((e) => {
                  const spec = lib.byId.get(e.id) ?? userPlays.find((p) => p.spec.id === e.id)?.spec;
                  if (!spec) return null;
                  return (
                    <PlayCard
                      key={e.id}
                      spec={spec}
                      variant={variant}
                      style={book.style}
                      inBook={inBook.has(e.f.side === "defense" ? e.id : spec.id)}
                      onOpen={(id) => setView({ kind: "play", id })}
                      onToggleBook={toggleBook}
                    />
                  );
                })}
              </div>
            )}

            {!lib.loading && results.length === 0 && (
              <p className="pb-prose pb-empty">
                Nothing matches. {search.chipCount > 0 && <button className="pb-linkish" onClick={search.clear}>Clear the filters</button>}
              </p>
            )}
          </section>
        </div>
      )}

      {!book.book && !book.loading && showBook && <NewBook onCreate={book.create} onClose={() => setShowBook(false)} error={book.error} />}
    </main>
  );
}
