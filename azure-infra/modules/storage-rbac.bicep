// Grant Function MI → Storage account (blob + table R/W).

param storageAccountName string
param functionPrincipalId string

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
  name: storageAccountName
}

// 'Storage Blob Data Owner' for Flex Consumption deployment package access.
var blobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
// 'Storage Table Data Contributor' for chatlogs/ratelimits R/W.
var tableDataContribRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource fnBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionPrincipalId, blobDataOwnerRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      blobDataOwnerRoleId
    )
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource fnTableRw 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionPrincipalId, tableDataContribRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      tableDataContribRoleId
    )
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}
