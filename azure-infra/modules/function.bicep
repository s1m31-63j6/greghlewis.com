// Function App on Flex Consumption (Node 22, TypeScript).
//
// Flex chosen over classic Consumption because:
//   - HTTP streaming (text/event-stream) works reliably
//   - Cold starts are shorter (~1-2s vs 5-10s)
//   - Pay-per-use, scale-to-zero retained
//
// Managed Identity is system-assigned. Identity-based connections used
// for the storage account (Flex requires it).

param functionAppName string
param planName string
param location string
param storageAccountName string
param appInsightsName string
param logAnalyticsName string
param sqlServerFqdn string
param sqlDbName string
param openAIEndpoint string
param openAIDeployment string
param keyVaultName string

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: json('0.1') // ~100 MB/day cap to stay inside free tier
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
  name: storageAccountName
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  sku: {
    name: 'FC1' // Flex Consumption tier
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true // Linux
  }
}

resource fnApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}deploymentpackage'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'node'
        version: '22'
      }
    }
    siteConfig: {
      cors: {
        allowedOrigins: [
          'https://greghlewis.com'
          'https://www.greghlewis.com'
          'http://localhost:3000'
        ]
        supportCredentials: false
      }
      appSettings: [
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storage.name
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'AW_SQL_SERVER'
          value: sqlServerFqdn
        }
        {
          name: 'AW_SQL_DATABASE'
          value: sqlDbName
        }
        {
          name: 'AW_OPENAI_ENDPOINT'
          value: openAIEndpoint
        }
        {
          name: 'AW_OPENAI_DEPLOYMENT'
          value: openAIDeployment
        }
        {
          name: 'AW_OPENAI_API_VERSION'
          value: '2024-10-21'
        }
        {
          name: 'AW_KEY_VAULT_NAME'
          value: keyVaultName
        }
        {
          name: 'AW_ANTHROPIC_KEY_SECRET'
          value: 'anthropic-api-key'
        }
        {
          name: 'AW_ANTHROPIC_MODEL'
          value: 'claude-sonnet-4-6'
        }
        {
          name: 'AW_STORAGE_ACCOUNT'
          value: storage.name
        }
        {
          name: 'AW_CHATLOG_TABLE'
          value: 'chatlogs'
        }
        {
          name: 'AW_RATELIMIT_TABLE'
          value: 'ratelimits'
        }
        {
          name: 'AW_DAILY_QUERY_CAP_PER_IP'
          value: '20'
        }
        {
          name: 'AW_DAILY_TOKEN_CAP_PER_IP'
          value: '50000'
        }
        // TURNSTILE_SECRET_KEY is set manually in the portal after
        // provisioning a Turnstile sitekey + secret in Cloudflare.
      ]
    }
  }
}

output functionAppName string = fnApp.name
output functionUrl string = 'https://${fnApp.properties.defaultHostName}'
output principalId string = fnApp.identity.principalId
