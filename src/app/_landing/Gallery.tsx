"use client";

import { useMemo, useState } from "react";
import type { Project } from "./projects-data";
import { ProjectCard } from "./ProjectCard";
import WantMore from "@/app/_subscribe/WantMore";

const MONTH_NAMES_LONG = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_NAMES_SHORT = MONTH_NAMES_LONG.map((m) => m.slice(0, 3));

function buildSearchHaystack(p: Project): string {
  const [y, m, d] = p.date.split("-");
  const monthIdx = Number(m) - 1;
  const dateForms = [
    p.date,
    `${m}-${d}-${y}`,
    y,
    MONTH_NAMES_LONG[monthIdx],
    MONTH_NAMES_SHORT[monthIdx],
  ];

  let urlHost = "";
  try {
    if (p.liveUrlIsExternal) urlHost = new URL(p.liveUrl).host;
  } catch {
    // ignore
  }
  const githubFragment = p.githubUrl
    ? p.githubUrl.replace("https://github.com/", "")
    : "";

  return [
    p.title,
    p.oneLiner,
    ...p.techStack,
    ...p.searchTags,
    ...dateForms,
    urlHost,
    githubFragment,
  ]
    .join(" ")
    .toLowerCase();
}

function matches(haystack: string, query: string): boolean {
  if (!query.trim()) return true;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

export function Gallery({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");

  const indexed = useMemo(
    () => projects.map((p) => ({ project: p, haystack: buildSearchHaystack(p) })),
    [projects],
  );

  const filtered = useMemo(
    () => indexed.filter(({ haystack }) => matches(haystack, query)),
    [indexed, query],
  );

  return (
    <section>
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by tool or topic — Bedrock, RAG, Streamlit, regression…"
          aria-label="Filter projects"
          className="w-full border-0 border-b border-neutral-300 bg-transparent py-3 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#1B4F7A] focus:outline-none dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-[#7BA8CB]"
        />
        <div className="mt-2 flex items-center justify-between gap-4">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-neutral-400 dark:text-neutral-500">
            {filtered.length} of {projects.length} project{projects.length === 1 ? "" : "s"}
          </span>
          <WantMore project="home" />
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-x-10 md:gap-y-12 lg:grid-cols-3">
        {filtered.map(({ project }) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-12 font-mono text-sm text-neutral-500 dark:text-neutral-500">
          No projects match — try fewer or different terms.
        </p>
      )}
    </section>
  );
}
