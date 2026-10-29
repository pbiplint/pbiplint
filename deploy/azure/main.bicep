// pbiplint, hosted inside a firm's own Azure network (issue #93). This template creates the
// infrastructure only: a storage account serving the site as a static website, reachable solely
// through private endpoints on a subnet the firm already runs, with no shared key, a delete lock,
// and the write and delete log. The site's files are uploaded afterwards with the commands on
// https://pbiplint.com/self-host/, from a machine inside the network, so one template serves
// every release. Compile with the Bicep version in README.md; azuredeploy.json is the output.

@description('Region for the storage account. The private endpoints go in the virtual network\'s own region.')
param location string = resourceGroup().location

@description('Name of the storage account: 3 to 24 lowercase letters and digits, unique across Azure.')
@minLength(3)
@maxLength(24)
param storageAccountName string = 'pbiplint${uniqueString(resourceGroup().id)}'

@description('Resource ID of an existing subnet the private endpoints join. It may be in another resource group.')
param subnetId string

@description('Region of that subnet\'s virtual network; private endpoints must be in it. The portal form fills it in.')
param networkLocation string

@description('How the private DNS records are made: create the two privatelink zones here, use existing zones, or none because the firm\'s own policy writes them.')
@allowed([
  'create'
  'existing'
  'none'
])
param dnsMode string = 'create'

@description('With dnsMode existing: resource ID of the privatelink.web.core.windows.net zone.')
param webDnsZoneId string = ''

@description('With dnsMode existing: resource ID of the privatelink.blob.core.windows.net zone.')
param blobDnsZoneId string = ''

@description('Resource ID of a Log Analytics workspace for blob write and delete events. Blank sends none.')
param logAnalyticsWorkspaceId string = ''

@description('Object ID of the Entra group that may change the site\'s files. Blank assigns nothing.')
param writeGroupObjectId string = ''

// The subnet's ID names its network: /subscriptions/<s>/resourceGroups/<g>/providers/Microsoft.Network/virtualNetworks/<n>/subnets/<subnet>
var subnetParts = split(subnetId, '/')
var vnetId = resourceId(subnetParts[2], subnetParts[4], 'Microsoft.Network/virtualNetworks', subnetParts[8])

resource account 'Microsoft.Storage/storageAccounts@2025-08-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    publicNetworkAccess: 'Disabled'
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'None'
    }
  }
}

resource blob 'Microsoft.Storage/storageAccounts/blobServices@2025-08-01' = {
  parent: account
  name: 'default'
  properties: {
    staticWebsite: {
      enabled: true
      indexDocument: 'index.html'
      errorDocument404Path: '404.html'
    }
  }
}

// web serves the site to browsers; blob is how uploads reach the files, since web is read-only.
var services = [
  'web'
  'blob'
]

resource endpoints 'Microsoft.Network/privateEndpoints@2024-05-01' = [
  for service in services: {
    name: '${storageAccountName}-${service}'
    location: networkLocation
    properties: {
      subnet: {
        id: subnetId
      }
      privateLinkServiceConnections: [
        {
          name: '${storageAccountName}-${service}'
          properties: {
            privateLinkServiceId: account.id
            groupIds: [
              service
            ]
          }
        }
      ]
    }
  }
]

resource zones 'Microsoft.Network/privateDnsZones@2024-06-01' = [
  for service in services: if (dnsMode == 'create') {
    name: 'privatelink.${service}.${environment().suffixes.storage}'
    location: 'global'
  }
]

resource links 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [
  for (service, i) in services: if (dnsMode == 'create') {
    parent: zones[i]
    name: '${storageAccountName}-link'
    location: 'global'
    properties: {
      registrationEnabled: false
      virtualNetwork: {
        id: vnetId
      }
    }
  }
]

var existingZones = {
  web: webDnsZoneId
  blob: blobDnsZoneId
}

resource zoneGroups 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = [
  for (service, i) in services: if (dnsMode != 'none') {
    parent: endpoints[i]
    name: 'default'
    properties: {
      privateDnsZoneConfigs: [
        {
          name: service
          properties: {
            privateDnsZoneId: dnsMode == 'create' ? zones[i].id : existingZones[service]
          }
        }
      ]
    }
  }
]

resource lock 'Microsoft.Authorization/locks@2020-05-01' = {
  scope: account
  name: '${storageAccountName}-no-delete'
  properties: {
    level: 'CanNotDelete'
    notes: 'pbiplint: remove this lock before deleting the site on purpose.'
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(logAnalyticsWorkspaceId)) {
  scope: blob
  name: 'pbiplint-writes-and-deletes'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'StorageWrite'
        enabled: true
      }
      {
        category: 'StorageDelete'
        enabled: true
      }
    ]
  }
}

// The $web container the static website creates; write access is scoped to it alone.
resource web 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-08-01' existing = {
  parent: blob
  name: '$web'
}

var storageBlobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource grant 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(writeGroupObjectId)) {
  scope: web
  name: guid(web.id, writeGroupObjectId, storageBlobDataContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributor)
    principalId: writeGroupObjectId
    principalType: 'Group'
  }
}

@description('The site\'s address, reachable only from inside the network.')
output siteUrl string = account.properties.primaryEndpoints.web

@description('The storage account the upload commands name.')
output storageAccountName string = account.name
