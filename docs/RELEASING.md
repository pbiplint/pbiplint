# Releasing pbiplint

Two packages ship together at the same version: `@pbiplint/core` and `pbiplint` (the command
line, which bundles the core). The site at pbiplint.com deploys itself on every push to main and
is not versioned.

## One-time setup (done once, kept here for the record)

- npm organization `pbiplint`, with Michael's npm account as owner and two-factor authentication on.
- The first version of each package was published by hand (see "First release" below), because
  npm only lets a trusted publisher be configured on a package that already exists.
- Trusted publishing configured on npmjs.com for each package: package settings, "Trusted
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

Done once by Michael from a clean checkout of the release commit, logged in to npm:

```bash
npm ci && npm run build && npm run check:pack
npm publish -w @pbiplint/core
npm publish -w pbiplint
```

Then the trusted publisher was configured for each package and the tag was pushed, which created
the GitHub release and skipped the two publishes.

## Later

`pbip-lint` (with the hyphen) is published as a thin package that depends on `pbiplint`, so a
guessed name still installs the right thing. Not before v0.1.0 has been out for a while.
