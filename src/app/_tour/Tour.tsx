"use client";

/**
 * A first-visit guided tour: dim the page, spotlight one thing at a time, and
 * say what it is.
 *
 * Dense pages on this site earn their density, but density is only an advantage
 * once you know what you are looking at — and the usual fix, a permanent block
 * of explanatory prose, charges every later visit for a lesson that mattered
 * once. A tour charges the first visit only.
 *
 * Rendering is driver.js (7KB, no dependencies, MIT). Two of its properties are
 * load-bearing here rather than incidental:
 *
 *   - It appends both the overlay and the popover to `document.body`. Board rows
 *     on the draft sheet use `content-visibility: auto`, whose paint containment
 *     clips anything drawn past a row's edge — the same trap that made `Tip.tsx`
 *     a portal. Mounting on the body sidesteps it by construction.
 *   - `waitForElement` is a MutationObserver, so a step can point at something a
 *     previous step brought into existence.
 *
 * This wrapper adds what driver.js leaves out: persistence, reduced motion, a
 * dialog role, telemetry, and `before` (see the note on navigation below).
 */

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";

import { track } from "@/lib/telemetry/track";
import type { TourStep } from "@/lib/tour/types";
import { registerTour } from "./tourStore";

function hasSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // A private window is a perfectly reasonable place to read a draft sheet.
    return false;
  }
}

function markSeen(key: string): void {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* no storage, no memory of the tour; it will offer itself again */
  }
}

interface Props {
  /** Project id, shared with the signup vocabulary in `lib/subscribe/copy.ts`. */
  project: string;

  /** The tour itself. Safe to pass as an inline literal — see `stepsRef` below. */
  steps: TourStep[];

  /** Bump to re-offer the tour to people who have already seen an older one. */
  version?: number;

  /** Set false to make the tour launch-only, never on first visit. */
  auto?: boolean;

  /**
   * How long to let the page settle before auto-starting. The draft sheet
   * fetches its board, and a tour that highlights a row before the rows exist
   * highlights nothing.
   */
  startDelayMs?: number;
}

export default function Tour({
  project,
  steps,
  version = 1,
  auto = true,
  startDelayMs = 600,
}: Props) {
  // Steps are an inline literal at every call site, so a fresh array arrives on
  // every render. Depending on it directly would tear the tour down and restart
  // it mid-step, so the effect reads the latest steps through a ref instead.
  // Assigned in an effect, never in the render body: React 19's rules in this
  // repo hard-error on touching a ref during render.
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    const key = `tour:${project}:v${version}`;
    let d: Driver | null = null;

    // Invisible stand-in for a `rect` step. driver highlights elements, so a
    // step that wants to spotlight a group gets a box positioned over it.
    let proxy: HTMLDivElement | null = null;
    const proxyAt = (r: DOMRect | null): Element | null => {
      if (!r) return null;
      if (!proxy) {
        proxy = document.createElement("div");
        proxy.className = "tour-rect-proxy";
        document.body.appendChild(proxy);
      }
      proxy.style.top = `${r.top}px`;
      proxy.style.left = `${r.left}px`;
      proxy.style.width = `${r.width}px`;
      proxy.style.height = `${r.height}px`;
      return proxy;
    };

    const start = () => {
      const all = stepsRef.current;
      if (!all.length) return;
      d?.destroy();

      // Per run, not per mount: replaying from the button must not inherit the
      // previous run's completion.
      let completed = false;
      let ended = false;

      /**
       * Every exit funnels through here.
       *
       * driver's own `onDestroyed` is not a reliable place for this: it fires
       * only `if (__activeElement && __activeStep)`, and `__activeElement` is
       * assigned inside a requestAnimationFrame callback. A tour torn down
       * before that lands reports nothing and leaks the proxy. So this is
       * idempotent and called from both the completion path and
       * `onDestroyStarted`, which is what Escape, the close button and an
       * overlay click all reach.
       */
      const finish = () => {
        if (ended) return;
        ended = true;
        track(completed ? "tour-done" : "tour-dismissed", project);
        proxy?.remove();
        proxy = null;
      };

      /**
       * Navigation runs the DESTINATION step's `before` itself.
       *
       * driver.js waits for a step's element before it fires that step's
       * `onHighlightStarted`, so a hook that reveals the target would run after
       * the wait meant to catch it. Doing the reveal here, one beat earlier,
       * means `waitForElement` has something to wait for.
       *
       * Safe against recursion: `moveNext`/`movePrevious` are the raw index
       * moves and do not consult `onNextClick` again. This one handler covers
       * the buttons, the arrow keys, and the final step alike.
       */
      const go = (dir: 1 | -1) => {
        const cur = d?.getActiveIndex() ?? 0;
        const next = all[cur + dir];

        if (!next) {
          // Stepped past the last step: this is the completion click.
          completed = true;
          const done = all[cur]?.onDone;
          d?.destroy();
          finish();
          done?.();
          return;
        }

        next.before?.();
        if (dir === 1) d?.moveNext();
        else d?.movePrevious();
      };

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      d = driver({
        // An overlay that slides between targets is the one animation this
        // feature is actually about, which is exactly why reduced-motion has to
        // switch it off rather than shorten it.
        animate: !reduced,
        smoothScroll: !reduced,
        overlayColor: "#141821",
        overlayOpacity: 0.66,
        stagePadding: 6,
        stageRadius: 3,
        popoverClass: "tour-pop",
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        steps: all.map((s) => ({
          element: s.rect
            ? () => proxyAt(s.rect!()) ?? document.querySelector(s.target)!
            : s.target,
          waitForElement: s.waitFor ?? 0,
          popover: {
            title: s.title,
            description: s.body,
            side: s.side,
            align: s.align,
            doneBtnText: s.doneLabel,
          },
        })),
        // driver.js labels its buttons but never announces the popover itself.
        onPopoverRender: (pop) => {
          pop.wrapper.setAttribute("role", "dialog");
          pop.wrapper.setAttribute("aria-modal", "true");
          pop.wrapper.setAttribute("aria-label", "Guided tour");
        },
        onHighlighted: (_el, _step, opts) => {
          track(`tour-step-${(opts.index ?? 0) + 1}`, project);
        },
        onNextClick: () => go(1),
        onPrevClick: () => go(-1),
        // Escape, the close button and overlay clicks land here. `destroy()`
        // itself calls the internal teardown directly, so this cannot recurse.
        onDestroyStarted: () => {
          finish();
          d?.destroy();
        },
        onDestroyed: finish,
      });

      // Marked seen on START rather than on completion. Somebody who opens the
      // tour and closes it after two steps has made a decision; re-offering it
      // unbidden on every later visit is the version of this feature people
      // learn to dismiss on sight. The button replays it on demand.
      markSeen(key);
      track("tour-start", project);
      all[0].before?.();
      d.drive();
    };

    const unregister = registerTour(start);

    /**
     * Auto-start waits for the tab to be visible.
     *
     * A link opened in a background tab would otherwise run the whole tour
     * against nobody and mark it seen on the way, spending the single
     * first-visit showing on an empty room. Deferring costs nothing: the tour
     * starts the moment the reader actually arrives.
     *
     * It also avoids the state where driver's animated step transitions stall,
     * since those are driven by requestAnimationFrame and rAF does not fire in
     * a hidden tab. Launching from the button is never gated — that is someone
     * asking for it, on a tab they are demonstrably looking at.
     */
    let timer = 0;
    let onVisible: (() => void) | null = null;

    if (auto && !hasSeen(key)) {
      // setTimeout, not rAF, for the settle delay itself.
      const arm = () => {
        timer = window.setTimeout(start, startDelayMs);
      };

      if (document.visibilityState === "visible") {
        arm();
      } else {
        onVisible = () => {
          if (document.visibilityState !== "visible") return;
          document.removeEventListener("visibilitychange", onVisible!);
          onVisible = null;
          arm();
        };
        document.addEventListener("visibilitychange", onVisible);
      }
    }

    return () => {
      window.clearTimeout(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
      unregister();
      d?.destroy();
      proxy?.remove();
    };
  }, [project, version, auto, startDelayMs]);

  return null;
}
