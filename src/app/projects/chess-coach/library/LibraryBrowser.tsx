"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { ConceptDetail } from "./ConceptDetail";
import { CATEGORY_STYLE, type Category, type Concept, type Library } from "./types";

const CATEGORIES: Category[] = ["tactics", "endgame", "strategy"];

/** `useSyncExternalStore` wiring for the URL hash. */
function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => window.location.hash.slice(1);
/** No hash during SSR — the grid is the server-rendered view. */
const serverHash = () => "";

function ConceptCard({ concept, onOpen }: { concept: Concept; onOpen: () => void }) {
  const style = CATEGORY_STYLE[concept.category];
  return (
    <button
      onClick={onOpen}
      className="group flex h-full flex-col rounded-3xl bg-white p-5 text-left shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_#E5E5E5] active:translate-y-[2px] active:shadow-[0_2px_0_0_#E5E5E5]"
    >
      <span
        className="w-fit rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
        style={{ color: style.colour, backgroundColor: `${style.colour}1F` }}
      >
        {style.icon} {style.label}
      </span>
      <h3 className="mt-2 text-lg font-black leading-tight text-[#4B4B4B]">{concept.name}</h3>
      <p className="mt-1 flex-1 text-sm font-bold leading-snug text-[#999]">{concept.one_liner}</p>
      <span className="mt-3 text-xs font-extrabold text-[#AFAFAF]">
        {concept.examples.length} {concept.source === "lichess" ? "puzzles" : "positions"} →
      </span>
    </button>
  );
}

export function LibraryBrowser() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Category | "all">("all");


  useEffect(() => {
    fetch("/chess-coach/library.json")
      .then((res) => {
        if (!res.ok) throw new Error(`library.json returned ${res.status}`);
        return res.json();
      })
      .then(setLibrary)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load the library."),
      );
  }, []);

  const visible = useMemo(() => {
    if (!library) return [];
    const needle = query.trim().toLowerCase();
    return library.concepts.filter((concept) => {
      if (filter !== "all" && concept.category !== filter) return false;
      if (!needle) return true;
      // Search the prose too — people look for "back rank" or "knight", not slugs.
      return `${concept.name} ${concept.one_liner} ${concept.teaching}`
        .toLowerCase()
        .includes(needle);
    });
  }, [filter, library, query]);

  // Deep-link support, so a concept can be shared or bookmarked. The URL hash
  // is external state, and `useSyncExternalStore` is the API for that — reading
  // it into React state inside an effect would cascade a second render on every
  // mount and on every navigation.
  const hash = useSyncExternalStore(subscribeToHash, readHash, serverHash);
  const open = library?.concepts.find((c) => c.slug === hash) ?? null;

  if (error) {
    return <p className="font-bold text-[#FF4B4B]">Couldn&apos;t load the library: {error}</p>;
  }
  if (!library) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-3xl bg-[#EDEDED]" />
        ))}
      </div>
    );
  }

  if (open) {
    return (
      <ConceptDetail
        key={open.slug}
        concept={open}
        onBack={() => {
          // Back to the grid without leaving a "#" behind in the URL.
          history.pushState(null, "", window.location.pathname + window.location.search);
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 44 concepts…"
          className="min-w-56 flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#4B4B4B] outline-none ring-2 ring-[#E5E5E5] placeholder:text-[#C4C4C4] focus:ring-[#1CB0F6]"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-2xl px-3.5 py-2.5 text-xs font-extrabold transition ${
              filter === "all"
                ? "bg-[#4B4B4B] text-white"
                : "bg-white text-[#777] ring-2 ring-[#E5E5E5]"
            }`}
          >
            All {library.concepts.length}
          </button>
          {CATEGORIES.map((category) => {
            const style = CATEGORY_STYLE[category];
            const count = library.concepts.filter((c) => c.category === category).length;
            const on = filter === category;
            return (
              <button
                key={category}
                onClick={() => setFilter(category)}
                className="rounded-2xl px-3.5 py-2.5 text-xs font-extrabold transition"
                style={
                  on
                    ? { backgroundColor: style.colour, color: "white" }
                    : { backgroundColor: "white", color: style.colour, boxShadow: "inset 0 0 0 2px #E5E5E5" }
                }
              >
                {style.icon} {style.label} {count}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-3xl bg-white px-5 py-8 text-center font-bold text-[#AFAFAF] ring-1 ring-[#E5E5E5]">
          Nothing matches “{query}”.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((concept) => (
            <ConceptCard
              key={concept.slug}
              concept={concept}
              onOpen={() => {
                window.location.hash = concept.slug;
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
