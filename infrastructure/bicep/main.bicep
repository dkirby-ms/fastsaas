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
var databaseName = 'fastsaas'
var mergedTags = union(tags, {
  environment: environmentName
  managedBy: 'bicep'
  workload: 'fastsaas'
})

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
    tags: mergedTags
  }
}

var acrCredentials = listCredentials(containerRegistry.outputs.id, '2023-07-01')
var redisKeys = listKeys(redis.outputs.id, '2024-03-01')
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
    registryUsername: acrCredentials.username
    registryPassword: acrCredentials.passwords[0].value
    envVars: [
      {
        name: 'APP_NAME'
        value: 'api'
      }
      {
        name: 'PORT'
        value: '3000'
      }
      {
        name: 'HEALTH_PATH'
        value: '/health'
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
    registryUsername: acrCredentials.username
    registryPassword: acrCredentials.passwords[0].value
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
