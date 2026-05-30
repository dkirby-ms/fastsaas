param name string
param location string
param environmentId string
param containerImage string
param targetPort int
param external bool = true
param minReplicas int = 1
param maxReplicas int = 3
param cpu string = '0.5'
param memory string = '1Gi'
param healthPath string = '/health'
param registryServer string = ''
param managedIdentityResourceId string
param envVars array = []
param secretEnvVars array = []
param tags object = {}

var appSecrets = [for item in secretEnvVars: {
  name: item.secretName
  value: item.value
}]

var registries = empty(registryServer) ? [] : [
  {
    server: registryServer
    identity: managedIdentityResourceId
  }
]

var plainEnvVars = [for item in envVars: {
  name: item.name
  value: item.value
}]

var secretRefEnvVars = [for item in secretEnvVars: {
  name: item.name
  secretRef: item.secretName
}]

var containerEnv = concat(plainEnvVars, secretRefEnvVars)

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: external
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }
      registries: registries
      secrets: appSecrets
    }
    template: {
      containers: [
        {
          name: name
          image: containerImage
          env: containerEnv
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: healthPath
                port: targetPort
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 6
            }
            {
              type: 'Readiness'
              httpGet: {
                path: healthPath
                port: targetPort
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              failureThreshold: 4
            }
            {
              type: 'Liveness'
              httpGet: {
                path: healthPath
                port: targetPort
              }
              initialDelaySeconds: 30
              periodSeconds: 20
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

output id string = app.id
output name string = app.name
output latestRevisionName string = app.properties.latestRevisionName
output fqdn string = app.properties.configuration.ingress.fqdn
