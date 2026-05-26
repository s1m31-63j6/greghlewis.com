// AdventureWorks chat-based reporting — main Bicep orchestrator.
//
// What this deploys:
//   - Azure SQL server + serverless DB (auto-pause 60 min)
//   - Azure OpenAI resource + gpt-4.1-mini deployment
//   - Storage account + Table Storage for chatlogs + rate-limit counters
//   - Key Vault for Anthropic API key + Power BI SP secret
//   - Function App (Flex Consumption, Node 22) with Managed Identity
//   - Fabric F2 capacity (provisioned PAUSED by default)
//   - Budget alert + action group at $20/mo with kill-switch Logic App
//
// What this does NOT deploy (must be done manually):
//   - Power BI workspace + report (authored in Power BI Desktop, published)
//   - AAD App Registration for Power BI service principal
//   - bacpac import to load AdventureWorksDW (run scripts/load_bacpac.sh after)
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

@description('UPN of a user in THIS tenant who will be Fabric capacity admin. Must be a tenant identity, not an external email.')
param fabricAdminUpn string

@description('Anthropic API key for the Claude side of the A/B. Marked @secure so it is not logged.')
@secure()
param anthropicApiKey string

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
  // PowerBIDedicated capacity names: lowercase alphanumeric only, must start
  // with a letter. uniqueString() returns a 13-char lowercase token so this
  // satisfies that constraint and stays globally unique per RG.
  pbi: 'awchatpbi${suffix}'
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
    anthropicApiKey: anthropicApiKey
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

// Power BI Embedded A-SKU capacity. Provisioned Active by default; the
// post-deploy script + idle-pause TimerTrigger keep it suspended when
// not in use ($0/hr paused, $1.0081/hr active for A1).
module pbi 'modules/pbi-embedded.bicep' = {
  name: 'pbi'
  params: {
    capacityName: names.pbi
    location: location
    adminUpn: fabricAdminUpn
  }
}

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
    fabricCapacityName: pbi.outputs.capacityName
    fabricResourceId: pbi.outputs.capacityResourceId
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

// Grant Function MI → Microsoft.Fabric resume/pause on the capacity.
// Grant Function MI → Microsoft.PowerBIDedicated resume/pause on the capacity.
module pbiRbac 'modules/pbi-embedded-rbac.bicep' = {
  name: 'pbiRbac'
  params: {
    capacityName: pbi.outputs.capacityName
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
output pbiCapacityName string = pbi.outputs.capacityName
output pbiCapacityResourceId string = pbi.outputs.capacityResourceId
