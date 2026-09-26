# Releasing pbiplint

Two packages ship together at the same version: `@pbiplint/core` and `pbiplint` (the command
line, which bundles the core). The site at pbiplint.com deploys itself on every push to main and
is not versioned.

## One-time setup

Do these once, at the first release, not before.

1. Create the npm organization `pbiplint`, with Michael's npm account as owner and two-factor
   authentication on.
2. Publish the first version of each package by hand (see "First release" below). This comes first
   because npm only lets a trusted publisher be configured on a package that already exists.
3. Configure trusted publishing on npmjs.com for each package: package settings, "Trusted
   publisher", GitHub Actions, organization `pbiplint`, repository `pbiplint`, workflow file
   `release.yml`, environment left blank.
4. Under "Allowed actions" on that same panel, tick **Allow `npm publish`**, for each package.
   This one is easy to miss and nothing local can catch it. A new trusted publisher is created
   with `npm stage publish` permission only, which uploads a package and waits for a human to
   promote it. This workflow runs a direct `npm publish`, so without the tick the registry
   refuses it with `403 ... OIDC permission denied for this action`, after the OIDC token has
   been minted and the provenance statement already signed. That happened on the v0.1.1 release,
   2026-09-17. The trust link itself was correct; only the permission was missing.

   Leaving it unticked is a defensible choice, since a compromised workflow could then stage a
   package but never ship one. Taking it means changing `scripts/publish.mjs` to `npm stage
   publish` and promoting each release by hand on npmjs.com.

   From then on the workflow publishes without a token and npm attaches provenance.

## Release hold until the report layer is live

From the merge of the v2 plan's pull request 2 until pull request 7 sets `SITE_LAYERS` to both
families, publish nothing from main. The CLI on main links to the report rule pages, and the site
does not publish those pages until pull request 7 (decision 15 in
`docs/superpowers/plans/2026-09-20-pbiplint-v2-report-layer.md`), so a release cut in that window
would send its users to pages that do not exist yet. If a 0.1.x patch is needed meanwhile, cut it
from a branch off the `v0.1.2` tag and tag that branch's release commit, not main. The 0.2.0
release pull request removes this section.

## Every release

1. On a branch from main, set the version in both packages and regenerate the core's version file:

   ```bash
   npm version 0.2.0 -w @pbiplint/core -w pbiplint --no-git-tag-version
   npm install
   npm run version:sync
   ```

   Set the same version, and the date, in the Status section of `README.md`, which nothing
   regenerates. Then run every check:

   ```bash
   npm test && npm run build && npm run check:pack
   ```

   The version test fails until the README names the version in `package.json`, so a release
   commit that skips the README cannot pass CI.

2. Commit as `chore: release v0.2.0`, open a pull request, let CI pass, merge.
3. Tag the merge commit and push the tag:

   ```bash
   git fetch origin main && git tag v0.2.0 origin/main && git push origin v0.2.0
   ```

4. The Release workflow verifies the tag against the version, runs every check, builds, dry-runs
   the tarballs, publishes both packages, and creates the GitHub release with generated notes. It
   does that in two jobs, so anything that fails once the checks are green failed in the second
   one: `verify` checks the tag and runs lint, types, tests, the browser check and the pack check,
   then `publish` builds again, uploads both packages to npm and creates the release.
   Watch it with `gh run watch --repo pbiplint/pbiplint`.
5. Check the published build against the one you tagged, rather than against a number written
   here that drifts with every rule added:

   ```bash
   cd "$(mktemp -d)"
   npx pbiplint@0.2.0 --sample > published.txt
   echo "exit $?"          # 1
   head -1 published.txt

   # from the release checkout, where step 1 already built it
   node packages/cli/dist/pbiplint.mjs --sample | head -1
   ```

   The exit code is 1 and the two summary lines are identical. `npm test` pins those same totals,
   in `packages/cli/test/cli.test.ts`.

6. Bump the GitHub Action's pin. In https://github.com/pbiplint/action, change the
   `pbiplint-version` default in `action.yml` and the version in the README's inputs table to the
   new version, then release the action following its own `RELEASING.md`. Until then, workflows
   using `pbiplint/action@v1` keep running the previous CLI.

A rerun of the workflow, or a tag pushed after a manual publish, is safe: `scripts/publish.mjs`
skips a version that is already on the registry.

## First release (v0.1.0, by hand)

Do this once, at the first release, not before. Michael runs it from a clean checkout of the
release commit, logged in to npm:

```bash
npm ci && npm run build && npm run check:pack
npm publish -w @pbiplint/core
npm publish -w pbiplint
```

Then configure the trusted publisher for each package, including the "Allow `npm publish`" tick
in step 4 above, and push the tag, which creates the GitHub release and skips the two publishes,
because both versions are already on the registry. Note what that means: a tag pushed after a
manual publish exercises none of the publishing path, so it proves the workflow runs and nothing
more. The first release that actually publishes is the first real test of it.

## Model parity expectations

The model rules are pinned to the Tabular Editor 3 command line, `te`, a development-time oracle
only. The commands that refresh a model expectation file are in CONTRIBUTING.md under "Refreshing
parity expectations".

Every model expectation file was captured with the 0.5.2 preview build, which stops working on
September 30, 2026. Tabular Editor CLI 0.7.0 extends the preview to October 31, 2026. To install
it, sign in with a Tabular Editor account, download the build for your platform, and overwrite the
old one. It also changes the JSON output of `te bpa run`, which reports a `summary` and a
`findings` array in place of the `results` array that `scripts/te-expectations.mjs` reads, and it
drops the VertiPaq rules and the `--vpa-rules` option.

So a re-capture after September 30, 2026 first installs 0.7.0, teaches
`scripts/te-expectations.mjs` the new shape, and checks every model expectation against 0.7.0
before committing one that changed. Pass `--oracle` naming the new build as well: without it, the
script keeps the oracle string already in the file, or writes its default, and both name 0.5.2.

Sources: Tabular Editor's release post,
[Tabular Editor CLI 0.7.0](https://tabulareditor.com/blog/tabular-editor-cli-0-7-0-release)
(September 14, 2026), and its
[installation page](https://docs.tabulareditor.com/en/features/te-cli/te-cli-install.html).

## Report parity expectations

The report rules are pinned to fab-inspector, a development-time oracle only. Refresh the
expectation files when a fixture changes or when the port source moves to a new commit:

1. Clone the ruleset and fixtures at the pinned commit (see `packages/core/src/rules/pbi-inspector/inspector-rules.data.ts` for the commit and sha):
   `git clone --filter=blob:none --sparse --no-checkout https://github.com/NatVanG/fab-inspector.git && cd fab-inspector && git sparse-checkout set FabInspector.Tests/Files/pbip Rules && git checkout <commit>`
2. Download `osx-arm64-CLI.zip` from the fab-inspector release the expectation files name, unzip it, and clear the quarantine flag. It needs the Homebrew .NET:
   `export DOTNET_ROOT=/opt/homebrew/Cellar/dotnet/<version>/libexec DOTNET_ROLL_FORWARD=Major`
3. For each fixture: `node scripts/fab-expectations.mjs tests/fixtures/<name> tests/expectations/<name>.report.json --cli <path to PBIRInspectorCLI> --cli-version <release of the zip, such as 3.4.0> --rules <path to Base-rules.json>`. The sample is recaptured the same way, from `examples/messy-sales` into `tests/expectations/messy-sales.report.json`. The script runs the oracle with every rule enabled, writes the version into the file's `oracle` string, and keeps `deviations`, `ours`, and `native` from the existing file.
4. `npm test`. A difference that is not one of the documented deviations is a bug in a port or a change in the source. A deviation is added only on purpose, and it needs four things that the parity and rule-page tests check together: its one sentence in the file's `deviations` map, pbiplint's object ids under `ours`, a fixture on which the two lists differ, and the same sentence in the rule page's Quirks section.

## The hyphenated name, settled

`pbip-lint` was going to be published as a thin package depending on `pbiplint`, so a guessed
hyphen still installed the right thing. It cannot be, and it does not need to be. Do not try again.

npm strips punctuation from a new package name and compares the result to existing packages. Both
`pbip-lint` and `pbiplint` reduce to `pbiplint`, so the registry refuses the publish with a 403
saying the name is too similar. Tried on 2026-09-17 and refused. The check runs server side at
publish time only, so no dry run or local check ever sees it coming.

Owning `pbiplint` grants no exception. That publish was refused under the account that owns it, and
npm's disputes policy says squatting claims are not resolved on demand; only trademark claims have
a route, which needs an infringing party.

That same rule is the reason this no longer matters. Nobody else can publish `pbip-lint` either,
for as long as `pbiplint` exists, and the same goes for `pbip_lint` and `pbip.lint`, which all
normalize to the same string. The whole punctuation family is closed to everyone, which is exactly
the protection the alias was meant to buy.

A scoped name such as `@pbiplint/pbip-lint` is publishable and pointless: nobody guessing at a
hyphen would type it. Someone who guesses wrong gets a plain "not found" from npm, and no package
of ours can change that.
