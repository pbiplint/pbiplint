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

## Every release

Each release has a milestone, and its last issue is opened from the Release issue template
(`.github/ISSUE_TEMPLATE/release.md`), which lists the steps below, the Action's, and the Azure
Pipelines task's, to be ticked as they happen. While the milestone is open, an issue that changes
what users see leaves a comment headed "For the 0.x.y release summary", and the release notes are
drafted from those comments.

1. On a branch from main, set the version in both packages and regenerate the core's version file:

   ```bash
   npm version 0.2.0 -w @pbiplint/core -w pbiplint --no-git-tag-version
   npm install
   npm run version:sync
   ```

   Set the same version in the Status section of `README.md`, which nothing regenerates. Give it
   no date: the README on GitHub goes live at the merge, before the tag publishes the packages,
   and the releases page dates each version. Then run every check:

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
7. Bump the Azure Pipelines task's pin the same way. In https://github.com/pbiplint/azure-pipelines,
   change the `pbiplintVersion` default in `task/task.json`, the README's inputs table, and the
   plain YAML route's `PBIPLINT_VERSION`, then publish the extension following its own
   `RELEASING.md`. Until then, pipelines using `pbiplint@1` keep running the previous CLI.

A rerun of the workflow, or a tag pushed after a manual publish, is safe: `scripts/publish.mjs`
skips a version that is already on the registry.

The site and the command line each carry their own copy of the sample. The site builds
`examples/messy-sales` into the home page on every push to main, while the command line copies it
into its package at build time, so `npx pbiplint --sample` lints the copy the latest npm release
bundled. The home page's sample hint says the site's sample is "the same one `npx pbiplint
--sample` lints", which holds only while the two copies match. A change to `examples/messy-sales`
merged between releases makes the hint untrue until the next release, so release soon after such a
change, or say in its pull request that the hint is untrue until then.

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
only. The commands that refresh the captures are in CONTRIBUTING.md under "Refreshing parity
expectations".

Every capture from `te` under `tests/expectations/` was made with Tabular Editor CLI 0.7.1.2 in
October 2026, as each file's `oracle` and `captured` fields say. Each model fixture captured before
October 31, 2026 has three; `scripts/test/te-captures.test.mjs` lists those fixtures and pins the
build in their oracles. A fixture added later has only its Microsoft capture. The three are:

- **Microsoft's ruleset**, `tests/expectations/<fixture>.json`: the parity oracle for the ported
  rules. The six files first captured with the 0.5.2 build were re-captured with 0.7.1.2, and no
  finding changed.
- **Tabular Editor 3's built-in rules**, `tests/expectations/te3/<fixture>.json`: the oracle for
  the rules pbiplint takes from the built-in set, and a record of what the built-in rules report
  once `te` is gone.
- **The survey's rule files**, `tests/expectations/survey/<fixture>.json`: what each of the 46
  distinct rule files in `tests/expectations/survey/files.json` reports, the files a survey on
  September 28, 2026 found published on GitHub. They are the expected results for
  [custom rules](https://github.com/pbiplint/pbiplint/issues/118). They are also the oracle for a
  rule pbiplint takes from one of these files, and hold that rule's deviations, as the built-in
  captures do for the rules taken from the built-in set; `packages/core/test/sourced-parity.test.ts`
  holds each such rule to its capture. The rule files themselves are not committed, since several
  carry no license: the list pins each one to a commit and a sha256, and the script fetches it from
  there and checks it. A file GitHub no longer has is recorded as unavailable, with the date the
  capture found it gone. One of the 46 was gone by October 2, 2026, so the survey captures made
  from that day on record it that way, and the earlier ones keep its results.

A listed fixture keeps its captures as they are once 0.7.1.2 stops working: a change to it changes
its Microsoft capture, which the survey's run of Microsoft's own file must equal, so every listed
fixture is then re-captured three ways with one licensed build, or the change goes in a new fixture.

Tabular Editor CLI 0.7.1.2 is a preview build that stops working after October 31, 2026, and the
[0.7.0 release post](https://tabulareditor.com/blog/tabular-editor-cli-0-7-0-release) (September
14, 2026) says, "After the preview period, a license will be required." So a re-capture after
October 31, 2026 needs a licensed build from the
[installation page](https://docs.tabulareditor.com/en/features/te-cli/te-cli-install.html): sign
in with a Tabular Editor account, download the build for your platform, and overwrite the old one.
The script writes the build it ran into each file's `oracle`; with `--from`, which converts a saved
output instead of running `te`, the build comes from `--oracle`. A re-capture with another build
also updates the oracle constants in `scripts/test/te-captures.test.mjs`.

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
