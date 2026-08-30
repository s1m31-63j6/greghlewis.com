"use client";

/**
 * The offseason briefing, for the drafter who stopped watching in January.
 *
 * The five-state arrow is COMPUTED — it compares the current consensus value of
 * the players a team added against the players it lost — and the page says so
 * rather than presenting arithmetic as insight. Coaching lines only appear for
 * teams somebody actually authored, because no free structured source covers
 * 2026 coordinator changes and a plausible guess is worse than a blank.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { TrendArrow, type Trend } from "./TrendArrow";
import { TeamLogo, teamOf, type TeamMap } from "./teams";

interface Move {
  id: string;
  name: string;
  pos: string;
  from?: string | null;
  to?: string | null;
  ecr: number | null;
  rookie?: boolean;
}

interface Staff {
  in?: string;
  out?: string;
  new?: boolean;
}

interface Coaching {
  HC?: Staff;
  OC?: Staff;
  /** Who actually calls the plays — often more predictive than the OC title. */
  playCaller?: "HC" | "OC" | string;
  /** True when the calls moved this offseason, even with no title change. */
  playCallerNew?: boolean;
  /** Gates whether the card mentions coaching at all. */
  major?: boolean;
  impact?: number;
  posImpact?: Record<string, number>;
  note?: string;
  source?: string;
}

interface Starter {
  id: string;
  name: string;
  pos: string;
  ecr: number | null;
}

interface Grades {
  offense: string;
  defense: string;
  schedule: string;
}

interface TeamEntry {
  in: Move[];
  out: Move[];
  trend: Record<string, Trend>;
  net: Record<string, number>;
  rosterNet: Record<string, number>;
  coachNet: Record<string, number>;
  coaching: Coaching | null;
  starters: Starter[];
  grades: Grades;
  /** The single item that most changed this team's offense. */
  narrative: string;
  /** Preseason mood. Derived, unless an override says otherwise. */
  vibe: string;
  /** Present only when the vibe was set by hand, and then it says why. */
  vibeNote: string | null;
  injuredStarters: number;
}

const POSITIONS = ["QB", "RB", "WR", "TE"];
const DIVISIONS = ["AFC East", "AFC North", "AFC South", "AFC West",
                   "NFC East", "NFC North", "NFC South", "NFC West"];

const SCORE: Record<Trend, number> = {
  "much-better": 2, better: 1, same: 0, worse: -1, "much-worse": -2,
};

export function TeamNews({ teams }: { teams: TeamMap }) {
  const [data, setData] = useState<Record<string, TeamEntry> | null>(null);
  const [div, setDiv] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "change" | "coaching">("name");
  const [onlyCoaching, setOnlyCoaching] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/draft-sheet/team-news.json")
      .then((r) => r.json())
      .then((d) => { if (live) setData(d.teams); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  const changed = useMemo(
    () => (data ? Object.values(data).filter((e) => hasChange(e.coaching)).length : 0),
    [data],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const list = Object.entries(data).map(([abbr, e]) => {
      const t = teamOf(teams, abbr);
      const net = POSITIONS.reduce((n, p) => n + (SCORE[e.trend[p]] ?? 0), 0);
      // `div` already reads "NFC West"; prefixing `conf` gave "NFC NFC West".
      return { abbr, entry: e, team: t, net, division: (t.div ?? t.conf ?? "").trim() };
    });
    let filtered = div === "all" ? list : list.filter((r) => r.division === div);
    if (onlyCoaching) filtered = filtered.filter((r) => hasChange(r.entry.coaching));
    const byName = (a: typeof list[0], b: typeof list[0]) =>
      (a.team.name || a.abbr).localeCompare(b.team.name || b.abbr);
    return filtered.sort((a, b) => {
      if (sort === "name") return byName(a, b);
      if (sort === "coaching") {
        const rank = (r: typeof list[0]) => (r.entry.coaching?.major ? 1 : 0);
        return rank(b) - rank(a) || b.net - a.net || byName(a, b);
      }
      return b.net - a.net || byName(a, b);
    });
  }, [data, teams, div, sort, onlyCoaching]);

  if (!data) return <p className="ds-status">Loading the offseason…</p>;

  return (
    <div className="ds-teams">
      <div className="ds-teams-bar">
        <label className="ds-check">
          Division
          <select value={div} onChange={(e) => setDiv(e.target.value)}>
            <option value="all">All teams</option>
            {DIVISIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="ds-check">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "name" | "change" | "coaching")}
          >
            <option value="name">Team name</option>
            <option value="coaching">Major coaching first</option>
            <option value="change">Biggest change</option>
          </select>
        </label>

        <label className="ds-check">
          <input
            type="checkbox"
            checked={onlyCoaching}
            onChange={(e) => setOnlyCoaching(e.target.checked)}
          />
          New coach only{changed ? ` (${changed})` : ""}
        </label>

        <span className="ds-toolbar-spacer" />
        <span className="ds-asof">{rows.length} shown</span>
      </div>

      {/* One line. The long version lives on the methodology page — on a phone
          it filled the whole first screen before a single team appeared. */}
      <p className="ds-teams-note">
        Grades are relative to the other 31 teams. Arrows blend the roster change with a
        coaching judgement — hover one for the split.{" "}
        <Link href="/projects/draft-sheet/methodology" className="ds-teams-more">
          How these are built
        </Link>
      </p>

      <div className="ds-team-grid">
        {rows.map(({ abbr, entry, team }) => (
          <article key={abbr} className="ds-team-card">
            <header>
              <TeamLogo abbr={abbr} teams={teams} size={22} />
              <h3>{team.name || abbr}</h3>
              <span className="ds-team-div">{team.div ?? team.conf}</span>
            </header>

            <div className="ds-team-arrows">
              {POSITIONS.map((p) => (
                <span
                  key={p}
                  className="ds-team-arrow"
                  title={
                    `${p}: roster ${fmt(entry.rosterNet?.[p])}`
                    + `, coaching ${fmt(entry.coachNet?.[p])}`
                    + `, net ${fmt(entry.net?.[p])}`
                  }
                >
                  <span className="ds-team-arrow-pos">{p}</span>
                  <TrendArrow trend={entry.trend[p] ?? "same"} />
                </span>
              ))}

              {/* Labelled in place. Explaining it only in the page-leading
                  paragraph meant the reader had to scroll back up to find out
                  what the word meant. */}
              <span className="ds-vibe-wrap">
                <span className="ds-vibe-label">Vibe</span>
                <span
                  className={`ds-vibe ds-vibe--${entry.vibe.toLowerCase()}`}
                  title={
                    entry.vibeNote
                      ? `${entry.vibe}: ${entry.vibeNote}`
                      : "Preseason mood: roster change, roster quality, injuries to projected starters, and whether the play-caller has done it before. Never rated above what the offense grade supports."
                  }
                >
                  {entry.vibe}
                </span>
              </span>
            </div>

            <p className="ds-narrative">{entry.narrative}</p>
            <StaffLine coaching={entry.coaching} />
            <GradeRow grades={entry.grades} />
            <Starters starters={entry.starters} />
            <CoachingNote coaching={entry.coaching} />

            <div className="ds-team-moves">
              <MoveList label="In" moves={entry.in} dirKey="from" />
              <MoveList label="Out" moves={entry.out} dirKey="to" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/** Only genuinely production-shifting changes earn space on the card. */
function hasChange(c: Coaching | null | undefined): boolean {
  return Boolean(c?.major);
}

function fmt(n: number | undefined): string {
  if (n == null) return "0";
  return n > 0 ? `+${Math.round(n)}` : String(Math.round(n));
}

/**
 * Coaching, but only when it matters.
 *
 * The first version led every card with a head coach, a coordinator, a scheme
 * lineage and a paragraph — thirty-two times. Most of that is noise to somebody
 * deciding who to draft: a coordinator swap that changes nothing is not worth a
 * drafter's attention, and nobody picking a running back cares whether the
 * offense traces to Erhardt-Perkins or Air Coryell. So coaching appears on ten
 * teams, one sentence each. Every team still carries its staff and impact
 * behind the scenes, so the arrows stay honest.
 */
/**
 * Who is in charge, on every card.
 *
 * The write-up below is deliberately reserved for the ten teams where coaching
 * plausibly moves production — but showing nothing at all on the other
 * twenty-two made it look like data was missing rather than withheld. One line
 * of names is reference, not commentary.
 */
function StaffLine({ coaching }: { coaching: Coaching | null }) {
  if (!coaching?.HC?.in && !coaching?.OC?.in) return null;
  const callerRole = coaching.playCaller === "HC" ? "HC" : "OC";
  return (
    <p className="ds-staff">
      {(["HC", "OC"] as const).map((role) => {
        const st = coaching[role];
        if (!st?.in) return null;
        return (
          <span key={role} className={st.new ? "is-new" : undefined}>
            <em>{role}</em> {st.in}
            {role === callerRole && <span className="ds-staff-calls">calls plays</span>}
          </span>
        );
      })}
    </p>
  );
}

function CoachingNote({ coaching }: { coaching: Coaching | null }) {
  if (!coaching?.major) return null;
  const caller = coaching.playCaller === "HC" ? coaching.HC : coaching.OC;
  return (
    <div className="ds-coach-major">
      <p className="ds-coach-head">
        <span className="ds-coach-flag">Coaching</span>
        {caller?.in && (
          <span className="ds-coach-who">
            {caller.in}
            <span className="ds-coach-role-tag">
              {coaching.playCaller === "HC" ? "HC" : "OC"} · calls plays
            </span>
          </span>
        )}
      </p>
      <p className="ds-coach-note">{coaching.note}</p>
    </div>
  );
}

const GRADE_TONE = (g: string) =>
  g.startsWith("A") ? "a" : g.startsWith("B") ? "b" : g.startsWith("C") ? "c" : "d";

function GradeRow({ grades }: { grades: Grades }) {
  const items: [string, string, string][] = [
    ["OFF", grades.offense, "Consensus value of the projected skill starters, against the other 31 teams"],
    ["DEF", grades.defense, "Where the market ranks this team defense, against the other 31 teams"],
    ["SOS", grades.schedule, "Strength of the defenses this offense faces — A is the easiest schedule"],
  ];
  return (
    <div className="ds-grades">
      {items.map(([label, g, title]) => (
        <span key={label} className="ds-grade" title={title}>
          <span className="ds-grade-label">{label}</span>
          <span className={`ds-grade-mark is-${GRADE_TONE(g)}`}>{g}</span>
        </span>
      ))}
    </div>
  );
}

function Starters({ starters }: { starters: Starter[] }) {
  if (!starters.length) return null;
  return (
    <div className="ds-starters">
      <h4>Projected starters</h4>
      <ul>
        {starters.map((s) => (
          <li key={s.id}>
            <span className="ds-starter-pos">{s.pos}</span>
            <span className="ds-starter-name">{s.name}</span>
            <span className="ds-starter-ecr ds-num">{s.ecr != null ? Math.round(s.ecr) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoveList({ label, moves, dirKey }: { label: string; moves: Move[]; dirKey: "from" | "to" }) {
  if (!moves.length) return <div className="ds-move-col"><h4>{label}</h4><p className="ds-move-none">—</p></div>;
  return (
    <div className="ds-move-col">
      <h4>{label}</h4>
      <ul>
        {moves.map((m) => (
          <li key={m.id}>
            <span className="ds-move-pos">{m.pos}</span>
            <span className="ds-move-name">{m.name}</span>
            <span className="ds-move-dir">
              {m.rookie ? "draft" : (m[dirKey] ?? "FA")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
