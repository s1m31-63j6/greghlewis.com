// Key Vault for the Anthropic API key (and later the Power BI service
// principal secret, which Greg adds manually after authoring the report).

param keyVaultName string
param location string
param adminPrincipalObjectId string
@secure()
param anthropicApiKey string

resource kv 'Microsoft.KeyVault/vaults@2024-04-01-preview' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource anthropicSecret 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = {
  parent: kv
  name: 'anthropic-api-key'
  properties: {
    value: anthropicApiKey
    contentType: 'text/plain'
  }
}

// Admin gets Key Vault Administrator so they can read/write secrets in the portal.
var keyVaultAdministratorRoleId = '00482a5a-887f-4fb3-b363-3b7fe8e74483'

resource adminRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, adminPrincipalObjectId, keyVaultAdministratorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultAdministratorRoleId
    )
    principalId: adminPrincipalObjectId
    principalType: 'User'
  }
}

output keyVaultName string = kv.name
output keyVaultUri string = kv.properties.vaultUri
