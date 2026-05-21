"use client";

import { useMemo } from "react";
import type { Leader, Religion } from "@/lib/religious-voices/types";

interface Props {
  leaders: Leader[];
  religion: Religion;
  leaderId: string;
  onChange: (next: { religion: Religion; leaderId: string }) => void;
}

const RELIGION_ORDER: Religion[] = [
  "Mormon",
  "Catholic",
  "Methodist",
  "Southern Baptist",
  "Jewish",
  "Buddhist",
  "Islam",
  "Hindu",
];

export function LeaderPicker({ leaders, religion, leaderId, onChange }: Props) {
  // Bucket leaders by religion; only show religions that have at least
  // one leader with chunks in the corpus.
  const byReligion = useMemo(() => {
    const map = new Map<Religion, Leader[]>();
    for (const l of leaders) {
      const arr = map.get(l.religion) ?? [];
      arr.push(l);
      map.set(l.religion, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.era_start - b.era_start);
    return map;
  }, [leaders]);

  const availableReligions = RELIGION_ORDER.filter((r) => byReligion.has(r));
  const currentLeaders = byReligion.get(religion) ?? [];

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wider text-stone-500">Tradition</label>
        <select
          value={religion}
          onChange={(e) => {
            const r = e.target.value as Religion;
            const first = byReligion.get(r)?.[0];
            if (first) onChange({ religion: r, leaderId: first.leader_id });
          }}
          className="bg-white border border-stone-300 rounded-md px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500 transition min-w-[160px]"
        >
          {availableReligions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-[10px] uppercase tracking-wider text-stone-500">Leader</label>
        <select
          value={leaderId}
          onChange={(e) => onChange({ religion, leaderId: e.target.value })}
          className="bg-white border border-stone-300 rounded-md px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-500 transition w-full"
        >
          {currentLeaders.map((l) => (
            <option key={l.leader_id} value={l.leader_id}>
              {l.era_start} — {l.full_name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
