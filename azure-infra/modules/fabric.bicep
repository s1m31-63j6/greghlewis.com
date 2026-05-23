// Microsoft Fabric F2 capacity for Power BI Embedded.
//
// We provision the capacity but the Function pauses it immediately
// after deploy (via DEPLOY.md post-step). Default state is "Active",
// which is fine — we pay nothing material during the brief window
// before the post-deploy script runs.

param capacityName string
param location string
param adminEmail string

resource fabric 'Microsoft.Fabric/capacities@2023-11-01' = {
  name: capacityName
  location: location
  sku: {
    name: 'F2'
    tier: 'Fabric'
  }
  properties: {
    administration: {
      members: [
        adminEmail
      ]
    }
  }
}

output capacityName string = fabric.name
output capacityResourceId string = fabric.id
