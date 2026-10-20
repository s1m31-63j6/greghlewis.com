import { Index } from "./_landing/Index";
import { projects } from "./_landing/projects-data";

export default function Home() {
  return (
    <main>
      <Index projects={projects} />
    </main>
  );
}
