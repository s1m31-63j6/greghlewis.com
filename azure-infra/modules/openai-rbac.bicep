// Grant Function Managed Identity → Azure OpenAI invoke.

param openAIAccountName string
param functionPrincipalId string

resource aoai 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: openAIAccountName
}

// 'Cognitive Services OpenAI User' built-in role.
var openAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource fnInvoke 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: aoai
  name: guid(aoai.id, functionPrincipalId, openAIUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      openAIUserRoleId
    )
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}
