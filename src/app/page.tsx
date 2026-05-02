import { Gallery } from "./_landing/Gallery";
import { projects } from "./_landing/projects-data";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pb-24 pt-12 sm:pt-16">
      <Gallery projects={projects} />
    </main>
  );
}
