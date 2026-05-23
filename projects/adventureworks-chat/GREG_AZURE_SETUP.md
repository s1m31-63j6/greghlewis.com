# Greg — Azure setup checklist (one afternoon)

This is what only you can do. Everything else (code, Bicep, Function deploys)
is written and waiting on these IDs. Block on Phase 1; Phases 2–4 then unblock
the rest of the build.

## Phase 1 — Apply for Azure for Students

1. Open https://azure.microsoft.com/free/students in an incognito window
   (so it doesn't pick up any Elevator-related Azure session).
2. Sign in with your BYU email. SheerID verifies enrollment automatically.
   No credit card required.
3. You get:
   - ~$100 credit, no expiration as long as the verification stays current
   - 12 months free tier on 25+ services (SQL Database basic tier,
     Functions consumption, Key Vault ops, App Service F1, etc.)
4. This automatically creates a new **Azure AD tenant** in your name.
   That tenant is the portfolio-isolation analog to your AWS Organizations
   setup — blast-radius-isolated from anything Elevator-related.

**Captures from Phase 1 (write these down):**
- [ ] Tenant ID (from `https://entra.microsoft.com` → Overview)
- [ ] Tenant domain (e.g. `greghlewisbyu.onmicrosoft.com`)
- [ ] Subscription ID (from `https://portal.azure.com` → Subscriptions)
- [ ] Subscription name (probably "Azure for Students")

## Phase 2 — Install local tooling

On your Mac:

```bash
brew install azure-cli
brew tap azure/functions
brew install azure-functions-core-tools@4
az bicep install
az bicep upgrade
```

Verify:

```bash
az --version       # azure-cli ≥ 2.60
func --version     # 4.x
bicep --version    # ≥ 0.30
```

## Phase 3 — Log in + select subscription

```bash
az login --tenant <TENANT_ID_FROM_PHASE_1>
az account set --subscription <SUBSCRIPTION_ID_FROM_PHASE_1>
az account show         # confirm correct tenant + subscription
```

Optional: create a named CLI profile so future commands always hit this
subscription without an active subscription guess:

```bash
echo 'export AZURE_SUBSCRIPTION_ID="<SUBSCRIPTION_ID>"' >> ~/.zshrc
```

## Phase 4 — Register resource providers + create resource group

```bash
az provider register --namespace Microsoft.Sql
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.CognitiveServices     # Azure OpenAI
az provider register --namespace Microsoft.Fabric                 # F-SKU capacity
az provider register --namespace Microsoft.KeyVault
az provider register --namespace Microsoft.Storage
az provider register --namespace Microsoft.Insights

az group create -n rg-adventureworks-prod -l eastus2
```

`eastus2` chosen because it has Azure OpenAI capacity at the Students tier
AND it is the lowest-latency Azure region to the Amplify Lambda's
us-east-1 (cross-cloud latency matters less here since the Lambda is not
the orchestrator, but the same region rationale still applies for any
future migration).

## Phase 5 — Power BI Pro license

Power BI Pro is **free** for students with an MS365 A1 license (BYU
provides this). Sign in at https://app.powerbi.com with your BYU account
and confirm you can create a workspace. If your BYU tenant is locked
down and won't let you create one, skip this — we'll fall back to a
trial in the new portfolio tenant.

Create a workspace named `AdventureWorks Demo` (we'll publish exactly
one report there in a later phase).

## Phase 6 — Anthropic API key

This project does A/B between Azure OpenAI and Claude. The Function will
need an Anthropic API key (separate from your existing one if you want
clean per-project cost tracking).

- Console: https://console.anthropic.com
- Generate a new key labeled `adventureworks-chat-prod`
- Set a workspace spend limit (recommended: $10/mo to start)
- Save it — we'll put it in Key Vault, not in a file.

## Hand back to Claude

When Phases 1–6 are done, drop these values into the next conversation:

```
TENANT_ID=
TENANT_DOMAIN=
SUBSCRIPTION_ID=
RESOURCE_GROUP=rg-adventureworks-prod
LOCATION=eastus2
PBI_WORKSPACE_NAME=AdventureWorks Demo
ANTHROPIC_API_KEY_AVAILABLE=yes/no
```

Claude will use those to parameterize the Bicep deploy and the Function
app settings, and then walk you through `az deployment group create`.

## What this costs you (Phase 1–6 only)

$0. Nothing in Phase 1–6 provisions paid resources. The meter only
starts when you run the Bicep deploy in the next phase.
