import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Azure template a firm deploys from the self-hosting page's button (issue #93), read as the
// JSON the portal runs: deploy/azure/azuredeploy.json, compiled from main.bicep. CI's template
// job proves the JSON is what the Bicep compiles to; this proves the JSON locks the site down.

const dir = new URL("../../../deploy/azure/", import.meta.url);
const template = JSON.parse(readFileSync(new URL("azuredeploy.json", dir), "utf8"));
const form = JSON.parse(readFileSync(new URL("createUiDefinition.json", dir), "utf8"));

interface Resource {
  type: string;
  location?: string;
  copy?: { name: string; count: string };
  apiVersion: string;
  name: string;
  condition?: string;
  scope?: string;
  existing?: boolean;
  properties?: Record<string, unknown>;
}

/** Every resource the template declares, whether Bicep wrote them as a list or keyed by name. */
const resources: Resource[] = Array.isArray(template.resources)
  ? template.resources
  : Object.values(template.resources);
const created = resources.filter((r) => !r.existing);
const ofType = (type: string): Resource[] => created.filter((r) => r.type === type);
const one = (type: string): Resource => {
  const found = ofType(type);
  expect(found, type).toHaveLength(1);
  return found[0]!;
};

describe("the Azure template", () => {
  it("locks the storage account down: no public network, no shared key, TLS 1.2, no anonymous blobs", () => {
    const account = one("Microsoft.Storage/storageAccounts");
    expect(account.properties).toMatchObject({
      publicNetworkAccess: "Disabled",
      allowSharedKeyAccess: false,
      minimumTlsVersion: "TLS1_2",
      allowBlobPublicAccess: false,
      supportsHttpsTrafficOnly: true,
      defaultToOAuthAuthentication: true,
      networkAcls: { defaultAction: "Deny", bypass: "None" },
    });
  });

  it("turns the static website on itself, with the site's index and 404 pages", () => {
    const blob = one("Microsoft.Storage/storageAccounts/blobServices");
    expect(blob.apiVersion >= "2025-08-01", blob.apiVersion).toBe(true);
    expect(blob.properties?.staticWebsite).toEqual({
      enabled: true,
      indexDocument: "index.html",
      errorDocument404Path: "404.html",
    });
  });

  // Bicep writes a loop as one resource with a copy block over a variable, so these read the loop.
  const SERVICES = "[length(variables('services'))]";

  it("reaches the account through two private endpoints, web for browsers and blob for uploads", () => {
    expect(template.variables.services).toEqual(["web", "blob"]);
    const endpoints = one("Microsoft.Network/privateEndpoints");
    expect(endpoints.copy?.count).toBe(SERVICES);
    expect(JSON.stringify(endpoints.properties)).toContain(
      `"groupIds":["[variables('services')[copyIndex()]]"]`,
    );
    // In the network's own region, which may differ from the resource group's.
    expect(endpoints.location).toBe("[parameters('networkLocation')]");
  });

  it("creates DNS zones only in the create mode, and zone groups in every mode but none", () => {
    const zones = one("Microsoft.Network/privateDnsZones");
    expect(zones.copy?.count).toBe(SERVICES);
    // privatelink.web.core.windows.net and privatelink.blob.core.windows.net in Azure's public cloud.
    expect(zones.name).toBe(
      "[format('privatelink.{0}.{1}', variables('services')[copyIndex()], environment().suffixes.storage)]",
    );
    expect(zones.condition).toBe("[equals(parameters('dnsMode'), 'create')]");
    const link = one("Microsoft.Network/privateDnsZones/virtualNetworkLinks");
    expect(link.condition).toBe("[equals(parameters('dnsMode'), 'create')]");
    // To the subnet's own network, and without breaking names these zones do not hold.
    expect(link.properties?.virtualNetwork).toEqual({ id: "[variables('vnetId')]" });
    expect(template.variables.vnetId).toBe(
      "[resourceId(variables('subnetParts')[2], variables('subnetParts')[4], 'Microsoft.Network/virtualNetworks', variables('subnetParts')[8])]",
    );
    expect(link.properties?.resolutionPolicy).toBe("NxDomainRedirect");
    const groups = one("Microsoft.Network/privateEndpoints/privateDnsZoneGroups");
    expect(groups.copy?.count).toBe(SERVICES);
    expect(groups.condition).toBe("[not(equals(parameters('dnsMode'), 'none'))]");
    // The zone this mode made, or the existing one the firm picked for that service.
    expect(JSON.stringify(groups.properties)).toContain(
      "if(equals(parameters('dnsMode'), 'create'), resourceId('Microsoft.Network/privateDnsZones', format('privatelink.{0}.{1}', variables('services')[copyIndex()], environment().suffixes.storage)), variables('existingZones')[variables('services')[copyIndex()]])",
    );
    expect(template.variables.existingZones).toEqual({
      web: "[parameters('webDnsZoneId')]",
      blob: "[parameters('blobDnsZoneId')]",
    });
    expect(template.parameters.dnsMode.allowedValues).toEqual(["create", "existing", "none"]);
    expect(template.parameters.dnsMode.defaultValue).toBe("create");
  });

  it("puts a delete lock on the account", () => {
    const lock = one("Microsoft.Authorization/locks");
    expect(lock.properties?.level).toBe("CanNotDelete");
    expect(lock.scope).toBe(
      "[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]",
    );
  });

  it("sends blob writes and deletes to the firm's workspace, when it names one", () => {
    const setting = one("Microsoft.Insights/diagnosticSettings");
    expect(setting.condition).toBe("[not(empty(parameters('logAnalyticsWorkspaceId')))]");
    const logs = (setting.properties?.logs as { category: string; enabled: boolean }[]) ?? [];
    expect(
      logs
        .filter((l) => l.enabled)
        .map((l) => l.category)
        .sort(),
    ).toEqual(["StorageDelete", "StorageWrite"]);
  });

  it("grants write access only to the group the firm names, scoped to $web, and to no one when blank", () => {
    const grant = one("Microsoft.Authorization/roleAssignments");
    expect(grant.condition).toBe("[not(empty(parameters('writeGroupObjectId')))]");
    // Storage Blob Data Contributor, and no broader role.
    expect(template.variables.storageBlobDataContributor).toBe(
      "ba92f5b4-2d11-453d-a403-e96b0029c9fe",
    );
    expect(grant.properties?.roleDefinitionId).toBe(
      "[subscriptionResourceId('Microsoft.Authorization/roleDefinitions', variables('storageBlobDataContributor'))]",
    );
    expect(grant.properties?.principalType).toBe("Group");
    expect(grant.scope).toContain("$web");
  });

  it("deploys no script, no container, and no virtual machine", () => {
    for (const r of created)
      expect(r.type).not.toMatch(
        /deploymentScripts|ContainerInstance|virtualMachines|Microsoft\.Web\//,
      );
  });

  it("takes an existing subnet, and nothing about a pbiplint version", () => {
    const params = Object.keys(template.parameters).sort();
    expect(params).toEqual(
      [
        "blobDnsZoneId",
        "dnsMode",
        "location",
        "logAnalyticsWorkspaceId",
        "networkLocation",
        "storageAccountName",
        "subnetId",
        "webDnsZoneId",
        "writeGroupObjectId",
      ].sort(),
    );
    expect(template.parameters.subnetId.defaultValue).toBeUndefined();
  });

  it("gives the portal form an output for every parameter, and only for parameters", () => {
    const outputs = Object.keys(form.parameters.outputs).sort();
    const params = Object.keys(template.parameters).sort();
    expect(outputs).toEqual(params);
  });

  it("says on the form who may assign the write group's role", () => {
    expect(JSON.stringify(form)).toMatch(/Owner or User Access Administrator/);
  });
});
