"use client";

/**
 * A coach's playbook: load, mutate, persist.
 *
 * COPY-ON-WRITE. Editing a library play forks it into a new user play whose
 * lineage points back at the original, and the library JSON is never touched.
 * Editing a play you already own bumps its revision instead. The trigger is
 * ownership, not the act of editing — a strict "every edit is a new play" rule
 * would produce forty items from one afternoon of tuning, while still not
 * telling you anything the lineage does not.
 *
 * Writes are per-play, so saving one edit is a small request rather than a
 * rewrite of the whole book.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { registerCustomFormations } from "@/lib/playbook/formations";
import { DEFAULT_STYLE } from "@/lib/playbook/resolve";
import type {
  BookEntry,
  BookStyle,
  FieldVariantId,
  Formation,
  Play,
  PlaySpec,
  Playbook,
} from "@/lib/playbook/types";

const LS_BOOK = "pb:book";
const LS_TOKEN = "pb:token:";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A private window is a perfectly reasonable place to demo this.
  }
}

/** A user play id that stays readable in a URL and in the sort key. */
function userPlayId(rootId: string): string {
  return `u_${rootId}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface BookState {
  book: Playbook | null;
  token: string | null;
  readOnly: boolean;
  loading: boolean;
  error: string | null;
  saving: boolean;
}

export function usePlaybook() {
  const [state, setState] = useState<BookState>({
    book: null, token: null, readOnly: false, loading: true, error: null, saving: false,
  });
  // A mirror of the current book so mutations can read fresh state without a
  // state updater. React invokes updaters twice in development, and an updater
  // that fires a network request fires it twice — see usePlayHistory for the
  // version of this bug that was actually broken rather than merely wasteful.
  const bookRef = useRef<Playbook | null>(null);

  const setBook = useCallback((next: Playbook | null) => {
    bookRef.current = next;
    // The resolver reads custom formations through a module-level overlay
    // rather than a prop threaded through ten call sites, so it has to be
    // refreshed wherever the book changes. Doing it here rather than in an
    // effect means the very next render already resolves against them; an
    // effect would draw one frame of every play falling back to its shipped
    // formation, which looks exactly like data loss.
    registerCustomFormations(next?.formations ?? []);
    setState((s) => ({ ...s, book: next }));
  }, []);

  const headers = useCallback(
    (): HeadersInit => ({
      "content-type": "application/json",
      ...(state.token ? { "x-playbook-token": state.token } : {}),
    }),
    [state.token],
  );

  const load = useCallback(async (id: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/playbook/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? "Playbook not found" : "Could not load");
      const { book } = (await res.json()) as { book: Playbook };
      const token = read(LS_TOKEN + id);
      write(LS_BOOK, id);
      bookRef.current = book;
      registerCustomFormations(book.formations ?? []);
      setState({ book, token, readOnly: !token, loading: false, error: null, saving: false });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, []);

  const create = useCallback(async (name: string, variant: FieldVariantId) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/playbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, variant }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not create playbook");
      }
      const { book, editToken } = (await res.json()) as { book: Playbook; editToken: string };
      write(LS_TOKEN + book.id, editToken);
      write(LS_BOOK, book.id);
      bookRef.current = book;
      setState({ book, token: editToken, readOnly: false, loading: false, error: null, saving: false });
      return book;
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
      return null;
    }
  }, []);

  // Restore whatever book was last open, so a refresh does not lose the session.
  useEffect(() => {
    const last = read(LS_BOOK);
    if (last) void load(last);
    else setState((s) => ({ ...s, loading: false }));
  }, [load]);

  const saveEntry = useCallback(
    async (entry: BookEntry) => {
      const book = bookRef.current;
      if (!book) return;
      setState((s) => ({ ...s, saving: true }));
      try {
        await fetch(`/api/playbook/${book.id}/play/${entry.play.spec.id}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ entry }),
        });
      } finally {
        setState((s) => ({ ...s, saving: false }));
      }
    },
    [headers],
  );

  /**
   * Save one formation into the open book. Optimistic: the overlay and the
   * book state update first so the field redraws immediately, and a failed
   * write surfaces as an error rather than a silent revert — the coach is
   * looking at the shape they just drew, and yanking it back under them is
   * worse than telling them it did not save.
   */
  const saveFormation = useCallback(
    async (formation: Formation) => {
      const book = bookRef.current;
      if (!book) return;
      const rest = (book.formations ?? []).filter((f) => f.id !== formation.id);
      setBook({ ...book, formations: [...rest, formation].sort((a, b) => a.name.localeCompare(b.name)) });
      setState((s) => ({ ...s, saving: true }));
      try {
        const res = await fetch(`/api/playbook/${book.id}/formation/${formation.id}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ formation }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setState((s) => ({ ...s, error: body?.error ?? "Could not save that formation" }));
        }
      } finally {
        setState((s) => ({ ...s, saving: false }));
      }
    },
    [headers, setBook],
  );

  const removeFormation = useCallback(
    async (formationId: string) => {
      const book = bookRef.current;
      if (!book) return;
      setBook({ ...book, formations: (book.formations ?? []).filter((f) => f.id !== formationId) });
      setState((s) => ({ ...s, saving: true }));
      try {
        await fetch(`/api/playbook/${book.id}/formation/${formationId}`, {
          method: "DELETE",
          headers: headers(),
        });
      } finally {
        setState((s) => ({ ...s, saving: false }));
      }
    },
    [headers, setBook],
  );

  const saveBook = useCallback(
    async (next: Playbook) => {
      setState((s) => ({ ...s, saving: true }));
      try {
        await fetch(`/api/playbook/${next.id}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ book: next }),
        });
      } finally {
        setState((s) => ({ ...s, saving: false }));
      }
    },
    [headers],
  );

  /**
   * Library plays are copied BY VALUE rather than referenced, so a coach's book
   * never silently changes because a route's nominal depth got retuned later.
   * `lineage.rootId` keeps the provenance for the badge and for a future
   * "the library version changed" diff.
   */
  const addFromLibrary = useCallback(
    (spec: PlaySpec, section?: string) => {
      const book = bookRef.current;
      if (!book) return;
      const position = (book.entries.at(-1)?.position ?? 0) + 10;
      const play: Play = {
        spec: structuredClone(spec),
        lineage: { rootId: spec.id, parentId: spec.id, rev: 1, source: "library" },
      };
      const entry: BookEntry = {
        play, position, section, callNumber: String(book.entries.length + 1),
      };
      setBook({ ...book, entries: [...book.entries, entry] });
      void saveEntry(entry);
    },
    [saveEntry, setBook],
  );

  const removeEntry = useCallback(
    (playId: string) => {
      const book = bookRef.current;
      if (!book) return;
      const entry = book.entries.find((e) => e.play.spec.id === playId);
      if (!entry) return;
      setBook({ ...book, entries: book.entries.filter((e) => e.play.spec.id !== playId) });
      void fetch(`/api/playbook/${book.id}/play/${playId}?position=${entry.position}`, {
        method: "DELETE",
        headers: headers(),
      });
    },
    [headers, setBook],
  );

  /**
   * The copy-on-write decision, in one place. A play you own is revised; a play
   * you do not own is forked, with the lineage recording where it came from.
   */
  const commitEdit = useCallback(
    (original: Play, edited: Play): Play => {
      const book = bookRef.current;
      const owned =
        book?.entries.some((e) => e.play.spec.id === original.spec.id) && !state.readOnly;

      let next: Play;
      if (owned) {
        next = {
          ...edited,
          lineage: {
            rootId: original.lineage?.rootId ?? original.spec.id,
            parentId: original.lineage?.parentId ?? original.spec.id,
            rev: (original.lineage?.rev ?? 1) + 1,
            source: original.lineage?.source ?? "user",
          },
        };
      } else {
        const rootId = original.lineage?.rootId ?? original.spec.id;
        const id = userPlayId(rootId);
        next = {
          ...edited,
          spec: { ...edited.spec, id, name: edited.spec.name },
          lineage: { rootId, parentId: original.spec.id, rev: 1, source: "user" },
        };
      }

      const current = bookRef.current;
      if (current) {
        const i = current.entries.findIndex((e) => e.play.spec.id === original.spec.id);
        const entries = [...current.entries];
        const entry: BookEntry =
          i >= 0
            ? { ...entries[i], play: next }
            : {
                play: next,
                position: (current.entries.at(-1)?.position ?? 0) + 10,
                callNumber: String(current.entries.length + 1),
              };
        if (i >= 0) entries[i] = entry;
        else entries.push(entry);
        setBook({ ...current, entries });
        void saveEntry(entry);
      }

      return next;
    },
    [saveEntry, setBook, state.readOnly],
  );

  const reorder = useCallback(
    (playId: string, toIndex: number) => {
      const book = bookRef.current;
      if (!book) return;
      const from = book.entries.findIndex((e) => e.play.spec.id === playId);
      if (from < 0 || from === toIndex || toIndex < 0 || toIndex >= book.entries.length) return;
      const entries = [...book.entries];
      const [moved] = entries.splice(from, 1);
      entries.splice(toIndex, 0, moved);
      // Renumber in tens. A single move could reuse the gaps, but a book is
      // small enough that rewriting it keeps the numbers legible on a sheet.
      const next = { ...book, entries: entries.map((e, i) => ({ ...e, position: (i + 1) * 10 })) };
      setBook(next);
      void saveBook(next);
    },
    [saveBook, setBook],
  );

  const update = useCallback(
    (patch: Partial<Pick<Playbook, "name" | "style" | "roster" | "variant">>) => {
      const book = bookRef.current;
      if (!book) return;
      const next = { ...book, ...patch };
      setBook(next);
      void saveBook(next);
    },
    [saveBook, setBook],
  );

  const setEntry = useCallback(
    (playId: string, patch: Partial<Pick<BookEntry, "section" | "callNumber">>) => {
      const book = bookRef.current;
      if (!book) return;
      const entries = book.entries.map((e) =>
        e.play.spec.id === playId ? { ...e, ...patch } : e,
      );
      setBook({ ...book, entries });
      const entry = entries.find((e) => e.play.spec.id === playId);
      if (entry) void saveEntry(entry);
    },
    [saveEntry, setBook],
  );

  const style: BookStyle = state.book?.style ?? DEFAULT_STYLE;

  return {
    ...state, style,
    load, create, addFromLibrary, removeEntry, commitEdit, reorder, update, setEntry,
    saveFormation, removeFormation,
  };
}
