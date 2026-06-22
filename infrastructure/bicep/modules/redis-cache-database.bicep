param clusterName string
param databaseName string = 'default'
param databasePort int = 10000

resource redis 'Microsoft.Cache/redisEnterprise@2025-04-01' existing = {
  name: clusterName
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

output id string = redisDatabase.id
output name string = redisDatabase.name
