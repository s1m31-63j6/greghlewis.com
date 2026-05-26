# Deployment runbook — AdventureWorks Chat

**Prerequisite:** `GREG_AZURE_SETUP.md` complete. You have a tenant,
subscription, `rg-adventureworks-prod`, az CLI logged in, and your
Anthropic API key on hand.

## Phase 1 — Capture your own Object ID

The Bicep needs your Entra Object ID to grant you Key Vault access:

```bash
ADMIN_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
echo $ADMIN_OBJECT_ID
```

Generate the SQL admin password (used during the bacpac import only —
the Function uses Managed Identity at runtime):

```bash
SQL_PWD=$(openssl rand -base64 24)
echo "Save this securely: $SQL_PWD"
```

## Phase 2 — Fill in the parameters

```bash
cp azure-infra/main.parameters.example.json azure-infra/main.parameters.json
```

Edit `azure-infra/main.parameters.json` and replace:
- `adminPrincipalObjectId.value` → output of `$ADMIN_OBJECT_ID`
- `sqlAdminPassword.value` → the `$SQL_PWD` you generated

**Do NOT commit `main.parameters.json`** — it has the SQL admin
password. The `.example.json` is the only one in git.

The Anthropic API key is intentionally NOT a Bicep parameter — it's
loaded into Key Vault out-of-band in Phase 6 so future redeploys can't
overwrite the live key.

## Phase 3 — Deploy infrastructure

```bash
cd azure-infra
az deployment group create \
  -g rg-adventureworks-prod \
  -f main.bicep \
  -p main.parameters.json
```

Expected runtime: ~5–8 min. Common failure modes on the Azure for
Students tier:
- **SQL provisioning blocked in this region** → override with the
  `sqlLocation` parameter. `centralus` works as of last deploy; `eastus`
  and `southcentralus` return `ProvisioningDisabled`.
- **Resource-type blocked region** → Students sub allowlist is
  `centralus`, `southcentralus`, `westus3`, `canadacentral`, `eastus`.

## Phase 4 — Load AdventureWorksDW

`azure-infra/scripts/post-deploy.sh` does this for you:

```bash
echo "$SQL_PWD" > azure-infra/.sql-admin-password   # gitignored
azure-infra/scripts/post-deploy.sh
```

The script captures deploy outputs to `deploy-outputs.json`, downloads
the AdventureWorksDW2022 .bacpac from Microsoft's sample-data repo,
uploads it to a staging container in your storage account, kicks off
the SQL import (~5–10 min), and sets your signed-in user as the AAD
admin on the SQL server.

Verify ~5 min later from Azure Data Studio (or `sqlcmd`):

```sql
SELECT COUNT(*) FROM dbo.FactInternetSales;  -- expect 60398
SELECT COUNT(*) FROM dbo.DimCustomer;        -- expect ~18484
```

## Phase 5 — Wire the Function MI into Azure SQL

The Function authenticates as its Managed Identity. SQL needs a
contained user that maps to that MI and gets `db_datareader`.

```bash
FUNCTION_NAME=$(jq -r .functionAppName.value azure-infra/deploy-outputs.json)
SQL_SERVER=$(jq -r .sqlServerFqdn.value azure-infra/deploy-outputs.json | sed 's/\.database\.windows\.net//')

# Connect to the AdventureWorksDW database WITH AAD auth and run:
sqlcmd -S "${SQL_SERVER}.database.windows.net" \
  -d AdventureWorksDW \
  -G \
  -Q "CREATE USER [${FUNCTION_NAME}] FROM EXTERNAL PROVIDER; \
      ALTER ROLE db_datareader ADD MEMBER [${FUNCTION_NAME}]; \
      GRANT VIEW DEFINITION TO [${FUNCTION_NAME}];"
```

## Phase 6 — Load the Anthropic API key into Key Vault

```bash
KV_NAME=$(jq -r .keyVaultName.value azure-infra/deploy-outputs.json)
az keyvault secret set \
  --vault-name $KV_NAME \
  --name anthropic-api-key \
  --value <YOUR_ANTHROPIC_KEY>
```

Rotation note: after updating this secret, the running Function still
holds the old key in module-scope cache. On Flex Consumption you need
`az functionapp stop` then `start` (not just `restart`) to evict warm
instances.

## Phase 7 — Set the Turnstile secret

If you're using Cloudflare Turnstile in front of the chat endpoint,
set the server-side secret:

```bash
az functionapp config appsettings set \
  --name $FUNCTION_NAME \
  --resource-group rg-adventureworks-prod \
  --settings TURNSTILE_SECRET_KEY=<your Cloudflare Turnstile secret>
```

The matching public site key goes on the frontend in Phase 9.

## Phase 8 — Deploy the Function code

```bash
cd azure-functions/adventureworks
npm install
npm run build
func azure functionapp publish $FUNCTION_NAME --typescript
```

## Phase 9 — Wire the frontend

Add Function URL + Turnstile site key to Amplify environment variables
(via the Amplify console for app `dhpo309lbx6w7`):

```
NEXT_PUBLIC_ADVENTUREWORKS_FUNCTION_URL=<functionUrl from deploy-outputs.json>
NEXT_PUBLIC_ADVENTUREWORKS_TURNSTILE_SITEKEY=<your Cloudflare Turnstile site key>
```

Trigger an Amplify rebuild:

```bash
aws amplify start-job \
  --app-id dhpo309lbx6w7 \
  --branch-name main \
  --job-type RELEASE \
  --profile portfolio
```

## Phase 10 — Smoke test

```bash
FN_URL=$(jq -r .functionUrl.value azure-infra/deploy-outputs.json)

curl -N -X POST $FN_URL/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "top 5 product categories by 2013 internet sales",
    "model": "claude",
    "history": [],
    "turnstile_token": "1x00000000000000000000AA"
  }'
```

The Turnstile token `1x00000000000000000000AA` is Cloudflare's
"always passes" testing token — works only when the matching
`TURNSTILE_SECRET_KEY` is also the test secret.

Then open https://greghlewis.com/projects/adventureworks-chat in the
browser and run a real query end-to-end.

## Phase 11 — Verify cost guardrails

```bash
# Check budget burn
az consumption usage list --top 5 -o table

# Confirm the SQL DB is in auto-pause mode (should suspend after 60 min idle)
az sql db show \
  --resource-group rg-adventureworks-prod \
  --server $SQL_SERVER \
  --name AdventureWorksDW \
  --query 'autoPauseDelay' -o tsv
# expect: 60
```

## Rollback

```bash
# Pause the SQL DB immediately (lowest serverless tier)
az sql db update \
  --resource-group rg-adventureworks-prod \
  --server $SQL_SERVER \
  --name AdventureWorksDW \
  --min-capacity 0.5

# Nuclear option: delete the whole RG
az group delete -n rg-adventureworks-prod --yes
```
