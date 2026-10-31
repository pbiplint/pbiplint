# PR 3 plan: the Azure template (#93)

Written October 28, 2026, after a ruling of the same day: no deployment script, one
order (everything stays private from the start), the upload as plain commands run from inside the
firm's network, `archiveUrl` dropped.

## What the button creates

`deploy/azure/main.bicep`, compiled to `azuredeploy.json`, with `createUiDefinition.json` as the
portal form. Every resource in the resource group the firm picks.

- **Storage account** (StorageV2, Standard_LRS by default): `publicNetworkAccess: Disabled`,
  `allowSharedKeyAccess: false`, `minimumTlsVersion: TLS1_2`, `allowBlobPublicAccess: false`,
  `supportsHttpsTrafficOnly: true`, `defaultToOAuthAuthentication: true`.
- **Static website** through `blobServices/default` at API 2025-08-01 or later:
  `staticWebsite { enabled: true, indexDocument: 'index.html', errorDocument404Path: '404.html' }`
  ([change log](https://learn.microsoft.com/en-us/azure/templates/microsoft.storage/change-log/storageaccounts/blobservices#2025-08-01)).
  Fallback if the live test shows it does not take or does not create `$web` (note 4):
  `az storage blob service-properties update --account-name <a> --static-website --index-document index.html --404-document 404.html --auth-mode login`,
  which needs `Microsoft.Storage/storageAccounts/blobServices/write`; the least built-in role
  holding it is Storage Account Contributor
  ([permissions](https://learn.microsoft.com/en-us/rest/api/storageservices/set-blob-service-properties#permissions)).
  The page would then name it as a step after the deploy.
- **Two private endpoints** on the subnet the firm picks: `web` (how browsers reach the site) and
  `blob` (how the upload reaches the files; the `web` endpoint is read-only)
  ([private endpoints](https://learn.microsoft.com/en-us/azure/storage/common/storage-private-endpoints#creating-a-private-endpoint)).
- **DNS** (note 1), one form choice:
  - Create `privatelink.web.core.windows.net` and `privatelink.blob.core.windows.net`, link them to
    the network, and attach them to the endpoints with `privateDnsZoneGroups` (the default).
  - Use existing zones the firm picks (two resource IDs): only the zone groups are created. For a
    firm with central hub zones; a network cannot link two zones of one name.
  - None: the firm's own Azure Policy writes the records. The template creates no zone or group.
- **Delete lock** (CanNotDelete) on the account.
- **Diagnostic setting** on `blobServices/default` sending `StorageWrite` and `StorageDelete` to a
  Log Analytics workspace the firm picks
  ([sample](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/resource-manager-diagnostic-settings#diagnostic-setting-for-azure-storage)).
  Optional: left blank, no setting, and the page says why it matters.
- **Optional write group** (note 6): an Entra group object ID; if given, Storage Blob Data
  Contributor scoped to the `$web` container
  ([assign role](https://learn.microsoft.com/en-us/azure/storage/blobs/assign-azure-role-data-access)).
  If ARM refuses `$web` as a scope in the live test, scope to the account with an ABAC condition
  naming `$web`
  ([ABAC example](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-auth-abac-examples#example-read-write-or-delete-blobs-in-named-containers)).
  Blank assigns nothing. The form says assigning needs Owner or User Access Administrator.
- **Outputs:** the site's address (`primaryEndpoints.web`), the account name, and the upload
  commands with the account name filled in.

No version, checksum or archive parameter: the template deploys infrastructure only, so one
template serves every release. (It is still pinned to a tag by the button, so what a firm reviews
is fixed.)

## The upload (first deploy and every update)

From any machine inside the network that resolves both private names, signed in with
`az login` as a member of the write group:

```
gh release download v<version> --repo pbiplint/pbiplint      # or the release page in a browser
shasum -a 256 -c SHA256SUMS                                   # required; Windows: Get-FileHash
gh attestation verify pbiplint-site-<version>.zip --repo pbiplint/pbiplint \
  --bundle pbiplint-site-<version>.sigstore.json              # stronger; no GitHub sign-in needed
unzip pbiplint-site-<version>.zip -d site                     # Windows: Expand-Archive
az storage blob delete-batch --account-name <a> --source '$web' --auth-mode login
az storage blob upload-batch --account-name <a> -d '$web' -s site --auth-mode login
az storage blob upload-batch --account-name <a> -d '$web' -s site --pattern '*.js' \
  --content-type 'text/javascript' --overwrite --auth-mode login
az storage blob upload-batch --account-name <a> -d '$web' -s site --pattern '*.css' \
  --content-type 'text/css' --overwrite --auth-mode login
```

- **Stale files (note 2):** emptying `$web` first means a page a release removed is never left
  behind, with no azcopy download. The cost is that the copy is unavailable for the minute or so
  the upload takes; the page says so and suggests updating outside working hours. Order within the
  upload is moot once the container starts empty, so the simplest order wins.
- **Content types (note 3):** module scripts and stylesheets are MIME-checked strictly, and the
  CLI guesses types from the operating system's table, which on Windows can map `.js` to
  `text/plain`. So `.js` and `.css` are set explicitly. The live test reads back every extension
  in the build (`.html`, `.js`, `.css`, `.woff2`, `.json`, `.svg`, `.txt`, and any other the dist
  holds) with `az storage blob show`, and adds an explicit pattern for any that comes back wrong.
- **Verification (note 5):** `gh attestation verify` needs a signed-in gh unless given the
  bundle; with `--bundle`, verified October 28, 2026 against cli/cli's release with gh 2.102.0 and
  no sign-in (and a tampered file fails). So PR 2 also attaches the attestation bundle as
  `pbiplint-site-<version>.sigstore.json`. SHA-256 stays the required step, the attestation the
  stronger one.

## CI with no cloud credentials

A `template` job in `ci.yml`:

1. `az bicep install --version <pinned>` (note 4 of the spec review), then `az bicep build
   --file deploy/azure/main.bicep --stdout` compared with the committed `azuredeploy.json`; a
   difference fails with the command that regenerates it.
2. `az bicep lint` with `deploy/azure/bicepconfig.json` (error-level rules).
3. A vitest test over `azuredeploy.json` and `createUiDefinition.json` that asserts the lock-down
   settings above; the static website block; both endpoints; the three DNS modes, with no zone
   resources in the "existing" or "none" modes; the lock; the role assignment only when the group
   is given, scoped to `$web`; and that every form output names a template parameter and every
   parameter without a default is fed by the form.

The pinned Bicep version is also written in `deploy/azure/README.md`, with the regenerate command.

## Tests first

The vitest assertions are written against a hand-written expectation before the Bicep exists,
then the Bicep is written until `bicep build` produces JSON that passes them.

## Left out

- The deployment script, the upload-first order, `archiveUrl` (October 28, 2026).
- ARM-TTK and what-if in CI.
- A custom domain or gateway (the issue's own scope).

## The real test (on the release branch)

Deploy from the branch's raw URL in a test Azure environment, each DNS mode at least once if cheap
(the "existing" mode needs zones made first), upload a self-hosting build of the branch with the
commands above, read back content types, open the site from a machine on the network, run the
egress check against it, then delete the resource group (the lock must be removed first; the page
says how).

## Issue update (note 7)

A dated comment on #93 recording the change with these links, and the body's "The Azure template"
section edited to match. Done when unchanged.

## Notes on approval (October 28, 2026)

1. **Deployer permissions, network elsewhere.** The network may sit in a networking team's resource
   group (the form's network picker reaches beyond the target group). The template takes
   the subnet's full resource ID, places both endpoints in the network's region (read from the
   existing network), and the zone links (create mode) in the zones' group. The page lists the
   permissions per DNS mode: always Contributor on the target group plus
   `Microsoft.Network/virtualNetworks/subnets/join/action` on the subnet; create mode adds
   `Microsoft.Network/virtualNetworks/join/action` on the network (for the zone links); existing
   mode adds `Microsoft.Network/privateDnsZones/join/action` on each zone; the optional group
   assignment adds Owner or User Access Administrator. (Confirm each action name against Learn
   while writing the page.)
2. **Existing network only.** No "new network" option; issue body edited. The test makes its
   network with one `az network vnet create` first.
3. **Test machine.** The real test adds a small Windows VM with no public IP in the test resource
   group, reached through Azure Bastion's free Developer tier (still offered, select regions, VM
   needs no public IP: [Bastion quickstart](https://learn.microsoft.com/en-us/azure/bastion/quickstart-developer)).
   Edge on it opens the site and runs the egress check. Test-only: never in the template or on the
   page as something a firm needs.
4. **Logs.** An update shows as a burst of StorageDelete then StorageWrite from the write group;
   the page's Logging part says so and suggests alerting on writes by anyone outside the group.
5. **Where the JSON test lives.** `packages/web/test/azure-template.test.ts`, inside vitest's
   `packages/*/test/**/*.test.ts` include, so `npm test` and CI's test job run it. The new
   `template` job runs only the Bicep build drift check and lint.

No Azure calls until the release branch.

## For the real test, from the branch review (October 28, 2026)

- Open createUiDefinition.json in the portal's CreateUiDefinition sandbox first: the workspace selector can be left empty, the subnet list
  leaves out reserved subnets, the existing-zone pickers work.
- Confirm that the template's static website creates `$web` before the role assignment needs it,
  and that ARM accepts `.../containers/$web` as a scope. Fallback: declare `$web` in the template.
- Confirm `NxDomainRedirect` on the `privatelink.web` link (Learn shows it with blob).
- Confirm CI's Linux Bicep build is byte-identical to the Mac one (the first CI run shows it).
- The page says create mode suits only networks on Azure-provided DNS, the lock protects the
  account and not the files, and how to revoke the group's access under the lock.
- From PR 4's review: deploy once as a Contributor-only identity to confirm the lock fails without
  User Access Administrator (the page and form now say so), and confirm `gh attestation verify`
  with `--signer-workflow` and `--source-ref refs/tags/v<version>` against the first real release.
