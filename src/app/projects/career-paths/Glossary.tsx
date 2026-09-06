import type { GlossaryEntry } from "@/lib/career-paths/brief";

export default function Glossary({ entries }: { entries: GlossaryEntry[] }) {
  return (
    <section className="cp-brief-section" id="glossary">
      <h2>Glossary</h2>
      <dl className="cp-brief-glossary">
        {entries.map((g) => (
          <div key={g.term} className="cp-brief-term">
            <dt>{g.term}</dt>
            <dd>{g.definition}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
