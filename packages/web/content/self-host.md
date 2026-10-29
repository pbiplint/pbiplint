---
title: Host pbiplint yourself
description: For a security team, how to run a verified, pinned copy of pbiplint inside your own Azure network, lock it down, and prove that nothing leaves it.
---

# Host pbiplint yourself

pbiplint.com uploads nothing: the [pbiplint Privacy Promise](/privacy/) says so and shows how to check it. A firm that uses it still takes two things on trust: that the site serves the same code tomorrow that it serves today, and that the site itself is never compromised. A copy you verify, pin to a version, and serve yourself removes both. This page is for the security team that has to approve that copy: what you are approving, how to deploy it into your own Azure subscription, how to lock it down, and how to prove that no model, report, or finding ever leaves your network.

pbiplint ships one thing for this: the site's static files, the same ones that make up pbiplint.com, as an archive on every release. There is no server, container, or hosted service to run, and nothing to patch. A [printable checklist](/self-host/checklist/) records each check below for your approval ticket.

<h2 id="approve">What you are approving</h2>

- **What the storage holds.** HTML pages, their scripts and stylesheet, the bundled font, a favicon, the JSON schema, and a few text files. No server-side code, no API, no database, and no account.
- **What the browser does with it.** It reads only the files a person chooses, holds them in memory in the tab, and writes nothing except a download the person asks for. It stores nothing: no cookies, local storage, session storage, or IndexedDB. The sample project is built into the page, so trying it needs no request either.
- **The threat model, in two lines.** The host holds no user data and runs nothing, so the risks to manage are the supply chain of the files themselves and who can replace them. And every page carries a Content-Security-Policy with `connect-src 'none'`, so the browser itself refuses to let the page open a connection of any kind.

<h2 id="get">Get the files and verify them</h2>

Each [release](https://github.com/pbiplint/pbiplint/releases) carries four files for this, built by the release workflow from the tagged commit:

| File | What it is |
| --- | --- |
| `pbiplint-site-{{version}}.zip` | The site, with its files at the root of the zip. |
| `pbiplint-egress-check-{{version}}.mjs` | The [egress check](#egress-check). |
| `SHA256SUMS` | The SHA-256 of both. |
| `pbiplint-site-{{version}}.sigstore.json` | Their build provenance attestation. |

Download them from the [v{{version}} release page](https://github.com/pbiplint/pbiplint/releases/tag/v{{version}}), or with the GitHub CLI:

```bash
gh release download v{{version}} --repo pbiplint/pbiplint
```

Then check them:

- **Required: the checksum.** `shasum -a 256 -c SHA256SUMS` (macOS and Linux) prints `OK` for both files. On Windows, `Get-FileHash pbiplint-site-{{version}}.zip -Algorithm SHA256` prints a hash that must equal the zip's line in `SHA256SUMS`.
- **Stronger: the attestation.** It proves the files were built by pbiplint's own release workflow from the tagged commit, not merely that they match a checksum published beside them. With the [GitHub CLI](https://cli.github.com/), and no GitHub sign-in needed when it is given the bundle:

  ```bash
  gh attestation verify pbiplint-site-{{version}}.zip --repo pbiplint/pbiplint \
    --bundle pbiplint-site-{{version}}.sigstore.json
  ```

**Or build from source** at the release tag, on Node 20.19 or later 20, or 22.12 or later:

```bash
git clone https://github.com/pbiplint/pbiplint.git
cd pbiplint
git checkout v{{version}}
npm ci
npm run build -w @pbiplint/web -- --mode self-host
```

The site is then in `packages/web/dist`, the same files the archive holds. `--mode self-host` is what makes it the self-hosting build: it leaves out what only pbiplint.com needs (its domain file, its sitemap, and the `/latest/` page), tells search engines to stay out, and adds a line to every page's footer naming the version and the date of its commit, with a link to check for a newer version.

**Read the build marker.** Every page carries `<meta name="pbiplint-build" content="...">` with the first seven characters of the commit it was built from. View the source of any page of your copy and compare it with the tag's commit.

<h2 id="deploy">Deploy it in Azure</h2>

The template creates a private home for the files in your own subscription. It is a declarative template you can read before it runs ([the template and its form](https://github.com/pbiplint/pbiplint/tree/v{{version}}/deploy/azure)), not a script.

[Deploy to Azure](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fpbiplint%2Fpbiplint%2Fv{{version}}%2Fdeploy%2Fazure%2Fazuredeploy.json/createUIDefinitionUri/https%3A%2F%2Fraw.githubusercontent.com%2Fpbiplint%2Fpbiplint%2Fv{{version}}%2Fdeploy%2Fazure%2FcreateUiDefinition.json)

**What it creates**, in the resource group you pick:

- A storage account serving the site as a [static website](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website), with public network access off, shared key access off (only Microsoft Entra identities can touch it), and TLS 1.2 at minimum.
- Two [private endpoints](https://learn.microsoft.com/en-us/azure/storage/common/storage-private-endpoints) on a subnet you already run: `web`, which browsers use to load the site, and `blob`, which the upload below uses, since the `web` endpoint only serves.
- Private DNS for both, one of three ways (below).
- A delete lock on the account.
- Optionally, a diagnostic setting that sends every write and delete of the files to your Log Analytics workspace, and write access to the files for one Entra group.

It creates no script, container, or virtual machine, and it takes no pbiplint version: the files go up afterwards, so one deployment serves every release.

**The form, field by field:**

| Field | What it means |
| --- | --- |
| Region | Where the storage account lives. The private endpoints go in your network's own region, whatever you pick here. |
| Storage account name | 3 to 24 lowercase letters and digits, unique across Azure. It becomes part of the site's address. |
| Virtual network and subnet | An existing network in this subscription, in any resource group. A new, unpeered network would reach no one, so the template does not create one. |
| Private DNS records | **Create the two privatelink zones here** suits only a network that uses Azure-provided DNS, since [private zones answer only queries that reach Azure DNS](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns-integration). **Use existing zones** is for a network linked to central `privatelink.web.core.windows.net` and `privatelink.blob.core.windows.net` zones, since a network cannot link two zones of the same name. **None** is for a firm whose Azure Policy writes private endpoint records itself. |
| Log Analytics workspace | Optional. Receives the account's write and delete events, so any change to the files shows up. |
| Entra group | Optional. The object ID of the one group that may change the files. Its members get Storage Blob Data Contributor on the site's `$web` container and nothing else. Left blank, the template assigns nothing. |

**The permissions the deployment needs:**

- Contributor on the resource group you deploy into.
- On the subnet, `Microsoft.Network/virtualNetworks/subnets/join/action`, which a network team often holds for a network in its own resource group.
- With **Create** zones: `Microsoft.Network/virtualNetworks/join/action` on the network, to link the zones to it.
- With **Use existing** zones: `Microsoft.Network/privateDnsZones/join/action` on each zone.
- To assign the Entra group: Owner or User Access Administrator on the resource group. Without either, leave the group blank and ask whoever has it to assign Storage Blob Data Contributor on the `$web` container.

**Preview before it runs.** The portal's last step lists every resource it will create. From the Azure CLI, `az deployment group what-if` shows the same without changing anything:

```bash
az deployment group what-if --resource-group <group> \
  --template-uri https://raw.githubusercontent.com/pbiplint/pbiplint/v{{version}}/deploy/azure/azuredeploy.json \
  --parameters storageAccountName=<name> subnetId=<subnet resource ID> networkLocation=<network region>
```

**The site's address** is the account's static website endpoint, shown on the deployment's Outputs tab as `siteUrl`: `https://<account>.z<number>.web.core.windows.net/`. HTTPS works on it with no certificate of your own, which the "Choose a folder" button needs. A friendlier name such as `pbiplint.corp.example` would need a gateway in front of the account, which this template does not cover.

**What it costs.** About $16 a month, nearly all of it the two private endpoints at [$0.01 an hour each](https://azure.microsoft.com/en-us/pricing/details/private-link/). The two DNS zones are [$0.50 a month each](https://azure.microsoft.com/en-us/pricing/details/dns/), and storage and logging for a site this size cost cents.

<h2 id="upload">Upload the files</h2>

From any machine inside your network that resolves the account's private names, signed in to Azure as a member of the group that may change the files (`az login`), in the folder where you [verified the release](#get):

```bash
unzip pbiplint-site-{{version}}.zip -d site
az storage blob delete-batch --account-name <account> --source '$web' --auth-mode login
az storage blob upload-batch --account-name <account> --destination '$web' --source site --auth-mode login
az storage blob upload-batch --account-name <account> --destination '$web' --source site \
  --pattern '*.js' --content-type 'text/javascript' --overwrite --auth-mode login
az storage blob upload-batch --account-name <account> --destination '$web' --source site \
  --pattern '*.css' --content-type 'text/css' --overwrite --auth-mode login
```

On Windows, `Expand-Archive pbiplint-site-{{version}}.zip site` replaces `unzip`; the `az` commands are the same in PowerShell.

- **Why empty `$web` first.** A release can remove a page, such as a retired rule's. Emptying the container first means no page from an older release is left behind. The copy is unavailable for the minute or so the upload takes, so update outside working hours.
- **Why the last two commands.** Browsers refuse a module script or a stylesheet served with the wrong type, and the Azure CLI guesses types from the operating system's own table, which on some Windows machines maps `.js` to plain text. The last two commands set both types explicitly.

Open the site's address from a machine on the network, then [run the egress check](#egress-check) against it.

<h2 id="lock-down">Lock it down</h2>

- **The account as the template leaves it.** Public network access off, so it is reachable only through the private endpoints. Shared key access off, so only Entra identities can read or change the files. TLS 1.2 at minimum. To confirm: `az storage account show --name <account> --query "{publicNetworkAccess: publicNetworkAccess, allowSharedKeyAccess: allowSharedKeyAccess, minimumTlsVersion: minimumTlsVersion}"`.
- **Who can change the files.** With no server, the one thing worth attacking is write access to the `$web` container. Grant it to one group only, keep that group small, and review its role assignment and membership as you review any other privileged access.
- **What the lock does.** The delete lock keeps the account, its role assignments, and its diagnostic setting from being deleted by mistake. It does not protect the files themselves: anyone with write access can still change or delete them, which is what the log is for. To take the group's access away, remove its members, or lift the lock, delete the role assignment, and put the lock back.
- **Logging.** With a workspace named, every write and delete of the files reaches it as `StorageWrite` and `StorageDelete` events. A normal update looks like a burst of deletes, then a burst of writes, from a member of the group, at a time you planned. Alert on any write or delete by anyone outside the group, or at any other time.

<h2 id="update">Updates</h2>

- **Hear about releases.** On [the repository](https://github.com/pbiplint/pbiplint), choose Watch, then Custom, then Releases. Or follow the feed at `https://github.com/pbiplint/pbiplint/releases.atom` in your own reader or monitoring.
- **Your users can tell you.** Every page of your copy names its version and the date of its commit in the footer, beside a "Check for a newer version" link. The link opens pbiplint.com's `/latest/` page in a new tab with your copy's version after the `#`, which a browser never sends to the server, so pbiplint.com does not learn which version you run. The page compares the two in the tab and says whether to ask you for an update. It is a link a person chooses to follow, and your copy itself makes no request to find out.
- **Redeploy the whole site at once.** The linter and the rule pages change together, so an update is the same steps as the first time: [get and verify](#get) the new release, then [upload it](#upload). The template does not need to run again.

<h2 id="check">Watch the network and prove it</h2>

### In the browser

Open the developer tools on the Network tab, turn on "Preserve log", load your copy, lint a real model, and export a HAR file. Every request is for the page's own files at your copy's address, and none follows the drop.

### At your egress

Watch your forward proxy or secure web gateway logs for a test workstation during a lint. They should show nothing beyond links a person chooses to follow. There is no server to watch: the storage account serves files and runs nothing.

<h3 id="egress-check">With the egress check, after every deploy and on a schedule</h3>

`pbiplint-egress-check-{{version}}.mjs`, from the release, runs with Node 22 or later and a Chrome or Edge already on the machine, and installs nothing:

```bash
node pbiplint-egress-check-{{version}}.mjs https://<account>.z<number>.web.core.windows.net/
```

It opens your copy in a headless browser with a fresh profile and watches every request from before the first one, from the page and from any frame or worker it starts. It lints the sample project built into the site, then opens the rules index, a rule page, the Privacy Promise, and About. It exits 0 when every request stayed on your copy's own address and no page wrote a console error, 1 otherwise, listing what it saw, and 2 when it could not run at all. Its report names the address, the time, the browser, and the version and build marker it found: what the checklist asks for.

- **Which browser.** It looks for Edge and Chrome where Windows, macOS, and Linux install them; `--browser <path>` names one.
- **A managed browser.** A browser whose policy turns remote debugging off (`RemoteDebuggingAllowed`) cannot be driven, and the check says so. Run it from any machine that can reach your copy and whose browser allows it, such as a build agent.
- **A Linux build agent.** Some refuse the browser's sandbox, and the browser then exits at once. `--no-sandbox` lets it start, by turning off Chrome's own isolation of the page's process. Use it only where the sandbox cannot run, and only against your own copy, which is all the check opens.

### What you will see, and why it is fine

- **Links.** Rule pages link to Microsoft Learn, GitHub, YouTube, and community blogs. Following one is a navigation the person chooses, in a new tab, and every page sets `no-referrer`, so your copy's address is not sent with it.
- **Names of pbiplint.com.** Each page's canonical link names `https://pbiplint.com`, which a browser never fetches; it only tells search engines which copy is the original.
- **Nothing from a project in a URL.** Nothing from a linted project is ever placed in a URL: the results are built in the tab, and an export is a download made in the tab.

<h2 id="headers">What a static host cannot do</h2>

An Azure static website cannot set response headers. The policy that enforces the no-request rule is in every page and holds regardless. What is lost:

- `frame-ancestors`, which would stop another site from framing the page.
- `X-Content-Type-Options: nosniff`. The [upload](#upload) sets the script and stylesheet types explicitly for this reason.
- Reports of policy violations, since a policy set in a page cannot send them.

The risk is low for a tool that stores nothing, changes nothing, and runs only inside your network. A web server of your own could send those headers; that route is not covered here, so [comment on the issue](https://github.com/pbiplint/pbiplint/issues/93) if your firm needs it.

<h2 id="cli">The command line and the GitHub Action</h2>

[The pbiplint CLI](/cli/) makes no network requests either; installing it is the only network step. `npx pbiplint` fetches from the public npm registry, so install it through your own registry mirror (Artifactory, Nexus, Azure Artifacts, and the like), or from the tarball `npm pack pbiplint` writes. Neither package has runtime dependencies. [The GitHub Action and the Azure Pipelines task](/pipelines/) run the same command line, so the same applies to your own runners and agents.

<h2 id="license">The license</h2>

pbiplint is free software under the [GNU Affero General Public License, version 3 or later](https://github.com/pbiplint/pbiplint/blob/main/LICENSE). Hosting an unmodified copy inside your firm asks nothing more of you. If you modify the code and let people use the modified site over a network, you must offer those users the modified source ([section 13](https://www.gnu.org/licenses/agpl-3.0.html#section13)). For anything beyond that, ask your own counsel.
