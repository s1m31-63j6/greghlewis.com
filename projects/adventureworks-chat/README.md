# AdventureWorks Chat-Based Reporting Engine

Project #4 on greghlewis.com — chat-based reporting on Microsoft's
canonical AdventureWorksDW sample warehouse, on Microsoft-native infra
end-to-end. The publishable angle is **"two frontier LLMs go head-to-head
on the canonical text-to-SQL benchmark, on Microsoft's stack"** with
logged metrics over ~100 turns.

## Why this exists

- The other portfolio projects (NFL Comparables, Religious Voices) are
  AWS+Bedrock-native. This one is Azure-native — Azure SQL, Azure
  Functions, Azure OpenAI, Power BI Embedded — so the portfolio shows
  fluency in *both* major enterprise clouds, not zealotry for one.
- AdventureWorksDW is the canonical text-to-SQL target. A fixed,
  well-documented star schema is the friendliest case for an LLM SQL
  generator, which makes it the right project-scale demo of a pattern
  that's genuinely hard in the real world.

## Architecture

```
Browser → Azure Function (Flex Consumption, TypeScript)
            ├─ Managed Identity → Azure SQL (db_datareader on AW)
            ├─ Managed Identity → Azure OpenAI (gpt-4.1-mini)
            ├─ Managed Identity → Key Vault (Anthropic key, PBI SP secret)
            └─ Managed Identity → Microsoft.Fabric (capacity resume/pause)

Power BI Embedded (Fabric F2, paused by default, click-to-launch)
Azure Table Storage (chatlogs for A/B writeup)
Budget alert + kill-switch Logic App at $20/mo
```

Frontend lives in the same Next.js monorepo as the rest of greghlewis.com
(AWS Amplify-hosted) but the chat API is a cross-origin call to the
Azure Function URL.

## Costs at portfolio traffic (~20 chat/day, 5 PBI launches/day)

| Item | Monthly |
|---|---|
| Azure SQL Serverless (~3hr active/day) | ~$2.50 |
| Azure Functions Flex Consumption | $0 |
| Azure OpenAI gpt-4.1-mini | ~$1.50 |
| Anthropic Claude Sonnet 4.6 | ~$2.00 |
| Fabric F2 (~15 hrs active/mo) | ~$5.40 |
| Key Vault + Table Storage + Logs | ~$0.30 |
| **Total** | **~$11.70/mo** |

Azure for Students $100 credit covers ~8 months. Budget alert at $20/mo
with kill-switch Logic App that pauses everything if exceeded.

## Repo layout

```
projects/adventureworks-chat/        # this directory
├── README.md                        # what you're reading
├── GREG_AZURE_SETUP.md              # manual Azure setup (do this first)
└── DEPLOY.md                        # deployment runbook (after setup)

azure-infra/                         # Bicep templates
├── main.bicep
├── sql.bicep
├── openai.bicep
├── function.bicep
├── fabric.bicep
├── keyvault.bicep
├── storage.bicep
└── monitor.bicep

azure-functions/adventureworks/      # Azure Function project (TypeScript)
├── src/functions/                   # HTTP/timer triggers
└── src/lib/                         # shared utilities

src/app/projects/adventureworks-chat/  # Next.js frontend page + components
src/lib/adventureworks/                # shared TypeScript types
```

## Start here

1. Read `GREG_AZURE_SETUP.md` — that's the manual setup nobody else can do
2. Once setup is done, hand the captured IDs back to Claude
3. Claude will run the Bicep deploy and the Function publish
4. Manually author the PBI report in Power BI Desktop
5. `git push origin main` → Amplify auto-deploys the frontend
