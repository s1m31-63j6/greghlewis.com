#!/usr/bin/env bash
# Runs after `az deployment group create` succeeds. Captures deploy
# outputs, pauses Fabric (stops the $0.36/hr meter), loads
# AdventureWorksDW from Microsoft's sample .bacpac, and wires the
# Function MI as a contained db_datareader user.
#
# Idempotent where possible. Re-run safely after fixing failures.

set -euo pipefail

RG="${RG:-rg-adventureworks-prod}"
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-awchat-main}"
SQL_PASSWORD_FILE="${SQL_PASSWORD_FILE:-$(dirname "$0")/../.sql-admin-password}"
OUTPUTS_FILE="$(dirname "$0")/../deploy-outputs.json"

echo "==> Capturing deploy outputs"
az deployment group show -g "$RG" -n "$DEPLOYMENT_NAME" \
  --query properties.outputs -o json > "$OUTPUTS_FILE"
cat "$OUTPUTS_FILE"

# Pluck values we need
FUNCTION_NAME=$(jq -r '.functionAppName.value' "$OUTPUTS_FILE")
FUNCTION_URL=$(jq -r '.functionUrl.value' "$OUTPUTS_FILE")
SQL_SERVER_FQDN=$(jq -r '.sqlServerFqdn.value' "$OUTPUTS_FILE")
SQL_SERVER=$(echo "$SQL_SERVER_FQDN" | sed 's/\.database\.windows\.net//')
FABRIC_NAME=$(jq -r '.fabricCapacityName.value' "$OUTPUTS_FILE")
STORAGE_ACCOUNT=$(jq -r '.storageAccountName.value' "$OUTPUTS_FILE")
KEY_VAULT=$(jq -r '.keyVaultName.value' "$OUTPUTS_FILE")

echo "==> Pausing Fabric capacity to stop the $0.36/hr meter"
az resource invoke-action \
  --resource-group "$RG" \
  --resource-type Microsoft.Fabric/capacities \
  --name "$FABRIC_NAME" \
  --action suspend \
  --api-version 2023-11-01 || echo "(suspend may have failed if already paused — continuing)"

echo "==> Downloading AdventureWorksDW2022 .bacpac"
BACPAC_PATH="/tmp/AdventureWorksDW2022.bacpac"
if [ ! -f "$BACPAC_PATH" ]; then
  curl -L -o "$BACPAC_PATH" \
    "https://github.com/microsoft/sql-server-samples/releases/download/adventureworks/AdventureWorksDW2022.bacpac"
fi

echo "==> Uploading bacpac to staging container"
az storage container create \
  --account-name "$STORAGE_ACCOUNT" \
  --name bacpac-staging \
  --auth-mode login \
  --only-show-errors || true

az storage blob upload \
  --account-name "$STORAGE_ACCOUNT" \
  --container-name bacpac-staging \
  --name AdventureWorksDW.bacpac \
  --file "$BACPAC_PATH" \
  --auth-mode login \
  --overwrite \
  --only-show-errors

echo "==> Generating SAS URL for the bacpac (valid 2 hours)"
EXPIRY=$(date -u -v+2H '+%Y-%m-%dT%H:%MZ' 2>/dev/null || date -u -d '+2 hours' '+%Y-%m-%dT%H:%MZ')
SAS=$(az storage blob generate-sas \
  --account-name "$STORAGE_ACCOUNT" \
  --container-name bacpac-staging \
  --name AdventureWorksDW.bacpac \
  --permissions r \
  --expiry "$EXPIRY" \
  --auth-mode login \
  --as-user \
  -o tsv)
BACPAC_URL="https://${STORAGE_ACCOUNT}.blob.core.windows.net/bacpac-staging/AdventureWorksDW.bacpac"

echo "==> Importing bacpac into Azure SQL (this takes ~5–10 min)"
SQL_PASSWORD=$(cat "$SQL_PASSWORD_FILE")
az sql db import \
  --server "$SQL_SERVER" \
  --resource-group "$RG" \
  --name AdventureWorksDW \
  --admin-user awadmin \
  --admin-password "$SQL_PASSWORD" \
  --storage-key-type SharedAccessKey \
  --storage-key "?$SAS" \
  --storage-uri "$BACPAC_URL"

echo "==> Setting current user as AAD admin on SQL server"
ADMIN_DISPLAY=$(az account show --query user.name -o tsv)
ADMIN_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
az sql server ad-admin create \
  --server "$SQL_SERVER" \
  --resource-group "$RG" \
  --display-name "$ADMIN_DISPLAY" \
  --object-id "$ADMIN_OBJECT_ID" || echo "(AAD admin may already be set — continuing)"

echo
echo "✓ Phase done. Next steps (manual or sqlcmd):"
echo
echo "  1. Connect to ${SQL_SERVER}.database.windows.net / AdventureWorksDW with AAD auth and run:"
echo "     CREATE USER [${FUNCTION_NAME}] FROM EXTERNAL PROVIDER;"
echo "     ALTER ROLE db_datareader ADD MEMBER [${FUNCTION_NAME}];"
echo
echo "  2. From azure-functions/adventureworks, deploy the Function:"
echo "     func azure functionapp publish ${FUNCTION_NAME} --typescript"
echo
echo "  3. Function URL (paste into Amplify env as NEXT_PUBLIC_ADVENTUREWORKS_FUNCTION_URL):"
echo "     ${FUNCTION_URL}"
echo
echo "  4. Update Key Vault with the real Anthropic key:"
echo "     az keyvault secret set --vault-name ${KEY_VAULT} --name anthropic-api-key --value <YOUR_KEY>"
