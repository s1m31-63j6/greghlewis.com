"use client";

// "Launch live Power BI dashboard" modal flow.
//
// State machine the user sees:
//   confirm  → "Spin up a live Power BI capacity (~1 min)?"
//   warming  → polls /pbi/status every 4s; shows state + a progress note
//   active   → mounts <PowerBIEmbed> with the embed token
//   error    → shows the message + a retry button
//   closed   → modal dismissed

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PbiEmbed, PbiState } from "@/lib/adventureworks/types";

const PowerBIEmbed = dynamic(
  () => import("powerbi-client-react").then((m) => m.PowerBIEmbed),
  { ssr: false, loading: () => <div className="h-[60vh] bg-stone-100 animate-pulse" /> },
);

type Phase = "confirm" | "warming" | "active" | "error";

interface Props {
  functionUrl: string;
  open: boolean;
  onClose: () => void;
}

interface StatusResponse {
  state: PbiState;
  last_activity_at: string | null;
  capacity_name: string;
}

export function DashboardLauncher({ functionUrl, open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [state, setState] = useState<PbiState>("Unknown");
  const [embed, setEmbed] = useState<PbiEmbed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);
  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase("confirm");
      setEmbed(null);
      setError(null);
    }
  }, [open, cleanup]);

  const startWarming = useCallback(async () => {
    setPhase("warming");
    setError(null);
    try {
      const res = await fetch(`${functionUrl.replace(/\/$/, "")}/pbi/resume`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as PbiEmbed;
      setEmbed(data);
      setState("Active");
      setPhase("active");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to warm capacity");
      setPhase("error");
    }
  }, [functionUrl]);

  // Status poller — used while the resume request is still in flight to
  // give the user visible progress.
  useEffect(() => {
    if (phase !== "warming") return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`${functionUrl.replace(/\/$/, "")}/pbi/status`);
        if (!r.ok) return;
        const data = (await r.json()) as StatusResponse;
        if (!cancelled) setState(data.state);
      } catch {
        // ignore — the /resume call holds the source of truth
      }
    };
    void poll();
    pollRef.current = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [phase, functionUrl, cleanup]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
          <h3 className="text-sm font-medium text-stone-900">
            Power BI — Internet Sales Overview
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 text-sm"
            aria-label="Close"
          >
            Close ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {phase === "confirm" && (
            <div className="space-y-3 text-sm text-stone-700">
              <p>
                This will resume the Fabric F2 capacity for this site. Cold
                start is ~60–90 seconds. Capacity auto-pauses after 30
                minutes of inactivity.
              </p>
              <p className="text-[12px] text-stone-500">
                You can also pause it manually when you&apos;re done.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={startWarming}
                  className="text-sm px-4 py-2 rounded-md bg-stone-900 hover:bg-stone-700 text-white transition"
                >
                  Launch dashboard
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm px-4 py-2 rounded-md text-stone-700 hover:bg-stone-100 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {phase === "warming" && (
            <WarmingPanel state={state} />
          )}

          {phase === "active" && embed && (
            <div className="h-[65vh]">
              <PowerBIEmbed
                embedConfig={{
                  type: "report",
                  id: embed.reportId,
                  embedUrl: embed.embedUrl,
                  accessToken: embed.token,
                  tokenType: 1, // models.TokenType.Embed
                  settings: {
                    panes: {
                      filters: { expanded: false, visible: true },
                      pageNavigation: { visible: true },
                    },
                  },
                }}
                cssClassName="w-full h-full"
              />
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                <div className="font-medium">Couldn&apos;t launch the dashboard.</div>
                <div className="text-[13px] mt-1">{error}</div>
              </div>
              <button
                type="button"
                onClick={startWarming}
                className="text-sm px-4 py-2 rounded-md bg-stone-900 hover:bg-stone-700 text-white transition"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STEPS: { state: PbiState; label: string }[] = [
  { state: "Paused", label: "Capacity paused" },
  { state: "Resuming", label: "Resuming capacity" },
  { state: "Active", label: "Rendering report" },
];

function WarmingPanel({ state }: { state: PbiState }) {
  const stepIdx = (() => {
    if (state === "Paused" || state === "Unknown") return 0;
    if (state === "Resuming") return 1;
    return 2;
  })();
  return (
    <div className="space-y-4">
      <div className="text-sm text-stone-700">
        Bringing up your Power BI capacity. This takes 60–90 seconds the first
        time.
      </div>
      <ol className="space-y-2">
        {STEPS.map((s, i) => {
          const done = i < stepIdx;
          const cur = i === stepIdx;
          return (
            <li
              key={s.state}
              className={`flex items-center gap-3 text-sm ${
                done
                  ? "text-stone-500"
                  : cur
                    ? "text-stone-900"
                    : "text-stone-400"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${
                  done
                    ? "bg-stone-300 text-stone-700"
                    : cur
                      ? "bg-stone-900 text-white animate-pulse"
                      : "border border-stone-300 text-stone-400"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>
      <div className="text-[11px] text-stone-500 font-mono">
        capacity state: {state}
      </div>
    </div>
  );
}
