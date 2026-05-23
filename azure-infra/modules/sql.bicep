// Azure SQL — serverless GP, 0.5–2 vCore, auto-pause 60 min.
//
// The Function uses Managed Identity for runtime queries (zero secrets
// in code), but the admin login is still required to:
//   - run the bacpac import deploymentScript
//   - create the contained DB user mapped to the Function's MI
// Both happen post-Bicep-deploy via the SQL script in DEPLOY.md.

param serverName string
param dbName string
param location string
param adminLogin string
@secure()
param adminPassword string

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: serverName
  location: location
  properties: {
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    version: '12.0'
    // AAD admin (for creating contained users) is set post-deploy via
    // `az sql server ad-admin create` to avoid hardcoding identity SIDs
    // in Bicep. SQL auth covers the one-shot bacpac import.
  }
}

resource awDb 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: dbName
  location: location
  sku: {
    name: 'GP_S_Gen5_2'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 2
  }
  properties: {
    autoPauseDelay: 60
    minCapacity: json('0.5')
    maxSizeBytes: 34359738368 // 32 GB
    requestedBackupStorageRedundancy: 'Local'
    zoneRedundant: false
  }
}

// Allow Azure-internal services (Function outbound) to reach the SQL
// server. This is the simplest firewall posture; the read-only
// db_datareader user is the actual access control.
resource fwAllowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDbName string = awDb.name
output sqlServerName string = sqlServer.name
