import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AdventureWorks Chat — Methodology · Greg Lewis",
  description:
    "Architecture, prompt design, SQL validation, and live A/B comparison of Azure OpenAI vs. Anthropic Claude on the AdventureWorksDW text-to-SQL benchmark.",
};

export default function Methodology() {
  return (
    <main className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <nav className="mb-8">
        <Link
          href="/projects/adventureworks-chat"
          className="text-xs uppercase tracking-wider text-stone-500 hover:text-stone-900 transition"
        >
          ← Back to chat
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl text-stone-900 leading-tight">
          Methodology
        </h1>
        <p className="mt-3 text-stone-600 text-base leading-relaxed">
          How the AdventureWorks chat-based reporting engine works, and
          how two frontier LLMs compare on the same workload.
        </p>
      </header>

      <section className="space-y-6 text-stone-700 text-[15px] leading-relaxed">
        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            1. The shape of the problem
          </h2>
          <p>
            Translating natural language to executable SQL is the
            &quot;white whale&quot; of analytics: it&apos;s been demoed
            for two decades and not generalised because real enterprise
            schemas are messy, dirty, and unstable. AdventureWorksDW is
            the easy case — a fixed, well-documented star schema that
            every frontier model has seen in training. That makes it the
            right scope for a portfolio piece: the architecture is the
            artefact, not the SQL accuracy.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            2. Architecture
          </h2>
          <p>
            A TypeScript Azure Function on Flex Consumption orchestrates
            two stages per chat turn. Stage A generates SQL from a
            ~2K-token schema digest plus five canonical few-shot
            examples; stage B re-prompts the same model for a narrative
            and a Vega-Lite chart spec given the result rows. The
            Function&apos;s system-assigned Managed Identity is the
            principal everywhere: it authenticates to Azure SQL (added
            as a contained <code>db_datareader</code> user), Azure
            OpenAI (Cognitive Services OpenAI User), Key Vault (which
            holds the Anthropic API key), and Microsoft.Fabric (which
            owns the Power BI Embedded capacity). Nothing is a long-lived
            secret in code.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            3. SQL safety
          </h2>
          <p>
            Even with a read-only database user, the generated SQL goes
            through an AST check: the statement must parse as a single
            SELECT against the AdventureWorksDW dimension and fact
            tables, must include a TOP/LIMIT cap of 500 rows, and is
            denied if it touches <code>xp_*</code>, <code>sys.*</code>,
            <code>OPENROWSET</code>, or chains multiple statements.
            <code>node-sql-parser</code> with the T-SQL dialect powers
            the check; the validator is unit-testable in isolation.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            4. Cost engineering
          </h2>
          <p>
            Azure SQL is on the Serverless GP tier with a 60-minute
            auto-pause; Functions are Flex Consumption (scale-to-zero
            with working HTTP streaming); Power BI Embedded runs on a
            Fabric F2 capacity that is paused by default and only
            resumes when a user explicitly clicks &quot;Launch live
            dashboard.&quot; A TimerTrigger pauses it again after 30
            minutes idle. The total bill at portfolio traffic is on the
            order of $10/month, plus a one-off $100 of Azure for
            Students credit that lasts most of a year.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            5. Two-model A/B
          </h2>
          <p>
            Every chat turn logs the model used, latency, token counts,
            cost estimate, validation outcome, row count, and success
            flag to Azure Table Storage. After roughly a hundred logged
            turns the methodology page will publish:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-[14px]">
            <li>SQL execution success rate, by model</li>
            <li>Schema-grounded vs. hallucinated columns, by model</li>
            <li>Cost-per-correct-answer (tokens × $/M ÷ success rate)</li>
            <li>End-to-end p50/p95 latency, by model</li>
            <li>
              Failure taxonomy: wrong table, missing JOIN, missing date
              filter, missing GROUP BY, syntax error, timeout
            </li>
          </ul>
          <p className="mt-3 text-[13px] italic text-stone-500">
            Comparison results will appear here once the log has enough
            turns to make the differences signal rather than noise.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            6. Why Azure, not AWS
          </h2>
          <p>
            The rest of this portfolio runs on AWS — Bedrock, Amplify,
            CDK Python. This one is deliberately Microsoft-native end to
            end, because clients are multi-cloud and the credible
            argument is <em>which workload belongs where</em>, not which
            cloud is &quot;best.&quot; Azure SQL is the right home for
            tabular relational analytics; Power BI is the right home
            for executive dashboards; Azure OpenAI&apos;s data residency
            posture matters to enterprises that won&apos;t put queries
            through the public OpenAI API. Two clouds, one portfolio.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            7. Stack
          </h2>
          <p>
            Azure SQL Database Serverless · Azure Functions (Flex
            Consumption, Node 22, TypeScript) · Azure OpenAI Service ·
            Anthropic Claude (via SDK from a Key-Vault-managed key) ·
            Power BI Embedded on Fabric F2 · Azure Key Vault · Azure
            Table Storage · Microsoft.Fabric capacity REST · Bicep ·
            <code>mssql</code> · <code>node-sql-parser</code> ·
            Vega-Lite via <code>react-vega</code> ·{" "}
            <code>powerbi-client-react</code> · Cloudflare Turnstile.
            Frontend: Next.js 16 on AWS Amplify, calling the Azure
            Function URL cross-origin.
          </p>
        </div>
      </section>
    </main>
  );
}
