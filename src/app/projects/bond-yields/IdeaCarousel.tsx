"use client";

/**
 * The five ideas as a carousel under the chart: a scroll-snap row of
 * cards with previous/next buttons and a position readout. Each card
 * ends with chips for the episodes it explains; a chip opens that
 * episode on the chart, filtered by this idea.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { EPISODES } from "./episodes";
import { PILLARS, type PillarId } from "./pillars";

interface Props {
  flash: PillarId | null;
  onEpisode: (episodeId: string, pillar: PillarId) => void;
}

export default function IdeaCarousel({ flash, onEpisode }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  // Which card is at the left edge, from scroll position.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const onScroll = () => {
      const cards = Array.from(row.children) as HTMLElement[];
      const left = row.scrollLeft + 1;
      let i = 0;
      cards.forEach((c, k) => { if (c.offsetLeft <= left) i = k; });
      setIdx(i);
    };
    row.addEventListener("scroll", onScroll, { passive: true });
    return () => row.removeEventListener("scroll", onScroll);
  }, []);

  const go = useCallback((i: number) => {
    const row = rowRef.current;
    const card = row?.children[i] as HTMLElement | undefined;
    if (!row || !card) return;
    row.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
  }, []);

  return (
    <div className="by-ideas">
      <div className="by-ideas-nav">
        <span className="by-ideas-pos">{PILLARS[idx].n} / {PILLARS[PILLARS.length - 1].n}</span>
        <div className="by-ideas-btns">
          <button type="button" className="by-btn" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous idea">←</button>
          <button type="button" className="by-btn" onClick={() => go(idx + 1)} disabled={idx >= PILLARS.length - 1} aria-label="Next idea">→</button>
        </div>
      </div>
      <div className="by-ideas-row" ref={rowRef}>
        {PILLARS.map((p) => {
          const eps = EPISODES.filter((e) => e.forces.some((f) => f.pillar === p.id));
          return (
            <article
              key={p.id}
              id={`idea-${p.id}`}
              className={`by-idea${flash === p.id ? " is-flash" : ""}`}
              style={{ "--pillar": p.color } as React.CSSProperties}
            >
              <div className="by-idea-head">
                <span className="by-idea-n">{p.n}</span>
                <span className="by-idea-tag">{p.tag}</span>
              </div>
              <h3 className="by-idea-name">{p.name}</h3>
              {p.body.map((para, i) => (
                <p key={i} className="by-idea-body">{para}</p>
              ))}
              <p className="by-idea-q"><span className="by-kicker">Ask</span>{p.question}</p>
              <div className="by-idea-eps">
                <span className="by-kicker">See it on the chart</span>
                <div>
                  {eps.map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      className="by-ep-chip"
                      onClick={() => onEpisode(e.id, p.id)}
                      title={e.title}
                      data-tel="by-idea-episode"
                      data-tel-project="bond-yields"
                    >
                      <span className="by-ep-chip-n">{e.n}</span> {e.when}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
