// Key Vault for the Anthropic API key + Power BI service principal
// secret.
//
// IMPORTANT: secrets are NOT declared in this Bicep. Each Bicep redeploy
// would otherwise overwrite the live secret with whatever's in the
// parameter file (typically a placeholder), silently breaking the
// Function until someone notices. Bootstrap secrets out-of-band:
//   az keyvault secret set --vault-name <name> --name anthropic-api-key --value <key>
//   az keyvault secret set --vault-name <name> --name pbi-sp-secret --value <secret>

param keyVaultName string
param location string
param adminPrincipalObjectId string

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
