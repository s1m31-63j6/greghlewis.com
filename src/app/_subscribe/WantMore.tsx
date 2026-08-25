/**
 * The "Want more?" button that lives in each project's own header.
 *
 * A link, not a form. The ask sits next to the title where somebody who liked
 * what they just used will see it, and the actual typing happens on /updates —
 * which means each project's chrome gains one small control rather than a
 * block of form at the bottom of a page nobody scrolls to.
 *
 * The source travels in the URL. It is the same vocabulary the stored lead and
 * the dashboard use, so a link that says `?from=playbook` produces a row that
 * says Playbook, with no mapping in between.
 *
 * Two tones rather than nine bespoke buttons: `light` for the editorial pages,
 * `dark` for the app pages that run their own dark chrome. Anything that needs
 * to match a specific palette exactly passes `className` and gets no tone
 * styling at all.
 */

import Link from "next/link";

const TONES = {
  light:
    "border-neutral-300 text-neutral-700 hover:border-neutral-500 hover:text-neutral-900",
  dark: "border-white/25 text-white/80 hover:border-white/60 hover:text-white",
} as const;

interface Props {
  /** A `SOURCE_IDS` value. Becomes `?from=` and the stored source. */
  project: string;
  tone?: keyof typeof TONES;
  /** Replaces the tone styling entirely, for chrome with its own button class. */
  className?: string;
  label?: string;
}

export default function WantMore({
  project,
  tone = "light",
  className,
  label = "Want more?",
}: Props) {
  return (
    <Link
      href={`/updates?from=${encodeURIComponent(project)}`}
      data-tel="want-more"
      data-tel-project={project}
      className={
        className
        ?? `inline-flex shrink-0 items-center rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${TONES[tone]}`
      }
    >
      {label}
    </Link>
  );
}
