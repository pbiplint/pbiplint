# pbiplint in Azure

The template behind the Deploy to Azure button on [Host pbiplint yourself](https://pbiplint.com/self-host/),
which walks through it from the form to a passing egress check. It creates the infrastructure for a
private copy of pbiplint inside your own Azure network:

- A storage account serving the site as a static website, with public network access and shared
  key access off and TLS 1.2 at minimum.
- Two private endpoints on a subnet you already run: `web`, which browsers use, and `blob`, which
  uploads use.
- Private DNS for both, created here, taken from zones you already have, or left to your own Azure
  Policy.
- A delete lock on the account (not on the files in it), and optionally the account's blob write and delete events sent to a Log Analytics
  workspace, and write access to the site's files for one Entra group.

The lock keeps the account, its role assignments, and its diagnostic setting from being deleted;
it does not stop anyone with write access from changing or deleting the files, which is what the
log is for. To take the group's write access away, remove its members, or lift the lock, delete the
role assignment, and put the lock back.

It deploys no script, container, or virtual machine, and nothing about a pbiplint version: the
site's files are uploaded afterwards from a machine inside the network, with the commands the page
gives, so one template serves every release.

## Files

- `main.bicep`: the source.
- `azuredeploy.json`: what the button deploys, compiled from `main.bicep`. Never edit it by hand.
- `createUiDefinition.json`: the portal form.
- `bicepconfig.json`: the linter rules CI holds the template to.

## Changing the template

Edit `main.bicep`, then compile it with Bicep 0.48.1, the version CI pins, so the compiled file
carries the same generator version and hash:

```bash
az bicep install --version v0.48.1
~/.azure/bin/bicep build deploy/azure/main.bicep --outfile deploy/azure/azuredeploy.json
~/.azure/bin/bicep lint deploy/azure/main.bicep
npx vitest run packages/web/test/azure-template.test.ts
```

CI fails a pull request whose `azuredeploy.json` is not what `main.bicep` compiles to, or whose
Bicep fails the linter, and `npm test` checks that the compiled template keeps the site locked
down. None of it needs an Azure sign-in.
