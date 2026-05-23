# Deployment runbook — AdventureWorks Chat

**Prerequisite:** `GREG_AZURE_SETUP.md` Phases 1–6 complete. You have a
tenant, subscription, `rg-adventureworks-prod`, az CLI logged in, and
your Anthropic API key on hand.

## Phase 7 — Capture your own Object ID

The Bicep needs your Entra Object ID to grant you Key Vault access:

```bash
ADMIN_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
echo $ADMIN_OBJECT_ID
```

Generate the SQL admin password (you'll reuse it during the bacpac
import only — the Function uses Managed Identity at runtime):

```bash
SQL_PWD=$(openssl rand -base64 24)
echo "Save this securely: $SQL_PWD"
```

## Phase 8 — Fill in the parameters

```bash
cp azure-infra/main.parameters.example.json azure-infra/main.parameters.json
```

Edit `azure-infra/main.parameters.json` and replace:
- `adminPrincipalObjectId.value` → output of `$ADMIN_OBJECT_ID`
- `anthropicApiKey.value` → the Anthropic key you generated
- `sqlAdminPassword.value` → the `$SQL_PWD` you generated

**Do NOT commit `main.parameters.json`** — it has secrets. The
`.example.json` is the only one in git.

## Phase 9 — Deploy infrastructure

```bash
cd azure-infra
az deployment group create \
  -g rg-adventureworks-prod \
  -f main.bicep \
  -p main.parameters.json
```

Expected runtime: ~8–12 min. Failure modes:
- **OpenAI access denied** → apply at https://aka.ms/oai/access, wait
  ~24h for approval, retry.
- **Fabric capacity quota** → Students tier may require a quota
  increase request. Check `az feature list --namespace Microsoft.Fabric`.
- **SQL serverless not available** → try a different region (`westus3`,
  `northeurope`).

Outputs you'll need:

```bash
az deployment group show -g rg-adventureworks-prod -n main \
  --query properties.outputs -o json > deploy-outputs.json
cat deploy-outputs.json
```

Save: `functionUrl`, `functionAppName`, `sqlServerFqdn`,
`fabricCapacityName`, `keyVaultName`, `storageAccountName`.

## Phase 10 — Load AdventureWorksDW

Download the bacpac:

```bash
curl -L -o /tmp/AdventureWorksDW.bacpac \
  "https://github.com/microsoft/sql-server-samples/releases/download/adventureworks/AdventureWorksDW2022.bacpac"
```

Upload it to a temp blob container in your storage account, then import:

```bash
STORAGE_ACCOUNT=$(jq -r .storageAccountName.value deploy-outputs.json)
SQL_SERVER=$(jq -r .sqlServerFqdn.value deploy-outputs.json | sed 's/\.database\.windows\.net//')

az storage container create \
  --account-name $STORAGE_ACCOUNT \
  --name bacpac-staging \
  --auth-mode login

az storage blob upload \
  --account-name $STORAGE_ACCOUNT \
  --container-name bacpac-staging \
  --name AdventureWorksDW.bacpac \
  --file /tmp/AdventureWorksDW.bacpac \
  --auth-mode login

# Generate a SAS URL valid for 2 hours
SAS_URL=$(az storage blob generate-sas \
  --account-name $STORAGE_ACCOUNT \
  --container-name bacpac-staging \
  --name AdventureWorksDW.bacpac \
  --permissions r \
  --expiry $(date -u -v+2H '+%Y-%m-%dT%H:%MZ') \
  --auth-mode login \
  --as-user \
  --full-uri \
  -o tsv)

az sql db import \
  --server $SQL_SERVER \
  --resource-group rg-adventureworks-prod \
  --name AdventureWorksDW \
  --admin-user awadmin \
  --admin-password "$SQL_PWD" \
  --storage-key-type SharedAccessKey \
  --storage-key "?${SAS_URL#*\?}" \
  --storage-uri "${SAS_URL%%\?*}"
```

Verify ~5 min later from Azure Data Studio (or `sqlcmd`):

```sql
SELECT COUNT(*) FROM dbo.FactInternetSales;  -- expect 60398
SELECT COUNT(*) FROM dbo.DimCustomer;        -- expect ~18484
```

## Phase 11 — Wire the Function MI into Azure SQL

The Function authenticates as its Managed Identity. SQL needs a
contained user that maps to that MI and gets `db_datareader`.

```bash
FUNCTION_NAME=$(jq -r .functionAppName.value deploy-outputs.json)
FUNCTION_MI=$FUNCTION_NAME  # contained user name matches Function App name

# Set yourself as the AAD admin on the SQL server (one-time):
az sql server ad-admin create \
  --server $SQL_SERVER \
  --resource-group rg-adventureworks-prod \
  --display-name "$(az account show --query user.name -o tsv)" \
  --object-id $ADMIN_OBJECT_ID

# Then connect to the AdventureWorksDW database WITH AAD auth and run:
sqlcmd -S "${SQL_SERVER}.database.windows.net" \
  -d AdventureWorksDW \
  -G \
  -Q "CREATE USER [${FUNCTION_MI}] FROM EXTERNAL PROVIDER; \
      ALTER ROLE db_datareader ADD MEMBER [${FUNCTION_MI}]; \
      GRANT VIEW DEFINITION TO [${FUNCTION_MI}];"
```

## Phase 12 — Pause Fabric capacity (default state should be off)

```bash
FABRIC_NAME=$(jq -r .fabricCapacityName.value deploy-outputs.json)
az resource invoke-action \
  --resource-group rg-adventureworks-prod \
  --resource-type Microsoft.Fabric/capacities \
  --name $FABRIC_NAME \
  --action suspend \
  --api-version 2023-11-01
```

Confirm:

```bash
az resource show \
  --resource-group rg-adventureworks-prod \
  --resource-type Microsoft.Fabric/capacities \
  --name $FABRIC_NAME \
  --query 'properties.state' -o tsv
# expect: Paused
```

## Phase 13 — Author the Power BI report (manual, Power BI Desktop)

1. Install Power BI Desktop (free) if you don't have it.
2. Connect to `<sql_server>.database.windows.net` →
   AdventureWorksDW with your AAD account.
3. Build the "Internet Sales Overview" report with these pages:
   - Sales by Year and Country (clustered bar)
   - Sales by Product Category (donut + table)
   - Customer demographics summary (cards + bar)
4. Publish to your workspace named "AdventureWorks Demo".
5. From `app.powerbi.com` → workspace → report, capture the URL fragments:
   - **workspace ID** = the GUID after `/groups/`
   - **report ID** = the GUID after `/reports/`

## Phase 14 — Create the Power BI service principal

```bash
PBI_SP=$(az ad sp create-for-rbac --name "sp-aw-pbi" --skip-assignment -o json)
echo $PBI_SP
# Save: appId (client_id), password (client_secret), tenant
```

In `app.powerbi.com`:
- Workspace → Manage access → add the SP (use its `appId`) as **Member**.
- Tenant settings (admin) → Developer settings → enable
  "Service principals can use Power BI APIs" and add the SP.

Store the SP secret in Key Vault:

```bash
KV_NAME=$(jq -r .keyVaultName.value deploy-outputs.json)
az keyvault secret set \
  --vault-name $KV_NAME \
  --name pbi-sp-secret \
  --value "$(echo $PBI_SP | jq -r .password)"
```

## Phase 15 — Set Function app settings for PBI

```bash
az functionapp config appsettings set \
  --name $FUNCTION_NAME \
  --resource-group rg-adventureworks-prod \
  --settings \
    AW_PBI_WORKSPACE_ID=<workspace_id_from_phase_13> \
    AW_PBI_REPORT_ID=<report_id_from_phase_13> \
    AW_PBI_SP_CLIENT_ID=$(echo $PBI_SP | jq -r .appId) \
    AW_PBI_SP_TENANT_ID=$(echo $PBI_SP | jq -r .tenant) \
    AW_PBI_SP_SECRET_NAME=pbi-sp-secret
```

## Phase 16 — Deploy the Function code

```bash
cd azure-functions/adventureworks
npm install
npm run build
func azure functionapp publish $FUNCTION_NAME --typescript
```

## Phase 17 — Wire the frontend

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

## Phase 18 — Smoke test

```bash
FN_URL=$(jq -r .functionUrl.value deploy-outputs.json)

# Chat smoke test
curl -N -X POST $FN_URL/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "top 5 product categories by 2013 internet sales",
    "model": "azure-openai",
    "history": [],
    "turnstile_token": "1x00000000000000000000AA"
  }'

# PBI resume smoke test
curl -X POST $FN_URL/pbi/resume
# Poll status every 5s
while true; do
  curl -s $FN_URL/pbi/status | jq
  sleep 5
done
# Expect state: Paused → Resuming → Active over ~60–90s
```

Then open https://greghlewis.com/projects/adventureworks-chat in the
browser and run a real query end-to-end.

## Phase 19 — Verify cost guardrails

```bash
# Wait 35 min idle, then check Fabric state
az resource show \
  --resource-group rg-adventureworks-prod \
  --resource-type Microsoft.Fabric/capacities \
  --name $FABRIC_NAME \
  --query 'properties.state' -o tsv
# expect: Paused (auto-pause timer fired)

# Check budget burn
az consumption usage list --top 5 -o table
```

## Rollback

If anything goes wrong:

```bash
# Pause all paid resources immediately
az resource invoke-action \
  --resource-group rg-adventureworks-prod \
  --resource-type Microsoft.Fabric/capacities \
  --name $FABRIC_NAME \
  --action suspend \
  --api-version 2023-11-01

az sql db update \
  --resource-group rg-adventureworks-prod \
  --server $SQL_SERVER \
  --name AdventureWorksDW \
  --min-capacity 0

# Nuclear option: delete the whole RG
az group delete -n rg-adventureworks-prod --yes
```
