param serverName string
param location string
param administratorLogin string
@secure()
param administratorPassword string
param databaseName string = 'fastsaas'
param serverSku string = 'Standard_B1ms'
param serverVersion string = '16'
param storageSizeGb int = 32
param backupRetentionDays int = 7
param delegatedSubnetResourceId string = ''
param privateDnsZoneId string = ''
param tags object = {}

var isPublicMode = empty(delegatedSubnetResourceId)

var serverProperties = union({
  administratorLogin: administratorLogin
  administratorLoginPassword: administratorPassword
  version: serverVersion
  createMode: 'Create'
  backup: {
    backupRetentionDays: backupRetentionDays
    geoRedundantBackup: 'Disabled'
  }
  highAvailability: {
    mode: 'Disabled'
  }
  storage: {
    storageSizeGB: storageSizeGb
    autoGrow: 'Enabled'
    tier: 'P4'
  }
}, isPublicMode || empty(privateDnsZoneId) ? {} : {
  network: {
    delegatedSubnetResourceId: delegatedSubnetResourceId
    privateDnsZoneArmResourceId: privateDnsZoneId
    publicNetworkAccess: 'Disabled'
  }
})

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: serverName
  location: location
  sku: {
    name: serverSku
    tier: 'Burstable'
  }
  tags: tags
  properties: serverProperties
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  name: databaseName
  parent: server
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource allowAzureServicesFirewallRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = if (isPublicMode) {
  parent: server
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource allowAllFirewallRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = if (isPublicMode) {
  parent: server
  name: 'AllowAllDev'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

output id string = server.id
output fqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
output administratorLogin string = administratorLogin
output serverName string = server.name
