"use client";

import { useMemo, useState } from "react";
import { Chat } from "./Chat";
import { LeaderPicker } from "./LeaderPicker";
import type { Leader, Religion } from "@/lib/religious-voices/types";

interface Props {
  leaders: Leader[];
}

export function ProjectShell({ leaders }: Props) {
  // Initialize on the earliest LDS prophet if present (the audience leans
  // Mormon and Joseph Smith is the recognizable starting point); otherwise
  // the first leader in whatever traditions are available.
  const initial = useMemo(() => {
    const js = leaders.find((l) => l.leader_id === "joseph-smith");
    if (js) return { religion: js.religion, leaderId: js.leader_id };
    const first = leaders[0];
    return first
      ? { religion: first.religion, leaderId: first.leader_id }
      : null;
  }, [leaders]);

  const [sel, setSel] = useState<{ religion: Religion; leaderId: string } | null>(
    initial,
  );

  if (!sel) {
    return (
      <p className="text-stone-600 text-sm">
        No leaders are available yet. Run{" "}
        <code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded">
          uv run python build.py --seed
        </code>{" "}
        in <code className="text-xs">projects/religious-voices/</code> to
        generate the corpus.
      </p>
    );
  }

  const leader = leaders.find((l) => l.leader_id === sel.leaderId);
  if (!leader) {
    return <p className="text-stone-600 text-sm">Leader not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <LeaderPicker
        leaders={leaders}
        religion={sel.religion}
        leaderId={sel.leaderId}
        onChange={setSel}
      />

      {/* Selected leader card */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-serif text-stone-900">{leader.full_name}</h2>
          <span className="text-xs text-stone-500 font-mono">{leader.dates}</span>
        </div>
        <p className="text-sm text-stone-600 mt-1">{leader.role}</p>
        {leader.themes.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {leader.themes.slice(0, 6).map((t) => (
              <li
                key={t}
                className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Chat leader={leader} />
    </div>
  );
}
