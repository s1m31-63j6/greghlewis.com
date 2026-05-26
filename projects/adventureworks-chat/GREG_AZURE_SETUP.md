# Greg — Azure setup checklist (one afternoon)

This is what only you can do. Everything else (Bicep, Function code) is
written and waiting on the values captured below.

## Phase 1 — Apply for Azure for Students

1. Open https://azure.microsoft.com/free/students in an incognito window
   (so it doesn't pick up any Elevator-related Azure session).
2. Sign in with your BYU email. SheerID verifies enrollment automatically.
   No credit card required.
3. You get:
   - ~$100 credit, no expiration as long as the verification stays current
   - 12 months free tier on 25+ services (SQL Database basic tier,
     Functions consumption, Key Vault ops, App Service F1, etc.)
4. The subscription lives **inside the existing BYU tenant**
   (`byu.onmicrosoft.com`). The subscription itself is the blast-radius
   boundary — Students subs cannot bill BYU's card, so anything that
   goes wrong is capped at the credit.

**Captures from Phase 1 (write these down):**
- [ ] Subscription ID (from `https://portal.azure.com` → Subscriptions)
- [ ] Subscription name ("Azure for Students")

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
az login --tenant <BYU_TENANT_ID>   # c6fc6e9b-51fb-48a8-b779-9ee564b40413
az account set --subscription <SUBSCRIPTION_ID_FROM_PHASE_1>
az account show         # confirm correct tenant + subscription
```

## Phase 4 — Register resource providers + create resource group

```bash
az provider register --namespace Microsoft.Sql
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.CognitiveServices   # Azure OpenAI (disabled until quota lands)
az provider register --namespace Microsoft.KeyVault
az provider register --namespace Microsoft.Storage
az provider register --namespace Microsoft.Insights

az group create -n rg-adventureworks-prod -l eastus
```

Region notes for the Students tier (don't fight these — they're
empirical from prior deploy attempts):

- Resource provisioning is blocked outside this allowlist: `centralus`,
  `southcentralus`, `westus3`, `canadacentral`, `eastus`.
- SQL Database specifically further restricts to `centralus` and
  `canadacentral` reliably; `eastus` and `southcentralus` return
  `ProvisioningDisabled`. Override `sqlLocation` in
  `main.parameters.json` if needed.
- Azure OpenAI quota is `0` across every gpt-4o-mini / gpt-4.1-mini /
  gpt-3.5 SKU on this subscription. Live build runs Claude only; the
  A/B is pending a quota grant.

## Phase 5 — Anthropic API key

This project will A/B between Azure OpenAI and Claude once OpenAI quota
lands. For now Claude is the only live model.

- Console: https://console.anthropic.com
- Generate a new key labeled `adventureworks-chat-prod`
- Set a workspace spend limit (recommended: $10/mo to start)
- Save it — we'll put it in Key Vault in DEPLOY.md Phase 6, not in a
  file.

## What this costs you (Phase 1–5 only)

$0. Nothing here provisions paid resources. The meter only starts when
you run the Bicep deploy in `DEPLOY.md`.
