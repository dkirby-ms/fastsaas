param name string
param location string
param skuName string = 'Basic'
param family string = 'C'
param capacity int = 0
param minimumTlsVersion string = '1.2'
param tags object = {}

resource redis 'Microsoft.Cache/Redis@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      name: skuName
      family: family
      capacity: capacity
    }
    minimumTlsVersion: minimumTlsVersion
    publicNetworkAccess: 'Disabled'
    redisConfiguration: {
      'maxmemory-policy': 'allkeys-lru'
    }
  }
}

output id string = redis.id
output name string = redis.name
output hostname string = redis.properties.hostName
output sslPort int = redis.properties.sslPort
