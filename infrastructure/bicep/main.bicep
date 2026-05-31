targetScope = 'resourceGroup'

@description('Azure region for all staging resources.')
param location string = resourceGroup().location

@description('Logical environment name used for tagging and naming.')
param environmentName string = 'staging'

@description('Whether to deploy the container apps or bootstrap only the shared infrastructure.')
param deployContainerApps bool = true

@description('Whether to deploy private endpoints and private networking resources.')
param usePrivateEndpoints bool = false

@description('Whether to provision Redis cache resources for the deployment.')
param deployRedis bool = false

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
var registryBaseName = '${normalizedEnvironment}${baseName}acr'
var registryName = take(registryBaseName, 50)
var postgresServerBaseName = '${normalizedEnvironment}${baseName}pg'
var postgresServerName = take(postgresServerBaseName, 63)
var redisBaseName = '${normalizedEnvironment}${baseName}redis'
var redisName = take(redisBaseName, 63)
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

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2024-03-01' = if (usePrivateEndpoints) {
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

var containerAppsSubnetId = usePrivateEndpoints ? resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, containerAppsSubnetName) : ''
var postgresSubnetId = usePrivateEndpoints ? resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, postgresSubnetName) : ''
var privateEndpointsSubnetId = usePrivateEndpoints ? resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, privateEndpointsSubnetName) : ''

resource postgresPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = if (usePrivateEndpoints) {
  name: postgresPrivateDnsZoneName
  location: 'global'
  tags: mergedTags
}

resource postgresPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = if (usePrivateEndpoints) {
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

resource redisPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = if (usePrivateEndpoints && deployRedis) {
  name: redisPrivateDnsZoneName
  location: 'global'
  tags: mergedTags
}

resource redisPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = if (usePrivateEndpoints && deployRedis) {
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

resource acrPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = if (usePrivateEndpoints) {
  name: acrPrivateDnsZoneName
  location: 'global'
  tags: mergedTags
}

resource acrPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = if (usePrivateEndpoints) {
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
    publicNetworkAccess: usePrivateEndpoints ? 'Disabled' : 'Enabled'
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
    delegatedSubnetResourceId: usePrivateEndpoints ? postgresSubnetId : ''
    privateDnsZoneId: usePrivateEndpoints ? postgresPrivateDnsZone.id : ''
    tags: mergedTags
  }
}

module redis './modules/redis-cache.bicep' = if (deployRedis) {
  name: 'redis'
  params: {
    name: redisName
    location: location
    publicNetworkAccess: usePrivateEndpoints ? 'Disabled' : 'Enabled'
    tags: mergedTags
  }
}

module managedEnvironment './modules/container-app-environment.bicep' = {
  name: 'managedEnvironment'
  params: {
    name: managedEnvironmentName
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    location: location
    infrastructureSubnetId: usePrivateEndpoints ? containerAppsSubnetId : ''
    tags: mergedTags
  }
}

resource containerRegistryResource 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource redisResource 'Microsoft.Cache/Redis@2024-03-01' existing = if (deployRedis) {
  name: redisName
}

resource acrPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-03-01' = if (usePrivateEndpoints) {
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

resource acrPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-03-01' = if (usePrivateEndpoints) {
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

resource redisPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-03-01' = if (usePrivateEndpoints && deployRedis) {
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
          privateLinkServiceId: redis!.outputs.id
          groupIds: [
            'redisCache'
          ]
        }
      }
    ]
  }
}

resource redisPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-03-01' = if (usePrivateEndpoints && deployRedis) {
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

var apiRegistryPrincipalId = deployContainerApps ? apiRegistryIdentity!.properties.principalId : ''
var portalRegistryPrincipalId = deployContainerApps ? portalRegistryIdentity!.properties.principalId : ''
var apiBaseUrl = deployContainerApps ? 'https://${apiApp!.outputs.fqdn}' : 'http://api:3000'
var apiUrl = deployContainerApps ? 'https://${apiApp!.outputs.fqdn}' : ''
var portalUrl = deployContainerApps ? 'https://${portalApp!.outputs.fqdn}' : ''

resource apiAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployContainerApps) {
  name: guid(resourceGroup().id, registryName, apiIdentityName, acrPullRoleDefinitionId)
  scope: containerRegistryResource
  properties: {
    principalId: apiRegistryPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
  }
}

resource portalAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployContainerApps) {
  name: guid(resourceGroup().id, registryName, portalIdentityName, acrPullRoleDefinitionId)
  scope: containerRegistryResource
  properties: {
    principalId: portalRegistryPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleDefinitionId)
  }
}

var redisPrimaryKey = deployRedis ? redisResource!.listKeys().primaryKey : ''
var apiImage = '${containerRegistry.outputs.loginServer}/fastsaas-api:${apiImageTag}'
var portalImage = '${containerRegistry.outputs.loginServer}/fastsaas-portal:${portalImageTag}'
var databaseUrl = 'postgresql://${postgres.outputs.administratorLogin}:${postgresAdminPassword}@${postgres.outputs.fqdn}:5432/${postgres.outputs.databaseName}?sslmode=require'
var redisUrl = deployRedis ? '${redis!.outputs.hostname}:${redis!.outputs.sslPort},password=${redisPrimaryKey},ssl=True,abortConnect=False' : ''
var apiSecretEnvVars = concat([
  {
    name: 'DATABASE_URL'
    secretName: 'database-url'
    value: databaseUrl
  }
], deployRedis ? [
  {
    name: 'REDIS_URL'
    secretName: 'redis-url'
    value: redisUrl
  }
] : [])

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
    secretEnvVars: apiSecretEnvVars
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
        value: apiBaseUrl
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
output redisHost string = deployRedis ? redis!.outputs.hostname : ''
output redisSslPort int = deployRedis ? redis!.outputs.sslPort : 0
output apiContainerAppName string = apiAppName
output portalContainerAppName string = portalAppName
output apiImage string = apiImage
output portalImage string = portalImage
output apiUrl string = apiUrl
output portalUrl string = portalUrl
