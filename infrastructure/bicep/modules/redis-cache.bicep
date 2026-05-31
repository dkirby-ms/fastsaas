param name string
param location string
param skuName string = 'MemoryOptimized_M10'
param skuCapacity int = 1
param minimumTlsVersion string = '1.2'
param highAvailability string = 'Disabled'
param databaseName string = 'default'
param databasePort int = 10000
param tags object = {}

resource redis 'Microsoft.Cache/redisEnterprise@2025-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    capacity: skuCapacity
  }
  properties: {
    minimumTlsVersion: minimumTlsVersion
    highAvailability: highAvailability
  }
}

resource redisDatabase 'Microsoft.Cache/redisEnterprise/databases@2025-04-01' = {
  parent: redis
  name: databaseName
  properties: {
    accessKeysAuthentication: 'Enabled'
    clientProtocol: 'Encrypted'
    clusteringPolicy: 'OSSCluster'
    evictionPolicy: 'AllKeysLRU'
    modules: []
    port: databasePort
  }
}

output id string = redis.id
output name string = redis.name
output hostname string = redis.properties.hostName
output sslPort int = databasePort
output databaseId string = redisDatabase.id
output databaseName string = redisDatabase.name
