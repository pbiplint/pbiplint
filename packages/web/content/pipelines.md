---
title: "Pipelines: GitHub Actions and Azure Pipelines"
description: What the pbiplint GitHub Action and Azure Pipelines task do, what each sends where, and how to check it.
---

# Pipelines: GitHub Actions and Azure Pipelines

pbiplint runs in two pipelines with a step of its own: GitHub Actions, through the pbiplint Action, and Azure Pipelines, through the pbiplint task. Each runs [the pbiplint CLI](/cli/) on your runner or agent, so the lint itself sends nothing anywhere. What a pipeline adds is the trip the findings make afterwards: to the run, where your team reads them, and, when you turn it on, to code scanning. A pipeline does not run on your machine, so "nothing leaves your machine" is not its promise. This page lists what leaves instead, step by step, and how to check each item.

In any other CI system, run the CLI as a step and gate on its exit code; [the CLI page](/cli/) says how.

<h2 id="github-actions">GitHub Actions</h2>

### What it is

[The pbiplint Action](https://github.com/pbiplint/action) is a composite action: it runs the published pbiplint CLI at a pinned version, then turns the report into a failed or passed check, annotations on the lines of the pull request, a job summary with the full ranked report, and code scanning alerts. Everything it runs is in [`action.yml`](https://github.com/pbiplint/action/blob/main/action.yml), plus one script with no dependencies, [`src/annotate.mjs`](https://github.com/pbiplint/action/blob/main/src/annotate.mjs). There is no bundled code. The [README](https://github.com/pbiplint/action#readme) describes each of these in detail.

### Get it

The Action is on the [GitHub Marketplace](https://github.com/marketplace/actions/pbiplint), and its source is at [pbiplint/action](https://github.com/pbiplint/action). Choose how you refer to it by how much change you accept without review:

- `pbiplint/action@v1` follows the newest 1.x release. It suits most teams: fixes arrive by themselves, and nothing breaking does.
- `pbiplint/action@v1.4.0` names one release. A tag can still be moved by the Action's maintainers.
- `pbiplint/action@<full commit SHA> # v1.4.0` is the only reference that cannot change under you. Choose it when a security review asks for it. Dependabot keeps it current: it opens a pull request that moves the SHA and the version comment together, and you read the diff before you merge.

Each release of the Action pins a CLI version, the default of its `pbiplint-version` input in [`action.yml`](https://github.com/pbiplint/action/blob/main/action.yml). Set the input to run another version.

The Action works on GitHub-hosted Ubuntu, Windows, and macOS runners. A self-hosted runner needs Node.js 20.19 or a later 20 release, or 22.12 or later.

### Use it

```yaml
name: Lint Power BI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write # for code scanning; drop it and set upload-sarif: false otherwise

jobs:
  pbiplint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pbiplint/action@v1
        with:
          path: Sales.pbip
```

The `permissions` block gives the job two things and nothing more. `contents: read` lets the checkout step read the repository. `security-events: write` lets GitHub's upload step send the report to code scanning; it is the only write permission the Action uses, and without it the upload is skipped.

The inputs a first run usually changes are `path`, what to lint; `fail-on`, the lowest severity that fails the check (`error` by default, `none` to report without failing); and `upload-sarif`, whether to send the report to code scanning. The README has [every input and output](https://github.com/pbiplint/action#inputs).

For several projects in one repository, add a step for each, each with its own `path` and its own `sarif-category`, so one upload does not replace another.

On a private repository, code scanning needs GitHub Code Security. Without it the upload fails, the step says why, and the run carries on; `upload-sarif: false` stops it trying.

### What leaves, and where it goes

1. **The download.** The Action runs `npx` to fetch the pinned `pbiplint` from the public npm registry (twice per run: once for the SARIF report and once for the job summary). The request names the package and its version, and carries nothing from your project. It is the only request to a host outside GitHub.
2. **The lint.** pbiplint runs on the runner, reads the project `path` names and its `pbiplint.config.json`, and makes no network request of its own. [The CLI page](/cli/#reads) lists exactly which files it reads.
3. **The check, the annotations, and the job summary.** Written to the workflow run, in your repository on GitHub. Anyone who can read the repository can see them, signed in to GitHub. On a public repository that is anyone with a GitHub account, and the findings name your tables, columns, measures, and file paths, so they are as public as the code they describe.
4. **Code scanning,** when `upload-sarif` is on. GitHub's own upload step, `github/codeql-action/upload-sarif`, pinned to a commit in `action.yml`, sends the SARIF report to your repository's code scanning, through the GitHub API and no other host. With the report it sends the commit, the branch, the workflow and job names, and a status report on the step: the runner's operating system and image, the inputs, and, if the step fails, the error. Code scanning alerts are visible to people with write, maintain, or admin access to the repository, and to organization owners, on public and private repositories alike; anyone who can read the repository sees the alerts that land on a pull request's lines.
5. **Nothing to pbiplint.** No request goes to pbiplint.com, to McKinley Consulting, or anywhere else. There is no pbiplint server to send anything to.

On a self-hosted runner the list is the same, with the runner inside your network. The npm download is still the one request beyond GitHub, and it follows npm's own settings: set `NPM_CONFIG_REGISTRY` on the job, or put an `.npmrc` with a `registry=` line at the top of the repository, and the Action's `npx` fetches pbiplint from your registry mirror instead. A firm that blocks the public registry can use the Action that way.

### How to check it

- **Read what it runs.** [`action.yml`](https://github.com/pbiplint/action/blob/main/action.yml) has every command, and [`src/annotate.mjs`](https://github.com/pbiplint/action/blob/main/src/annotate.mjs), the one script, imports nothing outside Node.js.
- **Pin a commit SHA,** and read the diff each time you move the pin.
- **Turn off what you do not want:** `upload-sarif: false` keeps the report out of code scanning, and `annotations: false` keeps findings off the pull request's lines. The job summary and the check remain.
- **Watch a runner's network.** On October 3, 2026 we ran `pbiplint/action@v1` (1.4.0, running pbiplint 0.2.3) on a GitHub-hosted Ubuntu runner, linted the sample project with the upload on, and recorded every DNS lookup and new outbound connection during the Action's steps. The names looked up were `registry.npmjs.org` and `api.github.com`, and nothing else; the only other connections went to the runner host's own platform address, which the same record showed while the runner sat idle. To run the same check on a self-hosted runner, read your proxy's or firewall's log for one run: it should show the npm registry, or your mirror, and GitHub.
- **Check the CLI it runs.** The [package checks on the CLI page](/cli/#check) (no runtime dependencies, a verified signature and provenance) apply to the version the Action pins.

<h2 id="azure-pipelines">Azure Pipelines</h2>

### What it is

[The pbiplint task](https://github.com/pbiplint/azure-pipelines) runs the published pbiplint CLI at a pinned version, then reports each finding as a build issue with its file and line, attaches the ranked report to the run's Extensions tab, publishes the SARIF report as a build artifact, and fails the step on findings. It is two scripts with no dependencies, [`task/main.mjs`](https://github.com/pbiplint/azure-pipelines/blob/main/task/main.mjs) and [`task/report.mjs`](https://github.com/pbiplint/azure-pipelines/blob/main/task/report.mjs), in an extension on the Visual Studio Marketplace.

For organizations that cannot install an extension, [the plain YAML route](https://github.com/pbiplint/azure-pipelines/blob/main/examples/plain.yml) runs the same CLI from a script step, with no extension at all.

### Get it

The source and the README are at [pbiplint/azure-pipelines](https://github.com/pbiplint/azure-pipelines).

- **Installing it** takes a Project Collection Administrator, which an organization's owners are. Anyone else in the organization can request the extension, and once an administrator approves the request, Azure DevOps installs it. Teams that cannot get that approval use the plain YAML route.
- **Which version runs.** A pipeline names the task's major version, `pbiplint@1`, and takes each new minor version as the extension is updated; `pbiplint@1.0.0` pins one exact version. When the extension is updated, Azure DevOps installs the update in every organization that has it, and holding an organization at an older version of the extension is not something Azure DevOps documents. Each task release pins a CLI version in its `pbiplintVersion` input, which you can set to run another. The plain YAML route pins the CLI in the file itself, and only changes when you change it.
- **Agents.** Microsoft-hosted Ubuntu, Windows, and macOS agents, and self-hosted agents with Node.js 20.19 or a later 20 release, or 22.12 or later, npm on the path, and agent version 4.248.0 or later.

### Use it

```yaml
trigger:
  branches:
    include: [main]

pool:
  vmImage: ubuntu-latest

steps:
  - task: pbiplint@1
    inputs:
      path: Sales.pbip
```

The inputs are the Action's, spelled the way Azure Pipelines allows: `path`, `failOn`, and `publishSarif` are the ones a first run usually changes, and the README has [every input](https://github.com/pbiplint/azure-pipelines#inputs). For several projects in one repository, add a step for each with its own `path` and `sarifCategory`.

The plain YAML route is one `bash` step: copy [`examples/plain.yml`](https://github.com/pbiplint/azure-pipelines/blob/main/examples/plain.yml) to `azure-pipelines.yml` and set the path. It runs the same pinned CLI, attaches the same report to the run, publishes the same SARIF artifact, and fails the step the same way. It leaves out the build issue for each finding and the output variables, which need the task's script.

**Advanced Security.** Teams with GitHub Advanced Security for Azure DevOps, a paid add-on, can send the findings to its code scanning alerts by adding Microsoft's [`AdvancedSecurity-Publish@1`](https://learn.microsoft.com/azure/devops/pipelines/tasks/reference/advanced-security-publish-v1) step after pbiplint's. The task's README has [the YAML](https://github.com/pbiplint/azure-pipelines#advanced-security). It needs pbiplint 0.2.4 or later, and it has not been run against the service itself, since that needs the paid add-on.

### What leaves, and where it goes

1. **The extension and the download.** The organization installs the extension from the Visual Studio Marketplace once. On each run, the task runs `npx` to fetch the pinned `pbiplint` from the public npm registry, a request that carries nothing from your project. The plain YAML route skips the extension and makes the same request.
2. **The lint.** As in GitHub Actions: on the agent, reading only the path and its config, with no network request of its own.
3. **Build issues and the report.** Written to the run, in your Azure DevOps organization. Anyone with permission to view the pipeline's builds can see them, which a project's Readers have by default. Azure DevOps no longer allows public projects: none can be created, and the ones left become private in 2027.
4. **The SARIF artifact.** Kept with the run, for as long as the project's retention settings keep the run's artifacts.
5. **Advanced Security,** only when a team adds Microsoft's step. That step sends the SARIF report to the organization's Advanced Security, where people with permission to view its alerts, a project's Contributors by default, can see them.
6. **Nothing to pbiplint,** as above.

On a self-hosted agent the list is the same, with the agent inside your network, and the npm download is the one request beyond Azure DevOps. The task passes the agent's environment to `npx`, so `NPM_CONFIG_REGISTRY` on the pipeline, or an `.npmrc` with a `registry=` line at the top of the repository, points it at your registry mirror. Behind a proxy, set `HTTPS_PROXY` or npm's own proxy setting: the agent's proxy configuration is not passed to `npx`.

### How to check it

- **Read what it runs.** [`task/main.mjs`](https://github.com/pbiplint/azure-pipelines/blob/main/task/main.mjs) and [`task/report.mjs`](https://github.com/pbiplint/azure-pipelines/blob/main/task/report.mjs) import nothing outside Node.js, and the plain route is one file you can read in full before you copy it.
- **Turn off what you do not want:** `annotations: false` stops the build issues, `publishSarif: false` stops the artifact, and Advanced Security sees nothing unless you add its step.
- **Watch an agent's network.** For one run, your proxy's or firewall's log should show the npm registry, or your mirror, and Azure DevOps.
- **Check the CLI it runs,** with the [package checks on the CLI page](/cli/#check).

## Both pipelines

Each pipeline runs the same CLI, so [the CLI page](/cli/) applies to the lint step of either: what it reads, and how to check that it sends nothing. [The pbiplint Privacy Promise](/privacy/#in-the-github-action) says, in a sentence, what this page lists in full.

If you ever find either pipeline sending something this page does not list, that is a security bug. Report it privately, as [the security policy](https://github.com/pbiplint/pbiplint/blob/main/SECURITY.md) describes.
