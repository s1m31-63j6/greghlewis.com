# AdventureWorks Chat-Based Reporting Engine

Project #4 on greghlewis.com — chat-based reporting on Microsoft's
canonical AdventureWorksDW sample warehouse, on Microsoft-native infra
end-to-end. The publishable angle is **"two frontier LLMs go head-to-head
on the canonical text-to-SQL benchmark, on Microsoft's stack"** — Claude
Sonnet 4.6 is live; the Azure OpenAI side of the A/B is pending quota.

## Why this exists

- The other portfolio projects (NFL Comparables, Religious Voices) are
  AWS+Bedrock-native. This one is Azure-native — Azure SQL, Azure
  Functions, Azure Key Vault, Managed Identity end-to-end — so the
  portfolio shows fluency in *both* major enterprise clouds, not zealotry
  for one.
- AdventureWorksDW is the canonical text-to-SQL target. A fixed,
  well-documented star schema is the friendliest case for an LLM SQL
  generator, which makes it the right project-scale demo of a pattern
  that's genuinely hard in the real world.

## Architecture

```
Browser → Azure Function (Flex Consumption, TypeScript)
            ├─ Managed Identity → Azure SQL (db_datareader on AW)
            └─ Managed Identity → Key Vault (Anthropic API key)

Frontend: react-plotly.js renders the model-emitted figure spec
Azure Table Storage: chatlogs + rate-limit counters
Cloudflare Turnstile: bot challenge in front of the chat endpoint
Budget alert at $20/mo (email-only; manual intervention from there)
```

Frontend lives in the same Next.js monorepo as the rest of greghlewis.com
(AWS Amplify-hosted) but the chat API is a cross-origin call to the
Azure Function URL.

Power BI Embedded was the original visualization layer; it was scoped
out before v1 ship because both viable SKUs were blocked on this
subscription/tenant. See §4 of the methodology page for the full
explanation. Plotly stands in.

## Costs at portfolio traffic (~20 chats/day)

| Item | Monthly |
|---|---|
| Azure SQL Serverless (auto-pause 60 min) | ~$2.50 |
| Azure Functions Flex Consumption | $0 (scale-to-zero) |
| Anthropic Claude Sonnet 4.6 | ~$2–4 |
| Key Vault + Table Storage + Logs | ~$0.30 |
| **Total** | **~$5–8/mo** |

Azure for Students $100 credit covers ~12+ months at this rate. Budget
alert at $20/mo sends email at 80% and 100% of cap.

## Repo layout

```
projects/adventureworks-chat/        # this directory
├── README.md                        # what you're reading
├── GREG_AZURE_SETUP.md              # manual Azure prerequisites
└── DEPLOY.md                        # deployment runbook

azure-infra/                         # Bicep templates
├── main.bicep
└── modules/
    ├── sql.bicep
    ├── openai.bicep                 # disabled until quota lands
    ├── function.bicep
    ├── keyvault.bicep
    ├── storage.bicep
    └── monitor.bicep

azure-functions/adventureworks/      # Azure Function project (TypeScript)
├── src/functions/chat.ts            # the only HTTP trigger
└── src/lib/                         # shared utilities (Claude client,
                                     #   SQL client + validator, schema,
                                     #   prompts, few-shots, rate limit,
                                     #   Turnstile, SSE)

src/app/projects/adventureworks-chat/  # Next.js frontend page + components
src/lib/adventureworks/                # shared TypeScript types
```

## Start here

1. Read `GREG_AZURE_SETUP.md` — manual Azure prerequisites (subscription,
   `az` CLI, providers)
2. Follow `DEPLOY.md` for the Bicep deploy + Function publish + bacpac
   import
3. `git push origin main` → Amplify auto-deploys the frontend
