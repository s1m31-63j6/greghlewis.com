"use client";

import { useMemo, useState } from "react";

type SortDir = "asc" | "desc";

interface Props {
  columns: string[];
  rows: unknown[][];
  totalRows: number;
}

export function SortableTable({ columns, rows, totalRows }: Props) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState("");

  const numericColumns = useMemo(() => {
    const set = new Set<string>();
    for (const col of columns) {
      const colIdx = columns.indexOf(col);
      const firstNonNull = rows.find(
        (r) => r[colIdx] !== null && r[colIdx] !== undefined,
      );
      if (firstNonNull && typeof firstNonNull[colIdx] === "number") {
        set.add(col);
      }
    }
    return set;
  }, [columns, rows]);

  const moneyColumns = useMemo(() => {
    const set = new Set<string>();
    for (const col of columns) {
      if (!numericColumns.has(col)) continue;
      const lower = col.toLowerCase();
      if (
        lower.includes("sales") ||
        lower.includes("cost") ||
        lower.includes("price") ||
        lower.includes("revenue") ||
        lower.includes("amount") ||
        lower.includes("profit") ||
        lower.includes("margin")
      ) {
        set.add(col);
      }
    }
    return set;
  }, [columns, numericColumns]);

  const filteredSorted = useMemo(() => {
    let work = rows;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      work = rows.filter((r) =>
        r.some((cell) => String(cell ?? "").toLowerCase().includes(q)),
      );
    }
    if (sortCol) {
      const colIdx = columns.indexOf(sortCol);
      if (colIdx >= 0) {
        work = [...work].sort((a, b) => {
          const av = a[colIdx];
          const bv = b[colIdx];
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          if (typeof av === "number" && typeof bv === "number") {
            return sortDir === "asc" ? av - bv : bv - av;
          }
          const cmp = String(av).localeCompare(String(bv));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return work;
  }, [rows, columns, filter, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortCol(null);
    }
  };

  const formatCell = (v: unknown, col: string): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") {
      if (moneyColumns.has(col)) {
        return v.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        });
      }
      if (Number.isInteger(v)) return v.toLocaleString();
      return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    if (typeof v === "string") return v;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-stone-200 bg-stone-50">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter rows…"
          className="text-[13px] px-2.5 py-1 bg-white border border-stone-300 rounded text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-500 w-48"
        />
        <div className="text-[11px] text-stone-500 font-mono">
          {filter
            ? `${filteredSorted.length.toLocaleString()} of ${totalRows.toLocaleString()}`
            : `${totalRows.toLocaleString()} rows`}
          {totalRows > rows.length && (
            <span className="ml-1">(showing first {rows.length.toLocaleString()})</span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-stone-50 border-b border-stone-200 z-10">
            <tr>
              {columns.map((c) => {
                const active = sortCol === c;
                const arrow = !active ? "↕" : sortDir === "asc" ? "↑" : "↓";
                const align = numericColumns.has(c) ? "text-right" : "text-left";
                return (
                  <th
                    key={c}
                    onClick={() => toggleSort(c)}
                    className={`px-3 py-2 font-medium text-stone-700 whitespace-nowrap cursor-pointer hover:bg-stone-100 select-none ${align}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c}
                      <span
                        className={`text-[10px] ${active ? "text-stone-900" : "text-stone-400"}`}
                      >
                        {arrow}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredSorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-stone-500">
                  No rows match filter.
                </td>
              </tr>
            ) : (
              filteredSorted.map((row, i) => (
                <tr
                  key={i}
                  className={i % 2 === 0 ? "bg-white" : "bg-stone-50/50"}
                >
                  {row.map((cell, j) => {
                    const col = columns[j];
                    const align = numericColumns.has(col)
                      ? "text-right font-mono"
                      : "text-left";
                    return (
                      <td
                        key={j}
                        className={`px-3 py-1.5 text-stone-900 whitespace-nowrap ${align}`}
                      >
                        {formatCell(cell, col)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
