// Storage account hosting Table Storage for chatlogs + rate-limit counters.
// Standard LRS — cheapest tier; durability is not a concern (logs are
// for the methodology page, not auditable records).

@description('Globally unique storage account name. 3-24 chars, lowercase alphanumeric.')
param storageAccountName string
param location string

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    defaultToOAuthAuthentication: true
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2024-01-01' = {
  parent: storage
  name: 'default'
}

resource chatlogsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2024-01-01' = {
  parent: tableService
  name: 'chatlogs'
}

resource ratelimitsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2024-01-01' = {
  parent: tableService
  name: 'ratelimits'
}

resource pbistateTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2024-01-01' = {
  parent: tableService
  name: 'pbistate'
}

output storageAccountName string = storage.name
output storageAccountId string = storage.id
