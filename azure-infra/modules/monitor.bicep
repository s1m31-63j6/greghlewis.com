// Budget + action group. If the monthly burn crosses 80% of the cap,
// an email goes to the alert address; if it crosses 100%, a second
// email fires. Manual intervention from there — at this budget level
// the automation isn't worth the Bicep complexity of a kill-switch
// Logic App.

param actionGroupName string
param budgetName string
param alertEmail string
param monthlyAmount int

resource actionGroup 'Microsoft.Insights/actionGroups@2023-09-01-preview' = {
  name: actionGroupName
  location: 'global'
  properties: {
    groupShortName: 'awchatalrt'
    enabled: true
    emailReceivers: [
      {
        name: 'admin'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: budgetName
  properties: {
    timePeriod: {
      startDate: '2026-06-01'
    }
    timeGrain: 'Monthly'
    amount: monthlyAmount
    category: 'Cost'
    notifications: {
      ActualOver80Pct: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [ alertEmail ]
        contactGroups: [ actionGroup.id ]
      }
      ActualOver100Pct: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [ alertEmail ]
        contactGroups: [ actionGroup.id ]
      }
      ForecastOver100Pct: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: [ alertEmail ]
        contactGroups: [ actionGroup.id ]
      }
    }
  }
}
