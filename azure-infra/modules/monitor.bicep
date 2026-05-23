// Budget + action group. If the monthly burn crosses 80% of the cap,
// an email goes to the alert address; if it crosses 100%, a second
// email fires AND (in v2) a Logic App pauses everything.
//
// The kill-switch Logic App is intentionally NOT in this Bicep — v1
// keeps it manual (alert at 100% → Greg manually pauses Fabric in the
// portal). The deferred Logic App requires HTTP+Auth chaining that
// inflates the Bicep complexity for marginal automation value at this
// budget level.

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
