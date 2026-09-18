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

1. On a branch from main, set the version in both packages and regenerate the core's version file:

   ```bash
   npm version 0.2.0 -w @pbiplint/core -w pbiplint --no-git-tag-version
   npm install
   npm run version:sync
   npm test && npm run build && npm run check:pack
   ```

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
   in `packages/web/test/sample.test.ts`.

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
