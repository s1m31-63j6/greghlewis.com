// Azure OpenAI account + model deployment.
//
// Students subscriptions may need a one-time approval for OpenAI access.
// Apply at https://aka.ms/oai/access if the deployment fails.

param accountName string
param location string
param modelDeployment string
param modelName string
param modelVersion string

resource aoai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
    disableLocalAuth: true // Managed Identity only — no API keys in code.
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: aoai
  name: modelDeployment
  sku: {
    // GlobalStandard has the most generous free-tier quota on Students subs.
    name: 'GlobalStandard'
    capacity: 1 // 1K TPM — minimum that satisfies Students quota allowance.
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

output accountName string = aoai.name
output endpoint string = aoai.properties.endpoint
output deploymentName string = deployment.name
