---
name: Release
about: The last issue in a release's milestone, with each step ticked as it happens
title: "Release 0.x.y: "
---

The last issue in the 0.x.y milestone. Once everything else in the milestone is closed: publish 0.x.y to npm, release the GitHub Action with it, and update the roadmap (#103). This issue closes last.

The steps follow `docs/RELEASING.md` here and `RELEASING.md` in pbiplint/action. This issue adds what 0.x.y needs beyond them and records each step as it happens, with the run, commit, or pull request that shows it. Replace every `0.x.y` with the version and `0.p.q` with the version before it, and set this issue's milestone to 0.x.y by hand, since a template cannot.

## Particular to this release

<!-- Only what this release needs beyond the steps below: a date it must ship by, README or site copy that must change with it, an issue whose last box lands in pbiplint/action, anything that can fail a gated workflow. Delete this comment, and the section if nothing is particular. -->

- [ ] 

## Before the release

- [ ] **Every other issue in the milestone is closed:** fixed, decided, or dropped with a reason on its issue, in #103's order.
- [ ] **The READMEs say what 0.x.y covers:** this repository's, and the CLI's and core's, which npm shows. The Status paragraph is the exception: it names the version, so it lands in the release pull request below.
- [ ] **The sample.** Run `git log v0.p.q..main -- examples/messy-sales`. If it lists a commit, the home page's hint ("the same one `npx pbiplint --sample` lints") is untrue until 0.x.y is on npm, so release soon after, and see the Smoke box below.

## Release 0.x.y

Following `docs/RELEASING.md`, "Every release".

- [ ] **Release pull request.** On a branch from main: `npm version 0.x.y -w @pbiplint/core -w pbiplint --no-git-tag-version`, `npm install`, `npm run version:sync`; the README's Status paragraph names 0.x.y, with no date; `npm test && npm run build && npm run check:pack`. Commit as `chore: release v0.x.y`, open the pull request, CI green, merge.
- [ ] **Tag.** The maintainer tags the merge commit and pushes it, since the tag publishes to npm: `git fetch origin main && git tag v0.x.y origin/main && git push origin v0.x.y`. The tag ruleset blocks moving or deleting a `v*` tag, so check the commit first.
- [ ] **Release workflow green.** `verify`, then `publish`: both packages on npm with provenance, and the GitHub release created. The registry caches its package document for a few minutes after a publish; `https://registry.npmjs.org/-/package/pbiplint/dist-tags` (and the same for `@pbiplint/core`) is authoritative.
- [ ] **Published build matches.** From an empty folder, `npx pbiplint@0.x.y --sample` exits 1 and its first line matches `node packages/cli/dist/pbiplint.mjs --sample` run from the release checkout after `npm run build`.
- [ ] **Release notes say what changes for users.** Draft a summary in a comment here from the "For the 0.x.y release summary" comments on the milestone's issues, then add it to the GitHub release above the generated list of pull requests, its headings at the level of that list's:
  - **New:** rules and features.
  - **What can change in your results,** and what can fail a gated workflow: a new or changed finding at `error` can trip the Action's default `fail-on: error`.
  - **For code that uses `@pbiplint/core` directly:** any change that can break a TypeScript build that compiled against 0.p.q. Leave the heading out if there is none.

## Release the GitHub Action

Following pbiplint/action's `RELEASING.md`, "After a pbiplint CLI release".

- [ ] **Action pull request.** The `pbiplint-version` default in `action.yml` and the README's inputs table set to 0.x.y. The messy-sales checkout's `ref` in `ci.yml` and `smoke.yml` moved to the commit v0.x.y points at. CONTRIBUTING's fixture command moved to 0.x.y, `test/fixtures/messy-sales.sarif` regenerated with it from a checkout of this repository at that commit, and the tests' pins moved to what the new file holds. The README's rules paragraph still true of what 0.x.y checks. `npm test`, pull request, CI green, merge.
- [ ] **Version it in the Action's `package.json`, in the same pull request,** since the tag must match it. Number it by what 0.x.y does, not by its number: a minor if it adds rules or changes the findings an unchanged project gets, otherwise a patch.
- [ ] **Tag.** The maintainer tags v1.x.y on the merge commit and pushes it; the Release workflow moves `v1` and creates the release.
- [ ] **Smoke.** Once the tag is out, run the Smoke workflow and confirm it passes on the released `v1`. If the sample changed and needs the new CLI, do not run it between the merge and the tag.

## Close out

- [ ] **The milestone** closed on GitHub, with this issue the last one closed in it.
- [ ] **The roadmap (#103):** 0.x.y under Shipped, named for what it shipped as the entries above it are, with its date and this issue; the "Now:" line moved to what comes next; and a comment noting the change.
- [ ] **Tidy.** Merged release branches deleted in both repositories.
- [ ] **Close this issue** with a summary comment: what was published, the Action release, and anything that left the milestone and where it went.
