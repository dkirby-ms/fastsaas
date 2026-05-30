param name string
param location string
param sku string = 'Premium'
param adminUserEnabled bool = false
param publicNetworkAccess string = 'Enabled'
param tags object = {}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  sku: {
    name: sku
  }
  tags: tags
  properties: {
    adminUserEnabled: adminUserEnabled
    publicNetworkAccess: publicNetworkAccess
  }
}

output id string = registry.id
output name string = registry.name
output loginServer string = registry.properties.loginServer
