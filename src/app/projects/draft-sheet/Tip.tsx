"use client";

/**
 * A hover tooltip that actually shows up.
 *
 * The native `title` attribute was the first attempt and it is not good enough
 * here: it waits about a second, it truncates, and on a badge this small people
 * read the `cursor: help` question mark and conclude the thing is broken.
 *
 * A plain CSS tooltip cannot work either — the board's rows use
 * `content-visibility: auto`, which brings paint containment with it, so
 * anything drawn past a row's edge is clipped away. So this renders into a
 * PORTAL on the document body, positioned from the trigger's own rect. It is
 * outside every containment boundary on the page by construction.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Pos {
  top: number;
  left: number;
}

export function Tip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  // No `mounted` guard is needed: `pos` is only ever set from a pointer or
  // focus event, which cannot happen during server rendering, so by the time
  // there is anything to portal there is definitely a document to portal into.
  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Clamped to the viewport so a badge at the right edge of the board does
    // not push its own tooltip off screen.
    const width = 260;
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    setPos({ top: r.bottom + 6, left });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  // A tooltip anchored to a rect goes stale the moment the page moves.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos, hide]);

  return (
    <>
      <span
        ref={ref}
        className={className}
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {pos
        ? createPortal(
            <span className="ds-tip" style={{ top: pos.top, left: pos.left }} role="tooltip">
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
