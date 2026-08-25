import type { Metadata } from "next";
import Link from "next/link";
import WantMore from "@/app/_subscribe/WantMore";

export const metadata: Metadata = {
  title: "AdventureWorks Chat — Methodology · Greg Lewis",
  description:
    "Architecture, prompt design, SQL validation, and design tradeoffs for a chat-based reporting engine on Microsoft's AdventureWorksDW sample warehouse.",
};

export default function Methodology() {
  return (
    <main className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <nav className="mb-8 flex items-center justify-between gap-4">
        <Link
          href="/projects/adventureworks-chat"
          className="text-xs uppercase tracking-wider text-stone-500 hover:text-stone-900 transition"
        >
          ← Back to chat
        </Link>
        <WantMore project="adventureworks-chat" />
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl text-stone-900 leading-tight">
          Methodology
        </h1>
        <p className="mt-3 text-stone-600 text-base leading-relaxed">
          How the AdventureWorks chat-based reporting engine works, what
          design choices it made, and which ones were forced by the
          subscription constraints it was built within.
        </p>
      </header>

      <section className="space-y-8 text-stone-700 text-[15px] leading-relaxed">
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
            two stages per chat turn. Stage A generates T-SQL from a
            ~2K-token schema digest plus five canonical few-shot
            examples; stage B re-prompts the same model with the result
            rows for a narrative and a Plotly figure spec. The
            Function&apos;s system-assigned Managed Identity is the
            principal everywhere: it authenticates to Azure SQL (added
            as a contained <code>db_datareader</code> user), to Key
            Vault (which holds the Anthropic API key), and to Azure
            Table Storage (chat logs + per-IP rate limit counters).
            Nothing is a long-lived secret in code.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            3. SQL safety
          </h2>
          <p>
            Even with a read-only database user, every generated query
            goes through an AST check before execution: the statement
            must parse as a single <code>SELECT</code> against the
            AdventureWorksDW allowlist of dimension and fact tables,
            must include a <code>TOP</code>/<code>LIMIT</code> cap of
            500 rows, and is denied if it touches{" "}
            <code>xp_*</code>, <code>sys.*</code>,{" "}
            <code>OPENROWSET</code>, or chains multiple statements.
            <code>node-sql-parser</code> with the T-SQL dialect powers
            the check. If execution still fails (e.g. a CTE alias
            mistake — see &sect;6), the Function sends the error back
            to the model and asks for a one-shot repair before
            surfacing the failure.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            4. Visualization
          </h2>
          <p>
            On the second prompt the model emits a Plotly figure spec
            — a JSON object with <code>data</code> traces and a{" "}
            <code>layout</code> — chosen for the column types of the
            result set. The React UI renders it with{" "}
            <code>react-plotly.js</code>, which gives hover, click-zoom,
            pan, and legend toggling for free. The table beside it is
            sortable and free-text filterable. The chart prompt
            constrains the model to a small palette and forbids dual
            y-axes with mismatched scales (see &sect;6 for why), so the
            visual story stays legible even on adversarial result sets.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            5. Cost engineering
          </h2>
          <p>
            Azure SQL is on the Serverless GP tier with a 60-minute
            auto-pause: idle storage costs ~$2.50/mo, compute is
            billed only while the warehouse is responding to queries.
            Functions are Flex Consumption — scale-to-zero with
            working HTTP streaming. The total monthly bill at
            portfolio traffic (~20 queries/day) lands around $5–8,
            covered for ~12 months by the $100 Azure for Students
            credit. A budget alert at $20/mo is wired through Action
            Groups as a kill-switch trigger.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            6. Bug taxonomy from the build
          </h2>
          <p>
            Three real classes of LLM-emitted SQL bug surfaced during
            development and were fixed via prompt + validator changes:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1.5 text-[14px]">
            <li>
              <strong>CTE name confused with allowlist.</strong>{" "}
              <code>node-sql-parser&apos;s</code> table extractor
              returns CTE references with the same shape as real
              tables. The validator now extracts CTE names from the
              AST and exempts them from the allowlist check.
            </li>
            <li>
              <strong>CTE column reference broken downstream.</strong>{" "}
              The model would write{" "}
              <code>WITH yearly AS (SELECT d.CalendarYear AS Year ...)</code>{" "}
              and then a subquery referring to <code>CalendarYear</code>{" "}
              on the CTE — which has no such column, only{" "}
              <code>Year</code>. Hardened the SQL prompt with an
              explicit CTE-alias-discipline section + a right/wrong
              example.
            </li>
            <li>
              <strong>Outlier-distorted chart.</strong> Year-over-year
              queries on a partial first year (~$43K) made the 2011
              YoY growth +16,000% and dominated the dual-axis chart.
              The chart prompt now forbids dual y-axes with &gt;30:1
              scale mismatches, and instructs the model to either drop
              the percentage trace or filter incomplete-period rows.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            7. Two-model A/B (planned)
          </h2>
          <p>
            The project was scoped for a head-to-head between Azure
            OpenAI and Anthropic Claude on the same workload. Azure
            OpenAI quota also came back as 0 across every gpt-4o-mini
            SKU on the Students subscription, so the live build runs
            <strong> Claude Sonnet 4.6</strong> only for now. Every
            chat turn still logs model id, latency, token counts, cost
            estimate, validation outcome, row count, and success flag
            to Azure Table Storage — once the Azure OpenAI quota lifts
            and the second model is wired in, the methodology page
            will publish:
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
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            8. Why Azure, not AWS
          </h2>
          <p>
            The rest of this portfolio runs on AWS — Bedrock, Amplify,
            CDK Python. This project is deliberately Microsoft-native
            end to end, because clients are multi-cloud and the
            credible argument is <em>which workload belongs where</em>,
            not which cloud is &quot;best.&quot; Azure SQL is the
            right home for tabular relational analytics; Azure
            Functions with Managed Identity is a clean fit for a thin
            orchestration layer with zero-secret data-plane access.
            The frontend continues to live on AWS Amplify (same
            Next.js monorepo as the rest of the site) and calls the
            Azure Function URL cross-origin. Two clouds, one
            portfolio.
          </p>
        </div>

        <div>
          <h2 className="text-stone-900 font-serif text-xl mb-2">
            9. Stack
          </h2>
          <p>
            Azure SQL Database Serverless · Azure Functions (Flex
            Consumption, Node 22, TypeScript) · Anthropic Claude
            Sonnet 4.6 (via SDK from a Key-Vault-managed key) · Azure
            Key Vault · Azure Table Storage · Bicep · <code>mssql</code>{" "}
            · <code>node-sql-parser</code> · Plotly.js via{" "}
            <code>react-plotly.js</code> · Cloudflare Turnstile.
            Frontend: Next.js 16 on AWS Amplify, calling the Azure
            Function URL cross-origin.
          </p>
        </div>
      </section>
    </main>
  );
}
