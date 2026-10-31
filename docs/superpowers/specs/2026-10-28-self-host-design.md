# Self-hosting for security teams: spec (#93)

Issue: https://github.com/pbiplint/pbiplint/issues/93 (body, and the comments of
October 3 and October 6, 2026). Written October 28, 2026. Approved October 28, 2026, with seven review notes, folded in
below (section 9 lists them and where each lands).

Scope is the issue's boxes and nothing more: one self-hosting build switch, the version footer and
`/latest/`, a release archive, a zero-dependency egress check, one Azure template in this
repository, and one page. Parked routes (a firm's own web server, AWS, Google Cloud) stay parked;
containers and virtual machines are not considered.

## 1. The split into pull requests

| PR | What | Merges to | Goes live |
| --- | --- | --- | --- |
| 1 | Self-hosting build switch, version footer on both builds, `/latest/` on the public build, local build marker from git, site check over both builds | main, when green | pbiplint.com at merge: footer version and `/latest/` |
| 2 | Egress check script, and `release.yml` attaching the site archive, the script, `SHA256SUMS`, and a provenance attestation | main, when green | Nothing on the site; takes effect at the next release tag |
| 3 | Azure template (Bicep, compiled JSON, portal form) and its CI validation | main, when green | Nothing on the site |
| 4 | The page, the Promise's new line, `SECURITY.md` link, printable checklist | the next release branch, beside the version bump | pbiplint.com and the first archive, together, when that release ships |

The issue said "the release archive and the egress check first, then the Azure template and the
page". PR 1 comes ahead of them because the archive is the self-hosting build, so the switch must
exist before `release.yml` can build it, and because `/latest/` must be live first.

## 2. Sequencing against releases (technical call 1)

**Amended October 28, 2026.** The real test no longer passes an `archiveUrl`; see the note at the top of section 3.

- **PRs 1 to 3 merge to main as soon as each is green.** PR 1 puts "pbiplint 0.3.0" in every footer
  of pbiplint.com and serves `/latest/`, long before any copy links to it, which meets the comment of
  October 6: "before, or in the same release as". PR 2 changes nothing visible until a tag runs
  `release.yml`. PR 3 adds `deploy/azure/` and a CI job and changes nothing on the site.
- **PR 4 merges into the next release branch**, beside the version bump. The real Azure test runs
  from that branch before the release pull request merges: the button points at the branch's raw
  URL, and the archive is a self-hosting build of the branch, hosted temporarily in a test
  Azure environment and passed through the template's `archiveUrl` parameter.
- **One release then ships the page inside its own archive**, with the template and the archive
  already proven, so every internal copy carries its own instructions from the first archive on.
- **What the page says before the first archive exists:** nothing; it goes live with that release.
- **Known window, already accepted elsewhere:** links built from `VERSION` name the release's tag,
  which exists a few minutes after the release pull request merges (RELEASING.md step 1).

## 3. The Azure template (technical call 2)

**Amended October 28, 2026.** The [PR 3 plan](../plans/2026-10-28-self-host-pr3.md) replaced this design: no deployment script, one order (everything stays private from the start), the upload as plain commands run from inside the firm's network, and no `archiveUrl`, so the template deploys infrastructure only. Where this section or section 2 says otherwise, the plan stands. The text below is the design as first written.

**Where it lives: this repository, `deploy/azure/`.** A new repository would be outward-facing and would
separate the template from the archive it deploys. Here, one release tag pins
the template and the archive together, and CI sees both.

Files:

- `deploy/azure/main.bicep`: the source.
- `deploy/azure/azuredeploy.json`: compiled by `bicep build`, committed, never edited by hand
  (added to `.prettierignore`).
- `deploy/azure/createUiDefinition.json`: the portal form, so "existing virtual network and subnet"
  is a picker rather than a pasted resource ID.
- `deploy/azure/bicepconfig.json`: raises the linter rules that matter to errors.

**How the button gets its JSON:** the portal's documented form
`https://portal.azure.com/#create/Microsoft.Template/uri/<encoded template URL>/createUIDefinitionUri/<encoded form URL>`,
with both URLs on `raw.githubusercontent.com/pbiplint/pbiplint/v<VERSION>/deploy/azure/...`. That host
sends the CORS header the portal needs (release downloads redirect to a host that may not; verify
in PR 3's plan). The page builds the link from `VERSION` at build, so every copy of the page points
at the template of its own release, never at main.

**What it creates** (as the issue says): a StorageV2 account with `publicNetworkAccess: Disabled`,
`allowSharedKeyAccess: false`, `minimumTlsVersion: TLS1_2`, `allowBlobPublicAccess: false`; a private
endpoint on the `web` sub-resource with the `privatelink.web.core.windows.net` zone; a CanNotDelete
lock; diagnostic settings sending blob write and delete to a Log Analytics workspace the firm names;
a user-assigned identity with Storage Blob Data Contributor scoped to the account only; and a
deployment script (Azure CLI) that turns the static website on, downloads the archive from
`archiveUrl` (default: the release asset `pbiplint-site-<version>.zip` for the version), refuses it
unless its SHA-256 equals the parameter, and uploads it. Version and checksum have no defaults. A
firm whose script subnet cannot reach github.com puts the verified zip on an internal URL.

**Open technical points for PR 3's plan** (researched on Microsoft Learn, cited with links):

- A deployment script keeps its own storage account for a file share. Check whether that account
  must allow shared key access, and what that means for a firm whose Azure Policy denies it.
- The two orders the issue asks for: the script inside the firm's network (a subnet delegated to
  container instances and the script's account reachable from it), or upload first and then turn
  public access off. One parameter chooses; the page says what each exposes.
- Updates after lock-down (note 2, must be answered): with public access off and only a
  `web` private endpoint nothing reaches the blob endpoint. The in-network order needs a `blob`
  private endpoint and the `privatelink.blob.core.windows.net` zone; the upload-first order reopens
  public access for each update. Say which per order; the page's "Updates" covers both.
- Standing write access (note 3): Storage Blob Data Contributor outlives the deploy. Plan to keep it
  minimal (remove after the deploy, or scope to `$web`), and the page tells the firm to review it.
- Whether turning on the static website works with Entra-only auth from the script's identity, and
  which role that needs.

**How CI validates it with no cloud credentials:** a `template` job in `ci.yml` on every pull
request (seconds, so no path filter):

1. `az bicep build` with a pinned Bicep version (note 4: the compiled JSON carries the generator
   version and a template hash, so an unpinned Bicep fails the check on every Bicep update; the pin
   is also in `deploy/azure/README.md`) into a temporary file; fail if it differs from the committed `azuredeploy.json`, so the JSON the button
   deploys is always the Bicep that was reviewed.
2. `az bicep lint` with `bicepconfig.json`, failing on any error-level rule.
3. A vitest test that reads `azuredeploy.json` and `createUiDefinition.json` (no Azure needed) and
   asserts the lock-down: the four storage settings above, no default on version or checksum, the
   lock, the diagnostic setting, the role scoped to the account, and that every output of the form
   names a parameter the template declares and every required parameter is fed.

Left out: ARM-TTK (PowerShell, broader than the boxes need) and what-if in CI (needs credentials).

## 4. The egress check (technical call 3)

**One file, no dependencies: `packages/web/egress/egress-check.mjs`.** Node 22 or later (Node 20
reached end of life in April 2026; the script says so if run on older Node). It drives a Chrome or
Edge the firm already has over the Chrome DevTools Protocol, using Node's built-in `WebSocket`, so
nothing is installed from npm and the firm's registry mirror is not involved.

```
node egress-check.mjs https://<account>.z13.web.core.windows.net/ [--browser <path>]
```

- Launches the browser headless with a fresh temporary profile and `--remote-debugging-port=0`,
  reads the port from `DevToolsActivePort`, and attaches a request watch before the first
  navigation (the same rule as `e2e/fixtures.ts`).
- Loads the home page, clicks "Try the sample project", waits for the results, then visits the
  rules index, one rule page, the Privacy Promise, and the About page.
- Fails on any `http`, `https`, `ws`, or `wss` request whose origin is not the URL's origin,
  including requests the browser blocked (they still show the page tried), and on any console error.
- Prints a short report: the URL, the build marker and version read from the page, the date and
  time, each page visited, and "0 requests left the origin" or the list. That report fills the
  checklist's egress blank.
- Without `--browser`, looks in the usual Chrome and Edge install paths on Windows, macOS, and
  Linux.
- Managed Chrome or Edge can turn remote debugging off by policy (`RemoteDebuggingAllowed`). The
  script detects that and says so plainly; the page says the check runs from any machine that
  reaches the site, such as a build agent (note 6).
- It watches every target the browser opens, not only the page. The site has no workers today; a
  note in the script says a worker would need watching too.

**Built on the e2e watch:** the off-origin rule moves into the script as an exported function
(`leavesOrigin(url, origin)`), and `e2e/fixtures.ts` imports it, so the test suite and the firm's
check apply one rule.

**How it ships:** attached to every release beside the archive as
`pbiplint-egress-check-<version>.mjs`, listed in the same `SHA256SUMS`, covered by the same
attestation. Not inside the site archive, which would serve it to every
browser for no reason.

**How it is tested:** unit tests for `leavesOrigin` and argument handling; in the CI e2e job, after
Playwright, a step builds the self-hosting site and `npm run check:egress` (scripts/check-egress.mjs)
serves it with `vite preview` and runs the script
with Playwright's own Chromium (`--browser`), expecting exit 0; and a negative run against a
one-line page that loads an image from a second local port, expecting exit 1 and that URL in the
report.

## 5. PR 1 plan: the self-hosting build, the footer version, and `/latest/`

The switch: `npm run build -w @pbiplint/web -- --mode self-host`. Vite's mode reaches every plugin,
needs no new environment variable, and reads plainly in the page's build-from-source steps.

Tasks (each test first):

1. **Build marker from git.** `buildMarker` falls back to `git rev-parse HEAD` sliced to 7, exactly
   as CI slices `GITHUB_SHA` (note 5: `--short=7` grows when a prefix is ambiguous), and to `dev`
   only when git is unavailable (a source tarball). Without git the self-hosting footer shows no
   date and keeps the link. Add
   `commitDate()` from `git log -1 --format=%cI`, formatted long-form in UTC ("October 4, 2026").
   Unit tests with an injected runner.
2. **The footer version.** Every page's footer (the `FOOTER` constant in `pages.ts` and the
   hand-written one in `index.html`) carries one marker comment, and `buildInfoPlugin`'s
   `transformIndexHtml` replaces it on every page, in dev and build. Public build: "pbiplint
   0.3.0". Self-hosting build: "pbiplint 0.3.0, from October 4, 2026. Check for a newer version",
   the last words a link to `https://pbiplint.com/latest/#0.3.0` in a new tab with
   `noopener noreferrer`, styled as a link. Tests on the transform for both modes.
3. **`/latest/` on the public build only.** A generated page (`page()` with a script
   `/src/latest.ts`). Without script it reads "The latest pbiplint is 0.3.0." The script reads
   `location.hash`, accepts only `^#\d+\.\d+\.\d+$`, compares with `VERSION`, and writes one of
   "You're up to date", "Your copy is 0.2.5; the latest is 0.3.0. Ask your IT team to update,"
   (linking the releases page, and the update steps once PR 4 lands), or a plain fallback for a
   missing or unparsable fragment. `textContent` only; listens for `hashchange`. Unit tests in
   happy-dom for current, older, newer (treated as up to date, no claim about the future),
   unparsable, and script-like fragments.
4. **Self-hosting differences.** `generateSite({ selfHost })`: no `/latest/` page and no sitemap,
   and it removes stale copies of both left by an earlier public build (they live in gitignored
   source folders and would otherwise be picked up). A small plugin in self-host mode writes
   `robots.txt` as `User-agent: *` and `Disallow: /`, and leaves `CNAME` out of `dist`. Tests on
   `generateSite`.
5. **The site check over both builds.** `siteCheckPlugin` gains shape checks per mode: the public
   build must have `latest/index.html`, `sitemap.xml`, and `CNAME`, and no page with the
   newer-version link; the self-hosting build must have none of those three, `Disallow: /`, and the
   link on every page. `ci.yml`'s test job adds the self-hosting build after the public one. Unit
   tests for the check.
6. **e2e.** `/latest/` with `#0.3.0`, `#0.0.1`, `#nonsense`, and an HTML-looking fragment, under the
   existing watch (no request, no console error); the footer version on the home page and a rule
   page; axe on `/latest/`.

Left out: any hostname test in `nav.ts` (dropped by the comment of October 6), and a date on the
public footer (also per that comment).

## 6. PR 2 plan: the archive and the egress check

1. The script, its unit tests, and `fixtures.ts` importing `leavesOrigin` (section 4).
2. The e2e job's self-hosting build, preview, and the positive and negative runs of the script.
3. `scripts/site-archive.mjs`, unit tested: builds nothing itself; zips `packages/web/dist` with the
   files at the zip's root (so they upload straight into `$web`) as `pbiplint-site-<version>.zip`,
   copies the script, and writes `SHA256SUMS` over both. The YAML holds only calls.
4. `release.yml`'s publish job, before `node scripts/publish.mjs` (so a failure stops before
   anything reaches npm; the job stays safe to rerun because publish skips what is already there):
   build with `--mode self-host`, run the archive script, run `actions/attest-build-provenance`
   (pinned by SHA) on both files, and pass all three to the existing release step's `files:`. The
   job already has `id-token: write` for npm, so it gains only `attestations: write`; the
   workflow's top-level `permissions: {}` stays (note 7). The archive is built from the same checked-out SHA as the
   packages.
5. `RELEASING.md`: what the release now carries, and a step to check it: download, `sha256sum -c`,
   `gh attestation verify --repo pbiplint/pbiplint`, and the build marker in `index.html` equal to
   the tag's commit.

The attestation step can only be proven by the first real release; everything else runs locally
and in CI first.

## 7. PR 3 and PR 4 outlines

Each gets its own detailed plan before its code, once the research points in
section 3 are answered.

- **PR 3:** section 3. Output: the three files plus `bicepconfig.json`, the CI job, the vitest test,
  and a short `deploy/azure/README.md` pointing to the page.
- **PR 4:** `content/self-host.md` at `/self-host/`, titled "Host pbiplint yourself", in `CONTENT_PAGES`, covering the issue's
  sections 1 to 7 and the "Updates" text from the comment of October 6 (Watch, Custom, Releases;
  the `releases.atom` feed); the Promise's line under "How to check it", "If your company must approve pbiplint before
  you use it, send your security team that page."; the `SECURITY.md` link; `/latest/`'s update-steps
  link; the checklist as its own page. No footer link. Every quote of Microsoft Learn on the page carries its
  link. The site check already keeps the page free of external resources.

## 8. Done when, and where each box lands

- Page live, linked from the Promise and `SECURITY.md`, the Promise's new line: PR 4.
- Template deployed end to end from its button into a test Azure environment, egress check passing
  against it: from the release branch, before the release pull request merges.
- A security team can go from a release to a locked-down copy and a passing check using only the
  page: checked by following the page draft during that same test.
- Version in every footer, commit date and link on self-hosted copies, `/latest/` answering for
  current, older, and unparsable versions with no request: PR 1.
- Site check over both builds; the self-hosting build has no `/latest/` and no sitemap, and the
  public build has no link: PR 1.
- Egress check runs against the self-hosting build: PR 2 (CI) and the deployment test.
- `release.yml` attaches the self-hosting build: PR 2.

## 9. Review notes (October 28, 2026)

1. PR 4 goes into the next release branch; the real test runs from it; `archiveUrl` parameter
   (later dropped; see section 3's amendment).
   Folded into sections 1, 2, 3.
2. Updates after lock-down, per order: section 3, answered in PR 3's plan.
3. Standing write access kept minimal: section 3, PR 3's plan.
4. Pin Bicep for the drift check: section 3.
5. Build marker sliced like CI; footer without git: section 5, task 1.
6. Remote debugging off by policy; every target watched: section 4.
7. Only `attestations: write` added; top-level `permissions: {}` kept: section 6.

## 10. Progress

- PR 1: [#243](https://github.com/pbiplint/pbiplint/pull/243).
- PR 2: [#244](https://github.com/pbiplint/pbiplint/pull/244).
- PR 3: [#245](https://github.com/pbiplint/pbiplint/pull/245).
- PR 4: [#246](https://github.com/pbiplint/pbiplint/pull/246).

The template was tested end to end in a test Azure environment on October 29, 2026, and the form bug it found is fixed.
