targetScope = 'resourceGroup'

@description('Azure region for all staging resources.')
param location string = resourceGroup().location

@description('Logical environment name used for tagging and naming.')
param environmentName string = 'staging'

@description('Whether to deploy the container apps or bootstrap only the shared infrastructure.')
param deployContainerApps bool = true

@description('Container image tag for the API image stored in ACR.')
param apiImageTag string = 'placeholder'

@description('Container image tag for the portal image stored in ACR.')
param portalImageTag string = 'placeholder'

@description('Administrator username for PostgreSQL Flexible Server.')
param postgresAdministratorLogin string = 'fastsaasadmin'

@secure()
@description('Administrator password for PostgreSQL Flexible Server.')
param postgresAdminPassword string

@description('Optional tags to apply to all resources.')
param tags object = {}

var baseName = toLower('fastsaas${uniqueString(subscription().subscriptionId, resourceGroup().id, environmentName)}')
var normalizedEnvironment = toLower(replace(environmentName, '-', ''))
var registryName = substring('${normalizedEnvironment}${baseName}acr', 0, 50)
var postgresServerName = substring('${normalizedEnvironment}${baseName}pg', 0, 63)
var redisName = substring('${normalizedEnvironment}${baseName}redis', 0, 63)
var managedEnvironmentName = '${environmentName}-cae'
var logAnalyticsWorkspaceName = '${environmentName}-logs'
var apiAppName = '${environmentName}-api'
var portalAppName = '${environmentName}-portal'
var apiIdentityName = '${environmentName}-api-pull'
var portalIdentityName = '${environmentName}-portal-pull'
var databaseName = 'fastsaas'
var virtualNetworkName = '${environmentName}-network'
var containerAppsSubnetName = 'container-apps'
var postgresSubnetName = 'postgres'
var privateEndpointsSubnetName = 'private-endpoints'
var postgresPrivateDnsZoneName = 'privatelink.postgres.database.azure.com'
var redisPrivateDnsZoneName = 'privatelink.redis.cache.windows.net'
var acrPrivateDnsZoneName = 'privatelink.azurecr.io'
var acrPullRoleDefinitionId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var mergedTags = union(tags, {
  environment: environmentName
  managedBy: 'bicep'
  workload: 'fastsaas'
})

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2024-03-01' = {
  name: virtualNetworkName
  location: location
  tags: mergedTags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.42.0.0/16'
      ]
    }
    subnets: [
      {
        name: containerAppsSubnetName
        properties: {
          addressPrefix: '10.42.0.0/23'
          delegations: [
            {
              name: 'containerAppsDelegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: postgresSubnetName
        properties: {
          addressPrefix: '10.42.2.0/24'
          delegations: [
            {
              name: 'postgresDelegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
      {
        name: privateEndpointsSubnetName
        properties: {
          addressPrefix: '10.42.3.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

var containerAppsSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetwork.name, containerAppsSubnetName)
var postgresSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetwork.name, postgresSubnetName)
var privateEndpointsSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetwork.name, privateEndpointsSubnetName)

resource postgresPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: postgresPrivateDnsZoneName
  location: 'global'
  tags: mergedTags
}

resource postgresPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  name: '${environmentName}-postgres-link'
  parent: postgresPrivateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource redisPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: redisPrivateDnsZoneName
  location: 'global'
  tags: mergedTags
}

resource redisPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  name: '${environmentName}-redis-link'
  parent: redisPrivateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource acrPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: acrPrivateDnsZoneName
  location: 'global'
  tags: mergedTags
}

resource acrPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  name: '${environmentName}-acr-link'
  parent: acrPrivateDnsZone
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

module containerRegistry './modules/container-registry.bicep' = {
  name: 'containerRegistry'
  params: {
    name: registryName
    location: location
    tags: mergedTags
  }
}

module postgres './modules/postgres-flexible-server.bicep' = {
  name: 'postgres'
  params: {
    serverName: postgresServerName
    location: location
    administratorLogin: postgresAdministratorLogin
    administratorPassword: postgresAdminPassword
    databaseName: databaseName
    delegatedSubnetResourceId: postgresSubnetId
    privateDnsZoneId: postgresPrivateDnsZone.id
    tags: mergedTags
  }
}

module redis './modules/redis-cache.bicep' = {
  name: 'redis'
  params: {
    name: redisName
    location: location
    tags: mergedTags
  }
}

module managedEnvironment './modules/container-app-environment.bicep' = {
  name: 'managedEnvironment'
  params: {
    name: managedEnvironmentName
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    location: location
    infrastructureSubnetId: containerAppsSubnetId
    tags: mergedTags
  }
}

resource containerRegistryResource 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource redisResource 'Microsoft.Cache/Redis@2024-03-01' existing = {
  name: redisName
}

resource acrPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-03-01' = {
  name: '${registryName}-pe'
  location: location
  tags: mergedTags
  properties: {
    subnet: {
      id: privateEndpointsSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'acrRegistry'
        properties: {
          privateLinkServiceId: containerRegistry.outputs.id
          groupIds: [
            'registry'
          ]
        }
      }
    ]
  }
}

resource acrPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-03-01' = {
  name: 'default'
  parent: acrPrivateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'acr-dns'
        properties: {
          privateDnsZoneId: acrPrivateDnsZone.id
        }
      }
    ]
  }
}

resource redisPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-03-01' = {
  name: '${redisName}-pe'
  location: location
  tags: mergedTags
  properties: {
    subnet: {
      id: privateEndpointsSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'redisCache'
        properties: {
          privateLinkServiceId: redis.outputs.id
          groupIds: [
            'redisCache'
          ]
        }
      }
    ]
  }
}

resource redisPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-03-01' = {
  name: 'default'
  parent: redisPrivateEndpoint
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'redis-dns'
        properties: {
          privateDnsZoneId: redisPrivateDnsZone.id
        }
      }
    ]
  }
}

resource apiRegistryIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (deployContainerApps) {
  name: apiIdentityName
  location: location
  tags: mergedTags
}

resource portalRegistryIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (deployContainerApps) {
  name: portalIdentityName
  location: location
  tags: mergedTags
}

resource apiAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployContainerApps) {
  name: guid(resourceGroup().id, registryName, apiIdentityName, acrPullRoleDefinitionId)
  scope: containerRegistryResource
  properties: {
    principalId: apiRegistryIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
  }
}

resource portalAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployContainerApps) {
  name: guid(resourceGroup().id, registryName, portalIdentityName, acrPullRoleDefinitionId)
  scope: containerRegistryResource
  properties: {
    principalId: portalRegistryIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
  }
}

var redisKeys = redisResource.listKeys()
var apiImage = '${containerRegistry.outputs.loginServer}/fastsaas-api:${apiImageTag}'
var portalImage = '${containerRegistry.outputs.loginServer}/fastsaas-portal:${portalImageTag}'
var databaseUrl = 'postgresql://${postgres.outputs.administratorLogin}:${postgresAdminPassword}@${postgres.outputs.fqdn}:5432/${postgres.outputs.databaseName}?sslmode=require'
var redisUrl = '${redis.outputs.hostname}:${redis.outputs.sslPort},password=${redisKeys.primaryKey},ssl=True,abortConnect=False'

module apiApp './modules/container-app.bicep' = if (deployContainerApps) {
  name: 'apiApp'
  params: {
    name: apiAppName
    location: location
    environmentId: managedEnvironment.outputs.id
    containerImage: apiImage
    targetPort: 3000
    healthPath: '/health'
    registryServer: containerRegistry.outputs.loginServer
    managedIdentityResourceId: apiRegistryIdentity.id
    envVars: [
      {
        name: 'API_PORT'
        value: '3000'
      }
      {
        name: 'NODE_ENV'
        value: 'production'
      }
    ]
    secretEnvVars: [
      {
        name: 'DATABASE_URL'
        secretName: 'database-url'
        value: databaseUrl
      }
      {
        name: 'REDIS_URL'
        secretName: 'redis-url'
        value: redisUrl
      }
    ]
    tags: mergedTags
  }
}

module portalApp './modules/container-app.bicep' = if (deployContainerApps) {
  name: 'portalApp'
  params: {
    name: portalAppName
    location: location
    environmentId: managedEnvironment.outputs.id
    containerImage: portalImage
    targetPort: 3001
    healthPath: '/health'
    registryServer: containerRegistry.outputs.loginServer
    managedIdentityResourceId: portalRegistryIdentity.id
    envVars: [
      {
        name: 'APP_NAME'
        value: 'portal'
      }
      {
        name: 'PORT'
        value: '3001'
      }
      {
        name: 'HEALTH_PATH'
        value: '/health'
      }
      {
        name: 'NODE_ENV'
        value: 'production'
      }
      {
        name: 'API_BASE_URL'
        value: deployContainerApps ? 'https://${apiApp.outputs.fqdn}' : 'http://api:3000'
      }
    ]
    tags: mergedTags
  }
}

output acrId string = containerRegistry.outputs.id
output acrLoginServer string = containerRegistry.outputs.loginServer
output acrName string = containerRegistry.outputs.name
output containerAppsEnvironmentId string = managedEnvironment.outputs.id
output containerAppsDefaultDomain string = managedEnvironment.outputs.defaultDomain
output postgresServerFqdn string = postgres.outputs.fqdn
output postgresServerName string = postgres.outputs.serverName
output postgresDatabaseName string = postgres.outputs.databaseName
output redisHost string = redis.outputs.hostname
output redisSslPort int = redis.outputs.sslPort
output apiContainerAppName string = apiAppName
output portalContainerAppName string = portalAppName
output apiImage string = apiImage
output portalImage string = portalImage
output apiUrl string = deployContainerApps ? 'https://${apiApp.outputs.fqdn}' : ''
output portalUrl string = deployContainerApps ? 'https://${portalApp.outputs.fqdn}' : ''
