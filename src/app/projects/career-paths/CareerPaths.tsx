"use client";

/**
 * Should You Join a Startup? — the page.
 *
 * Three tabs over one model. The plinko and the adventure share the same
 * calibrated parameters and the same engine, so the distribution a reader
 * watches settle on tab one is the population whose flows they walk through
 * on tab two. Persona lives here because both tabs read it.
 */

import Link from "next/link";
import { useState } from "react";

import WantMore from "@/app/_subscribe/WantMore";
import Tour from "@/app/_tour/Tour";
import TourButton from "@/app/_tour/TourButton";

import Adventure from "./Adventure";
import Brief from "./Brief";
import PlinkoHero from "./PlinkoHero";
import type { Persona, Stage } from "./engine/types.ts";
import { TOUR_STEPS } from "./tour";
import { useModel } from "./useModel";
import { useSimulation } from "./useSimulation";

type TabId = "plinko" | "adventure" | "brief";

const TABS: { id: TabId; label: string; n: string }[] = [
  { id: "plinko", label: "Three thousand careers", n: "01" },
  { id: "adventure", label: "Choose your own", n: "02" },
  { id: "brief", label: "Stages and funding, explained", n: "03" },
];

export const PROJECT = "career-paths";

export default function CareerPaths() {
  const [tab, setTab] = useState<TabId>("plinko");
  const [persona, setPersona] = useState<Persona>("nontechnical");
  const [stage, setStage] = useState<Stage | null>(null);
  const [stay, setStay] = useState(true);
  const [seed, setSeed] = useState(20260906);

  const model = useModel();
  const runs = useSimulation(model?.params ?? null, { persona, stage, stay, seed });

  return (
    <div className="cp-page" data-tel-project={PROJECT}>
      <div className="cp-container">
        <nav className="cp-topnav">
          <Link href="/">← back to projects</Link>
          <div className="cp-topnav-right">
            <TourButton className="cp-tour-launch" />
            <Link href="/projects/career-paths/methodology">Methodology</Link>
            <WantMore project={PROJECT} className="cp-want" />
          </div>
        </nav>

        <header className="cp-header">
          <div>
            <div className="cp-kicker">Project 10 · A sourced simulation</div>
            <h1 className="cp-display">Should You Join a Startup?</h1>
          </div>
          <p className="cp-lede">
            Students hear the upside of a startup job and rarely the downside. Here are three
            thousand simulated careers, one first job each, dropped through thirty years of pay,
            layoffs, promotions, shutdowns and the occasional exit. Every number behind them
            has a citation.
          </p>
        </header>

        <nav className="cp-tabs" role="tablist" data-tour="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`cp-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
              data-tel="cp-tab"
              data-tel-project={PROJECT}
              data-tab={t.id}
            >
              <span className="cp-num">{t.n}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <Tour project={PROJECT} steps={TOUR_STEPS} startDelayMs={2500} />

        <main>
          <section className="cp-panel" hidden={tab !== "plinko"} aria-hidden={tab !== "plinko"}>
            <PlinkoHero
              model={model}
              runs={runs}
              persona={persona}
              stage={stage}
              stay={stay}
              onPersona={setPersona}
              onStage={setStage}
              onStay={setStay}
              onReplay={() => setSeed((s) => s + 1)}
              active={tab === "plinko"}
            />
          </section>
          <section className="cp-panel" hidden={tab !== "adventure"} aria-hidden={tab !== "adventure"}>
            {model ? (
              <Adventure model={model} persona={persona} onPersona={setPersona} active={tab === "adventure"} />
            ) : (
              <div className="cp-loading">Loading the model…</div>
            )}
          </section>
          <section className="cp-panel" hidden={tab !== "brief"} aria-hidden={tab !== "brief"}>
            <Brief model={model} />
          </section>
        </main>
      </div>
    </div>
  );
}
