"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deriveArchetypes } from "./archetypes";
import ChatBar from "./ChatBar";
import Header, { type FilterMode } from "./Header";
import SidePanel from "./SidePanel";
import type {
  CompEdge,
  CompGraphData,
  CompNode,
  Position,
  PositionTraitAverages,
} from "./types";

const CompGraph = dynamic(() => import("./CompGraph"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-stone-50 text-stone-500 text-sm">
      Loading comparison engine…
    </div>
  ),
});

export default function CompExplorer() {
  const [data, setData] = useState<CompGraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CompNode | null>(null);
  const [filter, setFilter] = useState<FilterMode>("ALL");
  // Player ids the chat answer flagged. Drives a camera fly + node glow in
  // the graph. Cleared when the user starts a new chat or clicks the bg.
  const [chatFocusedIds, setChatFocusedIds] = useState<string[]>([]);

  const handleSelect = useCallback((node: CompNode | null) => {
    setSelected(node);
    if (node === null) setChatFocusedIds([]);
  }, []);

  const handleFilterChange = useCallback((next: FilterMode) => {
    setFilter(next);
    setSelected((prev) =>
      prev && next !== "ALL" && prev.position !== next ? null : prev,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/projects/nfl-prospect-comparables/comp_graph.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: CompGraphData) => {
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nodeIndex = useMemo(() => {
    if (!data) return new Map<string, CompNode>();
    return new Map(data.nodes.map((n) => [n.id, n]));
  }, [data]);

  // Derive archetypes once per bundle. ~80ms over 1000 nodes; useMemo
  // pins it across re-renders so panel switches don't re-run k-means.
  const archetypes = useMemo(() => {
    if (!data) return null;
    return deriveArchetypes(data.nodes);
  }, [data]);

  const traitAverages: PositionTraitAverages = useMemo(() => {
    if (!data) return {};
    const sums: Record<Position, Record<string, [number, number]>> = {
      QB: {}, RB: {}, WR: {}, TE: {},
    };
    for (const n of data.nodes) {
      if (!n.traits) continue;
      for (const [k, v] of Object.entries(n.traits)) {
        if (v.score == null) continue;
        const arr = sums[n.position][k] ?? [0, 0];
        arr[0] += v.score;
        arr[1] += 1;
        sums[n.position][k] = arr;
      }
    }
    const out: PositionTraitAverages = {};
    for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
      const inner: Record<string, number> = {};
      for (const [k, [s, c]] of Object.entries(sums[pos])) {
        if (c > 0) inner[k] = s / c;
      }
      out[pos] = inner;
    }
    return out;
  }, [data]);

  // Per the UI vision spec: single mention → zoom + auto-select that node;
  // multiple mentions → fit-camera fly without opening the side panel
  // (the panel can only show one prospect at a time, and forcing one would
  // bias which player feels like the "answer").
  const handleChatFocus = useCallback(
    (ids: string[]) => {
      setChatFocusedIds(ids);
      if (ids.length === 1 && data) {
        const target = data.nodes.find((n) => n.id === ids[0]);
        if (target) setSelected(target);
      } else if (ids.length > 1) {
        setSelected(null);
      }
    },
    [data],
  );

  const compsForSelected: { node: CompNode; edge: CompEdge }[] = useMemo(() => {
    if (!selected || !data) return [];
    const bestByOther = new Map<string, { node: CompNode; edge: CompEdge }>();
    for (const e of data.edges) {
      if (e.source !== selected.id && e.target !== selected.id) continue;
      const otherId = e.source === selected.id ? e.target : e.source;
      const otherNode = nodeIndex.get(otherId);
      if (!otherNode) continue;
      const existing = bestByOther.get(otherId);
      if (!existing || e.similarity > existing.edge.similarity) {
        bestByOther.set(otherId, { node: otherNode, edge: e });
      }
    }
    return Array.from(bestByOther.values()).sort(
      (a, b) => b.edge.similarity - a.edge.similarity,
    );
  }, [selected, data, nodeIndex]);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-stone-50 text-stone-500 text-sm">
        Failed to load comp graph: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-stone-50 text-stone-500 text-sm">
        Loading comparison engine…
      </div>
    );
  }

  return (
    <>
      <CompGraph
        data={data}
        selectedId={selected?.id ?? null}
        onSelect={handleSelect}
        filter={filter}
        chatFocusedIds={chatFocusedIds}
        archetypes={archetypes}
      />
      <Header filter={filter} onFilterChange={handleFilterChange} />
      <ChatBar onFocus={handleChatFocus} />
      <SidePanel
        node={selected}
        comps={compsForSelected}
        traitAverages={traitAverages}
        onClose={() => handleSelect(null)}
        onSelectComp={handleSelect}
        onChatFocus={handleChatFocus}
      />
    </>
  );
}
