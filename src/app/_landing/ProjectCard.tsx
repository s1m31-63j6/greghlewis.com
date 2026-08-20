import Image from "next/image";
import Link from "next/link";
import type { Project } from "./projects-data";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

export function ProjectCard({ project }: { project: Project }) {
  const {
    id,
    title,
    date,
    oneLiner,
    techStack,
    liveUrl,
    liveUrlIsExternal,
    githubUrl,
    thumbnail,
    thumbnailObjectPosition,
  } = project;

  const liveLabel = liveUrlIsExternal ? "Live ↗" : "Live →";
  const liveExternalProps = liveUrlIsExternal
    ? { target: "_blank", rel: "noopener noreferrer" as const }
    : {};

  const showSeparateGithub = githubUrl !== null && githubUrl !== liveUrl;

  const ThumbnailLink = liveUrlIsExternal ? "a" : Link;
  const thumbnailLinkProps = liveUrlIsExternal
    ? { href: liveUrl, target: "_blank", rel: "noopener noreferrer" as const }
    : { href: liveUrl };

  return (
    <article className="group flex flex-col gap-4">
      <ThumbnailLink
        {...thumbnailLinkProps}
        className="relative block aspect-[16/9] overflow-hidden border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
        aria-label={`Open ${title}`}
        data-tel="project-open"
        data-tel-project={id}
      >
        <Image
          src={thumbnail}
          alt={`${title} preview`}
          fill
          sizes="(min-width: 1024px) 360px, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-opacity duration-200 group-hover:opacity-90"
          style={{ objectPosition: thumbnailObjectPosition ?? "center" }}
        />
      </ThumbnailLink>

      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-500">
        {formatDate(date)}
      </span>

      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>

      <p className="text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300">
        {oneLiner}
      </p>

      <p className="line-clamp-2 font-mono text-[10.5px] leading-relaxed text-neutral-500 dark:text-neutral-500">
        {techStack.join(" · ")}
      </p>

      <div className="mt-1 flex items-center gap-5 text-sm">
        <a
          href={liveUrl}
          {...liveExternalProps}
          data-tel="project-open"
          data-tel-project={id}
          className="font-medium text-[#1B4F7A] underline-offset-4 hover:underline dark:text-[#7BA8CB]"
        >
          {liveLabel}
        </a>
        {showSeparateGithub && (
          <a
            href={githubUrl!}
            target="_blank"
            rel="noopener noreferrer"
            data-tel="outbound-github"
            data-tel-project={id}
            className="text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
          >
            GitHub ↗
          </a>
        )}
      </div>
    </article>
  );
}
