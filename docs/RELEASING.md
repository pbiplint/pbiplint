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
   `release.yml`, environment left blank. From then on the workflow publishes without a token and
   npm attaches provenance.

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
   the tarballs, publishes both packages, and creates the GitHub release with generated notes.
   Watch it with `gh run watch --repo pbiplint/pbiplint`.
5. Check: `npx pbiplint@0.2.0 --sample` in an empty folder exits 1 with 161 findings.

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

## Later

`pbip-lint` (with the hyphen) will be published as a thin package that depends on `pbiplint`, so a
guessed name still installs the right thing. Not before v0.1.0 has been out for a while.
