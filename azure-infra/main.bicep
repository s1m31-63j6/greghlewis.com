// AdventureWorks chat-based reporting — main Bicep orchestrator.
//
// What this deploys:
//   - Azure SQL server + serverless DB (auto-pause 60 min)
//   - Storage account + Table Storage for chatlogs + rate-limit counters
//   - Key Vault for the Anthropic API key
//   - Function App (Flex Consumption, Node 22) with Managed Identity
//   - Budget alert + action group at $20/mo
//
// What this does NOT deploy (must be done manually):
//   - bacpac import to load AdventureWorksDW (run scripts/post-deploy.sh after)
//
// Azure OpenAI is disabled until quota is granted on this subscription;
// see the commented `module openAI` block below.
//
// Usage:
//   az deployment group create \
//     -g rg-adventureworks-prod \
//     -f main.bicep \
//     -p main.parameters.json
//
// Outputs end-to-end values needed by the Function and frontend.

targetScope = 'resourceGroup'

@description('Short, unique-per-tenant project prefix. Used for resource names.')
param projectPrefix string = 'awchat'

@description('Region for most resources. Must be in Students sub allowlist (centralus, southcentralus, westus3, canadacentral, eastus).')
param location string = 'eastus'

@description('SQL DB region — sometimes the primary region disallows new SQL provisioning on Students subs. Override here if so.')
param sqlLocation string = location

@description('Greg\'s Entra (Azure AD) Object ID — granted Owner/RBAC on Key Vault for portal access.')
param adminPrincipalObjectId string

@description('Email for budget + kill-switch alerts. External addresses are fine here.')
param alertEmail string

// NOTE: Anthropic API key is intentionally NOT a Bicep parameter. It's
// set out-of-band via `az keyvault secret set` so that future redeploys
// don't overwrite the live key with a parameter-file placeholder.

@description('SQL admin login (used only by deploymentScript that loads the bacpac; not by the app).')
param sqlAdminLogin string = 'awadmin'

@description('SQL admin password. Rotate quarterly. The Function uses Managed Identity, not this password.')
@secure()
param sqlAdminPassword string

@description('Azure OpenAI model deployment name (Function reads from app setting).')
param openAIModelDeployment string = 'gpt-4.1-mini'

@description('Azure OpenAI model name + version.')
param openAIModelName string = 'gpt-4.1-mini'
param openAIModelVersion string = '2025-04-14'

// Suffix to dodge global-name collisions on storage/Key Vault/Function App.
var suffix = toLower(uniqueString(resourceGroup().id))
var names = {
  sqlServer: '${projectPrefix}-sql-v3-${suffix}'
  sqlDb: 'AdventureWorksDW'
  storage: '${projectPrefix}sa${suffix}' // no hyphens; <= 24 chars
  keyVault: '${projectPrefix}-kv-${suffix}'
  openAI: '${projectPrefix}-aoai-${suffix}'
  functionApp: '${projectPrefix}-fn-${suffix}'
  appServicePlan: '${projectPrefix}-plan-${suffix}'
  logAnalytics: '${projectPrefix}-logs-${suffix}'
  appInsights: '${projectPrefix}-appi-${suffix}'
  actionGroup: '${projectPrefix}-alerts'
  budget: '${projectPrefix}-budget'
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    storageAccountName: names.storage
    location: location
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVault'
  params: {
    keyVaultName: names.keyVault
    location: location
    adminPrincipalObjectId: adminPrincipalObjectId
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sql'
  params: {
    serverName: names.sqlServer
    dbName: names.sqlDb
    location: sqlLocation
    adminLogin: sqlAdminLogin
    adminPassword: sqlAdminPassword
  }
}

// Azure OpenAI is DISABLED in v1 — Students subscriptions have 0 TPM
// quota across all gpt-4o-mini SKUs. The AOAI account from an earlier
// deploy attempt still exists in the RG (cost: $0); the deployment
// resource is what we hold off on. Re-enable this module + the
// openAIRbac module + the AOAI_* app settings in function.bicep
// after submitting the quota request at https://aka.ms/oai/quotaincrease
// and getting approval (typical: 1–3 business days).
//
// module openAI 'modules/openai.bicep' = {
//   name: 'openAI'
//   params: {
//     accountName: names.openAI
//     location: location
//     modelDeployment: openAIModelDeployment
//     modelName: openAIModelName
//     modelVersion: openAIModelVersion
//   }
// }

module functionApp 'modules/function.bicep' = {
  name: 'functionApp'
  params: {
    functionAppName: names.functionApp
    planName: names.appServicePlan
    location: location
    storageAccountName: storage.outputs.storageAccountName
    appInsightsName: names.appInsights
    logAnalyticsName: names.logAnalytics
    sqlServerFqdn: sql.outputs.sqlServerFqdn
    sqlDbName: sql.outputs.sqlDbName
    openAIEndpoint: ''
    openAIDeployment: ''
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

// openAIRbac is also disabled until Azure OpenAI quota arrives.

// Grant Function MI → Key Vault secrets read.
module keyVaultRbac 'modules/keyvault-rbac.bicep' = {
  name: 'keyVaultRbac'
  params: {
    keyVaultName: keyVault.outputs.keyVaultName
    functionPrincipalId: functionApp.outputs.principalId
  }
}

// Grant Function MI → Storage account (Table Storage R/W).
module storageRbac 'modules/storage-rbac.bicep' = {
  name: 'storageRbac'
  params: {
    storageAccountName: storage.outputs.storageAccountName
    functionPrincipalId: functionApp.outputs.principalId
  }
}

module monitor 'modules/monitor.bicep' = {
  name: 'monitor'
  params: {
    actionGroupName: names.actionGroup
    budgetName: names.budget
    alertEmail: alertEmail
    monthlyAmount: 20
  }
}

output functionUrl string = functionApp.outputs.functionUrl
output functionAppName string = functionApp.outputs.functionAppName
output functionPrincipalId string = functionApp.outputs.principalId
output sqlServerFqdn string = sql.outputs.sqlServerFqdn
output keyVaultName string = keyVault.outputs.keyVaultName
output storageAccountName string = storage.outputs.storageAccountName
