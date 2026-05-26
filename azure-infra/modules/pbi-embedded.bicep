// Power BI Embedded A-SKU capacity (Microsoft.PowerBIDedicated).
//
// We use the legacy A-SKU instead of the newer Fabric F-SKU because
// the Students subscription quota for Microsoft.Fabric/capacities is
// 0 by default (needs a support request), while
// Microsoft.PowerBIDedicated/capacities allows A1+ out of the box.
//
// Functionally equivalent for our use case: anonymous embed via
// app-owns-data, pausable to $0 via REST resume/suspend, ~$1.0081/hr
// active for A1.
//
// Naming constraint: '^[a-z][a-z0-9]*$' (lowercase alphanumeric, no
// hyphens). Different from most Azure resources.

@description('Capacity name. Lowercase alphanumeric only.')
param capacityName string

@description('Region for the capacity.')
param location string

@description('UPN of an administrator on the capacity (tenant identity required).')
param adminUpn string

resource pbi 'Microsoft.PowerBIDedicated/capacities@2021-01-01' = {
  name: capacityName
  location: location
  sku: {
    name: 'A1'
    tier: 'PBIE_Azure'
  }
  properties: {
    administration: {
      members: [
        adminUpn
      ]
    }
  }
}

output capacityName string = pbi.name
output capacityResourceId string = pbi.id
