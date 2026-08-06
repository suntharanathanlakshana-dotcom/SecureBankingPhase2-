// main.bicep — SecureBank Phase 3 infrastructure
// Deploys: ACR, Log Analytics + App Insights, Key Vault, Postgres Flexible Server,
// a Container Apps Environment, and two Container Apps (backend, frontend).
// Usage: az deployment group create -g <rg> -f infra/main.bicep -p @infra/main.parameters.json

@description('Short, globally-unique prefix, e.g. securebank-dt6')
param namePrefix string

@description('Azure region')
param location string = resourceGroup().location

@secure()
@description('Admin password for the Postgres flexible server')
param dbAdminPassword string

@secure()
@description('JWT signing secret for the API')
param jwtSecret string

param dbAdminUser string = 'sbadmin'
param postgresVersion string = '16'
param containerImageTagBackend string = 'latest'
param containerImageTagFrontend string = 'latest'

var acrName = replace('${namePrefix}acr', '-', '')
var logName = '${namePrefix}-logs'
var appInsightsName = '${namePrefix}-ai'
var kvName = '${namePrefix}-kv'
var pgName = '${namePrefix}-pg'
var caeName = '${namePrefix}-env'
var backendAppName = '${namePrefix}-api'
var frontendAppName = '${namePrefix}-web'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false } // CI/CD auths via federated OIDC + AcrPush role, not admin creds
}

resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logName
  location: location
  properties: { retentionInDays: 30 }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
  }
}

resource kvJwtSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'jwt-secret'
  properties: { value: jwtSecret }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: pgName
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: postgresVersion
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource pgDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: 'securebank'
}

resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource kvDbSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'database-url'
  properties: {
    value: 'postgresql://${dbAdminUser}:${dbAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/securebank?sslmode=require'
  }
}

resource cae 'Microsoft.App/managedEnvironments@2023-11-02-preview' = {
  name: caeName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource backendApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: backendAppName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      ingress: {
        external: true
        targetPort: 4000
        transport: 'http'
      }
      registries: [
        { server: acr.properties.loginServer, identity: 'system' }
      ]
      secrets: [
        { name: 'jwt-secret', keyVaultUrl: kvJwtSecret.properties.secretUri, identity: 'system' }
        { name: 'database-url', keyVaultUrl: kvDbSecret.properties.secretUri, identity: 'system' }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${acr.properties.loginServer}/securebank-backend:${containerImageTagBackend}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'PORT', value: '4000' }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/api/health', port: 4000 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/api/health', port: 4000 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
        rules: [
          {
            name: 'http-scale'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
}

resource frontendApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: frontendAppName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      ingress: { external: true, targetPort: 8080, transport: 'http' }
      registries: [
        { server: acr.properties.loginServer, identity: 'system' }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${acr.properties.loginServer}/securebank-frontend:${containerImageTagFrontend}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 30 }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

output acrLoginServer string = acr.properties.loginServer
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
