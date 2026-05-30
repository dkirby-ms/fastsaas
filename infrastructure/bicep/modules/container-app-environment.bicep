param name string
param logAnalyticsWorkspaceName string
param location string
param infrastructureSubnetId string = ''
param tags object = {}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    sku: {
      name: 'PerGB2018'
    }
  }
}

var environmentProperties = union({
  appLogsConfiguration: {
    destination: 'log-analytics'
    logAnalyticsConfiguration: {
      customerId: workspace.properties.customerId
      sharedKey: workspace.listKeys().primarySharedKey
    }
  }
}, empty(infrastructureSubnetId) ? {} : {
  vnetConfiguration: {
    infrastructureSubnetId: infrastructureSubnetId
    internal: false
  }
})

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: environmentProperties
}

output id string = environment.id
output defaultDomain string = environment.properties.defaultDomain
output staticIp string = environment.properties.staticIp
output workspaceId string = workspace.id
