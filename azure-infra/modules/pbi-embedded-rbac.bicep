// Grant Function MI → Microsoft.PowerBIDedicated resume/pause on the capacity.

param capacityName string
param functionPrincipalId string

resource pbi 'Microsoft.PowerBIDedicated/capacities@2021-01-01' existing = {
  name: capacityName
}

// 'Contributor' built-in. Scoped to just this capacity, so the MI can
// only resume/suspend this one resource, not anything else in the RG.
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

resource fnPbiCtrl 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: pbi
  name: guid(pbi.id, functionPrincipalId, contributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      contributorRoleId
    )
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}
