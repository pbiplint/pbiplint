# Releasing pbiplint

Three packages ship at the same version: `@pbiplint/core`, `pbiplint` (the command line, which
bundles the core), and `pbip-lint` (an alias for the command line). The tag workflow publishes the
first two; the alias is still published by hand, for the reason in the last section. The site at
pbiplint.com deploys itself on every push to main and is not versioned.

## One-time setup

Do these once, at the first release, not before.

1. Create the npm organization `pbiplint`, with Michael's npm account as owner and two-factor
   authentication on.
2. Publish the first version of each package by hand (see "First release" below). This comes first
   because npm only lets a trusted publisher be configured on a package that already exists.
3. Configure trusted publishing on npmjs.com for each package: package settings, "Trusted
   publisher", GitHub Actions, organization `pbiplint`, repository `pbiplint`, workflow file
   `release.yml`, environment left blank. From then on the workflow publishes without a token and
   npm attaches provenance.

## Every release

1. On a branch from main, set the version in all three packages and regenerate the core's version
   file and the alias's pin:

   ```bash
   npm version 0.2.0 -w @pbiplint/core -w pbiplint -w pbip-lint --no-git-tag-version
   npm install
   npm run version:sync
   npm test && npm run build && npm run check:pack
   ```

   `version:sync` is what repoints the alias at the new version. `npm version` bumps a workspace's
   own version and leaves a sibling's dependency range alone, so without it the alias would ship
   pinned to the version before this one. The version tests fail if it is skipped.

2. Commit as `chore: release v0.2.0`, open a pull request, let CI pass, merge.
3. Tag the merge commit and push the tag:

   ```bash
   git fetch origin main && git tag v0.2.0 origin/main && git push origin v0.2.0
   ```

4. The Release workflow verifies the tag against the version, runs every check, builds, dry-runs
   all three tarballs, publishes the core and the command line, and creates the GitHub release with
   generated notes. Watch it with `gh run watch --repo pbiplint/pbiplint`.
5. Check: `npx pbiplint@0.2.0 --sample` in an empty folder exits 1 with 161 findings.
6. Publish the alias by hand, as the last section says. The workflow does not do it yet.

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

Then configure the trusted publisher for each package and push the tag, which creates the GitHub
release and skips the two publishes, because both versions are already on the registry.

## The pbip-lint alias

`pbip-lint` (with the hyphen) is a thin package that depends on `pbiplint` and hands the command
straight to it, so a guessed name still installs the right thing. It lives in `packages/alias`.

The version bump, `npm test`, and `npm run check:pack` all cover it. One thing does not:
`scripts/publish.mjs` still names two packages, so the workflow does not upload the alias. Until
issue #14 closes, it is published by hand, and it has to be republished after every release, or
`npx pbip-lint` keeps serving the old version and installing the old CLI with it.

That last step waits on the name existing. npm only lets a trusted publisher be configured on a
package that already exists, so the workflow cannot publish this one until the first version is up
by hand and the publisher entry is set. Wiring it in earlier would fail mid-release, after the
other two had published and before the GitHub release step ran.

From a clean checkout of the release commit, logged in to npm:

```bash
npm ci && npm run build -w pbip-lint
npm pack --dry-run -w pbip-lint
npm publish -w pbip-lint
```

**Read the file list the dry run prints, and do not publish unless `LICENSE` is one of four.** That
file is copied from the repo root at build time and is gitignored, npm does not warn when a `files`
entry is missing, and a published version can never be replaced. `check:pack` now requires it too,
so a full `npm run build` before the check catches this as well. This is also why the publish here
does not pass `--ignore-scripts`, unlike `scripts/publish.mjs`: the `prepack` script is what puts
the license in the tarball.

On the very first publish, expect npm to possibly refuse the name as too similar to `pbiplint`.
Owning the similar package is the standard exception, so it will most likely go through, but the
check is server side and a dry run never reaches it. If it does come back, the route is npm support
citing ownership of `pbiplint`, not a worse name.

Then configure the trusted publisher for the package the same way as the other two, so it is ready
when the workflow starts publishing it.
