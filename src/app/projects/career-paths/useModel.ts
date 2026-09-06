"use client";

import { useEffect, useState } from "react";

import { loadParams } from "./engine/params.ts";
import type { Params } from "./engine/types.ts";

export interface FlowNode {
  count: number; medPay?: number; medAvg?: number; medLtv?: number; medWealth?: number; life?: number; cash?: number;
}
export interface FlowLink { count: number; forced: Record<string, number> }
export interface Flows {
  perTrack: number;
  nodes: Record<string, FlowNode>;
  links: Record<string, FlowLink>;
}

export interface Model {
  params: Params;
  /** The Sourced tree as shipped, for the methodology table. */
  raw: unknown;
  flows: Record<"technical" | "nontechnical", Flows>;
}

/** Fetch the calibrated parameters and precomputed sankey flows once. */
export function useModel(base = "/career-paths"): Model | null {
  const [model, setModel] = useState<Model | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${base}/params.json`).then((r) => r.json()),
      fetch(`${base}/flows.json`).then((r) => r.json()),
    ]).then(([raw, flows]) => {
      if (live) setModel({ params: loadParams(raw), raw, flows });
    });
    return () => { live = false; };
  }, [base]);
  return model;
}
