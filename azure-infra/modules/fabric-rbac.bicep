// Grant Function MI → Microsoft.Fabric resume/pause on the F2 capacity.
//
// We use 'Contributor' scoped to just this capacity. Tighter would be a
// custom role limited to the two actions
// (Microsoft.Fabric/capacities/resume/action,
//  Microsoft.Fabric/capacities/suspend/action), but Contributor is the
// only built-in that covers them and keeps this Bicep readable.

param fabricCapacityName string
param functionPrincipalId string

resource fabric 'Microsoft.Fabric/capacities@2023-11-01' existing = {
  name: fabricCapacityName
}

var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

resource fnFabricCtrl 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: fabric
  name: guid(fabric.id, functionPrincipalId, contributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      contributorRoleId
    )
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}
