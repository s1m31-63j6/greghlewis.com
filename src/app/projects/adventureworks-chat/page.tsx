import type { Metadata } from "next";
import Link from "next/link";
import { Chat } from "./Chat";
import { SchemaOverview } from "./SchemaOverview";

export const metadata: Metadata = {
  title: "AdventureWorks Chat-Based Reporting · Greg Lewis",
  description:
    "A reporting engine you talk to. Natural-language questions on Microsoft's canonical sales warehouse return SQL, tables, charts, and live Power BI dashboards. Two frontier LLMs go head-to-head.",
};

export default function Page() {
  const functionUrl = process.env.NEXT_PUBLIC_ADVENTUREWORKS_FUNCTION_URL ?? "";

  return (
    <main className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <nav className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wider text-stone-500 hover:text-stone-900 transition"
        >
          ← All projects
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-3xl sm:text-4xl text-stone-900 leading-tight">
          AdventureWorks Chat-Based Reporting
        </h1>
        <p className="mt-3 text-stone-600 text-base leading-relaxed">
          Ask Microsoft&apos;s canonical sales warehouse a question. Two
          frontier LLMs — <span className="text-stone-900">Azure OpenAI</span>{" "}
          and <span className="text-stone-900">Claude</span> — generate the
          T-SQL, the warehouse runs it, and you get the answer as a table,
          a chart, and a sentence or two of prose. Same question, two
          models — see for yourself how they compare.
        </p>
      </header>

      <div className="mb-6 rounded-lg border-l-2 border-stone-400 bg-stone-50/60 px-4 py-3 text-sm text-stone-700">
        <p>
          The data is the public{" "}
          <span className="text-stone-900">AdventureWorksDW2022</span>{" "}
          sample — a fictional bike company&apos;s sales from 2010–2014.
          Every query is validated to be a single SELECT against the
          allowed tables before it hits the database. The model can&apos;t
          write, drop, or read anything outside the warehouse.
        </p>
      </div>

      <div className="mb-6">
        <SchemaOverview />
      </div>

      <Chat functionUrl={functionUrl} />

      <footer className="mt-16 pt-6 border-t border-stone-200 text-xs text-stone-500 leading-relaxed space-y-2">
        <p>
          Architecture: a TypeScript Azure Function (Flex Consumption) on
          Node 22 calls{" "}
          <span className="text-stone-900">Azure OpenAI gpt-4.1-mini</span>{" "}
          or{" "}
          <span className="text-stone-900">Anthropic Claude Sonnet 4.6</span>{" "}
          to generate T-SQL, validates the AST with{" "}
          <code className="text-[11px] bg-stone-100 px-1 rounded">
            node-sql-parser
          </code>{" "}
          (SELECT-only, table allowlist, mandatory row cap), executes
          on Azure SQL Serverless via Managed Identity, then re-prompts
          the same model for a 2–3 sentence narrative and a Vega-Lite
          chart spec. The Function&apos;s system-assigned MI authenticates
          to SQL, Azure OpenAI, Key Vault, and Microsoft.Fabric — zero
          secrets in code.
        </p>
        <p>
          The Power BI launch button resumes a Fabric F2 capacity on
          demand (~60–90s cold start), generates an embed token via a
          service principal, and pauses again after 30 minutes idle.
          Everything is provisioned by Bicep.
        </p>
        <p>
          A deliberate architectural contrast to the other projects on
          this site — those are AWS-native (Bedrock, Amplify, CDK Python).
          See{" "}
          <Link
            href="/projects/adventureworks-chat/methodology"
            className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
          >
            the methodology page
          </Link>{" "}
          for the live A/B comparison between the two models.
        </p>
      </footer>
    </main>
  );
}
