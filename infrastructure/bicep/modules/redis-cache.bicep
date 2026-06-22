param name string
param location string
param skuName string = 'Balanced_B0'
param minimumTlsVersion string = '1.2'
param highAvailability string = 'Disabled'
param databasePort int = 10000
param tags object = {}

resource redis 'Microsoft.Cache/redisEnterprise@2025-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  properties: {
    minimumTlsVersion: minimumTlsVersion
    highAvailability: highAvailability
  }
}

output id string = redis.id
output name string = redis.name
output hostname string = redis.properties.hostName
output sslPort int = databasePort
