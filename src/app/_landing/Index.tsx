"use client";

/**
 * The Index of papers: the landing page, printed on the same sheet as the
 * papers. One row per paper: number and date, the title overprinted in
 * that paper's inks, one italic line, and a thumbnail of the built page.
 * The filter in the masthead matches any word against the title, note,
 * stack, tags, date and hosts.
 */

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";

import { CircleLink, DottedRule } from "@/app/_paper/Paper";
import palettes from "../../../design/working-papers/palettes.json";

import { paperNo, type Project } from "./projects-data";
import "./index.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

type Inks = { a: string; b: string; hl: string };
const INKS = palettes.papers as Record<string, Inks>;
const INDEX = palettes.papers.index;

function haystack(p: Project): string {
  const [y, m, d] = p.date.split("-");
  const month = MONTHS_LONG[Number(m) - 1];
  const host = p.liveUrlIsExternal ? new URL(p.liveUrl).host : "";
  const repo = p.githubUrl?.replace("https://github.com/", "") ?? "";
  return [p.title, p.note, ...p.techStack, ...p.searchTags, p.date, `${m}-${d}-${y}`, y, month, month.slice(0, 3), host, repo]
    .join(" ")
    .toLowerCase();
}

const matches = (hay: string, q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));

export function Index({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => [...projects].sort((a, b) => paperNo(b.id) - paperNo(a.id)).map((p) => ({ p, hay: haystack(p) })),
    [projects],
  );
  const shown = rows.filter(({ hay }) => matches(hay, query));

  return (
    <div className="wp-page wp-shell ix" style={{ "--a": INDEX.a, "--b": INDEX.b, "--hl": INDEX.hl } as CSSProperties} data-tel-project="home">
      <div className="wp-sheet">
        <header className="wp-mast">
          <div className="wp-mast-l"><b>Greg Lewis</b><span>Working Papers</span></div>
          <input
            type="search"
            className="wp-field ix-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by tool or topic"
            aria-label="Filter papers"
          />
        </header>
        <DottedRule />

        <p className="wp-note ix-intro">
          Models, simulators and explainers I build to understand something properly. Each one is a working paper:
          finished enough to use, open to revision.
        </p>
        {query.trim() && (
          <p className="wp-lab ix-count" aria-live="polite">
            {shown.length ? `${shown.length} of ${projects.length} papers` : "No papers match. Try fewer or different words."}
          </p>
        )}

        <ol className="ix-list">
          {shown.map(({ p }) => <li key={p.id}><Row p={p} /></li>)}
        </ol>

        <DottedRule className="ix-foot-rule" />
        <footer className="wp-footer ix-footer">
          <span className="ix-foot-name">Greg Lewis · Working Papers</span>
          <div className="wp-foot-links">
            <CircleLink href="https://github.com/s1m31-63j6/greghlewis.com" tel="outbound-github-footer">How this site was built</CircleLink>
            <CircleLink href="https://www.linkedin.com/in/greghlewis" tel="outbound-linkedin">Contact</CircleLink>
            <CircleLink href="/updates?from=home" tel="want-more">Want more?</CircleLink>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Row({ p }: { p: Project }) {
  const inks = INKS[p.id] ?? INDEX;
  const [y, m] = p.date.split("-");
  const Tag = p.liveUrlIsExternal ? "a" : Link;
  const ext = p.liveUrlIsExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <Tag
      href={p.liveUrl}
      {...ext}
      className="ix-row"
      style={{ "--a": inks.a, "--b": inks.b, "--rb": inks.b } as CSSProperties}
      data-tel="project-open"
      data-tel-project={p.id}
    >
      <div className="ix-no">
        <b>No. {String(paperNo(p.id)).padStart(2, "0")}</b>
        <span>{MONTHS[Number(m) - 1]} {y}</span>
      </div>
      <div className="ix-body">
        <h2 className="ix-title"><span className="ix-s">{p.title}</span>{p.liveUrlIsExternal && <span className="ix-ext" aria-label="opens elsewhere"> ↗</span>}</h2>
        <p className="ix-note">{p.note}</p>
      </div>
      <span className="ix-frame">
        <Image className="ix-img" src={p.thumbnail} alt="" fill sizes="(min-width: 860px) 250px, 100vw" style={{ objectPosition: p.thumbnailObjectPosition ?? "top" }} />
      </span>
    </Tag>
  );
}
