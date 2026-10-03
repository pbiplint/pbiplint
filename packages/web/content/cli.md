---
title: The pbiplint CLI
description: How to get the pbiplint command line from npm, run it, and check for yourself that it sends nothing anywhere.
---

# The pbiplint CLI

The pbiplint CLI is the linter this site runs, with a folder walk in front of it. Point it at a Power BI project on your own machine and it reads the files you name, checks them against the same rules, and writes the findings to your terminal or to a file you name. It sends nothing anywhere, and the [checks below](#check) let you see that for yourself. To run it in GitHub Actions or Azure Pipelines, see [Pipelines](/pipelines/), which covers the step each has for it.

The package is [`pbiplint` on npm](https://www.npmjs.com/package/pbiplint). It is built on [`@pbiplint/core`](https://github.com/pbiplint/pbiplint/tree/main/packages/core#readme), the library behind both the CLI and this site, which is there for anyone who wants to embed the linter in a tool of their own.

## Get it

pbiplint runs on Node.js 20.19 or a later 20 release, or 22.12 or later (the package's `engines` field reads `^20.19.0 || >=22.12.0`). There are three ways to run it:

- **To try it:** `npx pbiplint path/to/project`. The first time, npm asks before it installs the package (`--yes` skips the question), then runs it.
- **To pin a version in a project:** `npm install --save-dev pbiplint`, then add a script to `package.json`, such as `"lint:pbi": "pbiplint ."`, and run `npm run lint:pbi`. Everyone on the project, and its CI, then runs the same version.
- **For one machine:** `npm install --global pbiplint`, then run `pbiplint` from anywhere.

Where the public npm registry is off limits, install from your organization's registry mirror, or fetch the package once with `npm pack pbiplint` and install the `.tgz` file it writes with `npm install ./pbiplint-<version>.tgz`.

The source is on [GitHub](https://github.com/pbiplint/pbiplint), and each version is built from the [release tag](https://github.com/pbiplint/pbiplint/tags) of the same number.

## Use it

```bash
npx pbiplint path/to/Model.SemanticModel
npx pbiplint --sample        # the sample project that comes with the package
npx pbiplint path/to/model --format sarif --output pbiplint.sarif
npx pbiplint path/to/model --format markdown
npx pbiplint rules           # every rule with its status and severity
npx pbiplint explain HIDE_FOREIGN_KEYS   # one rule's guidance, from its page
npx pbiplint --help          # every option, in one screen
npx pbiplint --version
```

The path can be a PBIP folder, a `.pbip` file, a `.SemanticModel` folder, a `.Report` folder, a `definition` folder, or one `.tmdl` file. Given a folder that is not a project but holds one in a folder below it, as a repository often does, pbiplint lints that project and names it in a notice; a folder that holds several is refused with a list of them, each with the command that lints it.

These are the options `pbiplint --help` lists:

| Option | What it does |
| --- | --- |
| `--sample` | Lints the sample project that comes with the package instead of a path. |
| `--format <name>` | `text` (the default), `json`, `sarif`, or `markdown`. |
| `--fail-on <level>` | The lowest severity that makes the run exit 1: `error` (the default), `warning`, `info`, or `none`. |
| `--config <file>` | The `pbiplint.config.json` to use, instead of the nearest one above the project. |
| `--output <file>` | Writes the report to a file instead of the terminal, with a one-line summary on stderr. |
| `--help`, `--version` | Prints the help text, or the version. |

### Choose a format

- **text** is for reading in a terminal: the "Report at a glance" block when the input has a report, the five groups to fix first, then every finding with a link to its rule's page.
- **markdown** is for pasting where Markdown renders: a pull request comment, a wiki page, or an issue.
- **sarif** is for code scanning and editors. GitHub code scanning and the SARIF viewers for editors such as VS Code read it and put each finding on its line.
- **json** is for scripts: the summary, the findings in their groups, the notices, and the report's facts, as data.

### Read a rule's guidance

`pbiplint explain <RULE_ID>` prints what a rule checks, an example, why it matters, how to fix it, when to ignore it, and its quirks, from the rule's page as the installed version carries it, with no network. The id is the one each finding names, in any case; the page name from its link works too. `--format json` prints the same as one document, each section a field of its own, for a script or an AI assistant. An id it does not know exits `2` and names the nearest ones. The text report ends by pointing at it when there are findings.

A folder named `explain` or `rules` is linted as `./explain` or `./rules`.

### Gate a build on it

pbiplint exits `0` when nothing is at or above `--fail-on`, `1` when something is, and `2` for a usage or input error, such as a path that is not there. Any CI system that fails a step on a nonzero exit can use it as a gate. `--fail-on error` is the default; `--fail-on warning` and `--fail-on info` tighten the gate, and `--fail-on none` never exits 1, for a run that reports without blocking.

In GitHub Actions and Azure Pipelines, pbiplint's own step runs the CLI for you and puts the findings on the run; [Pipelines](/pipelines/) covers both, with what each sends where.

### Configure it

A `pbiplint.config.json` next to the project, or in any folder above it, turns rules off, changes their severity, and sets the gate. The nearest one wins, and `--config` names one explicitly:

```json
{
  "$schema": "https://pbiplint.com/schema/pbiplint.config.schema.json",
  "rules": {
    "REMOVE_ROLES_WITH_NO_MEMBERS": "off",
    "DAX_COLUMNS_FULLY_QUALIFIED": "warning"
  },
  "failOn": "warning"
}
```

To ignore a rule on one object, add `annotation pbiplint.ignore = HIDE_FOREIGN_KEYS` under the object in its TMDL file, or a `pbiplint.ignore` entry in the `annotations` array of a page's or a visual's JSON file. Power BI Desktop keeps both. The [CLI's README](https://github.com/pbiplint/pbiplint/tree/main/packages/cli#readme) has the details, and each rule's page lists the options the rule takes.

<h2 id="reads">What it reads, writes, and sends</h2>

This is the command line's part of [the pbiplint Privacy Promise](/privacy/), in detail.

- **It reads** the files that describe a project, under the path you give it: the `.pbip` file, the model's `.tmdl` files, and the report's `definition.pbir`, `.platform`, and JSON files, along with the report or model folder a `.pbip` file or a report's `definition.pbir` points to. It also reads the nearest `pbiplint.config.json`, or the one `--config` names. It lists folders to find those files, and opens nothing else: it never enters the `.pbi` folder, where Power BI Desktop keeps the model's local data cache, nor `.git`, `node_modules`, or a report's `StaticResources` and `CustomVisuals` folders, and it does not follow a symbolic link below the path you give.
- **It writes** the report to your terminal, or to the file `--output` names (creating its folder if needed). Notices, and with `--output` a one-line summary, go to stderr. Nothing else: no cache, no settings file, no log.
- **It sends** nothing. It makes no network request: no telemetry, no update check, no call home.

The network steps that are not pbiplint's own belong to npm. Installing the package fetches it from the registry. And `npx pbiplint` asks the registry for the package's details on every run, even when a copy is already in npm's cache, to see whether a newer version matches; with no network, npm retries for about a minute before it runs the cached copy. Neither request carries anything from your project. To run with no network request at all, run an installed copy, or `npx --offline pbiplint`, which uses the cached copy without asking.

<h2 id="check">How to check it</h2>

From quickest to strongest. Each check lints the sample with `--sample`; put the path to one of your own projects in its place to check it on yours.

### 1. Run it offline

Install it with `npm install --global pbiplint`, turn off the network (airplane mode, or unplug the cable), and run `pbiplint --sample`. It works, because it never needed the network. (It exits 1 on the sample in this check and the ones below, because the sample has findings; 2 would mean it could not run.)

### 2. Run it where the network is refused

Node's permission model can refuse a program any network access. Under `--permission`, Node denies the network unless `--allow-net` is given, so pbiplint runs as usual and anything that tried to connect would fail with `ERR_ACCESS_DENIED`. This check needs Node 25 or later. Node 22 and 24 accept `--permission` but do not restrict the network under it, so a run there proves nothing about the network; Node 20 does not accept the flag.

On macOS and Linux:

```bash
node --permission --allow-fs-read='*' "$(npm root -g)/pbiplint/dist/pbiplint.mjs" --sample
```

On Windows, in PowerShell:

```powershell
node --permission --allow-fs-read=* "$(npm root -g)\pbiplint\dist\pbiplint.mjs" --sample
```

`--allow-fs-read='*'` lets pbiplint read files as it always can, so the check takes away only the network. Reading is left open because pbiplint looks for a `pbiplint.config.json` in every folder above the project, and a narrower grant stops the run there. With `--output`, also allow writing to the folder the file goes in, such as `--allow-fs-write="$PWD/reports"` for `--output reports/pbiplint.sarif`; the file alone is not enough, since pbiplint creates the folder first. For a copy installed in a project rather than globally, the bundle is at `node_modules/pbiplint/dist/pbiplint.mjs`. To see the refusal for yourself, run `node --permission -e "fetch('https://example.com').catch(e => console.log(e.cause.code))"`, which prints `ERR_ACCESS_DENIED`.

On a Mac with any Node version, the system's own sandbox can refuse the network instead:

```bash
sandbox-exec -p '(version 1)(allow default)(deny network*)' pbiplint --sample
```

Apple marks `sandbox-exec` as deprecated, but it is still on every Mac. On Linux, a container started with `--network none` has no network at all. This one, for bash, runs your installed copy, mounted read-only:

```bash
docker run --rm --network none -v "$(npm root -g)/pbiplint:/opt/pbiplint:ro" node:26 node /opt/pbiplint/dist/pbiplint.mjs --sample
```

To lint a project of your own, mount it too, with `-v "$PWD/MyProject:/work:ro"`, and give `/work` in place of `--sample`. Inside the container pbiplint cannot see a `pbiplint.config.json` above the project, so mount that folder instead, or pass the file with `--config`, if the project uses one.

### 3. Watch it

On Linux, `strace -f -e trace=network pbiplint --sample` lists every network call the process and its children make, and shows none. On Windows, Resource Monitor (`resmon`) has a Network tab that lists each process with network activity while it happens; pbiplint runs as `node.exe`. A lint takes seconds, so this is a weak check on its own; the permission-model check above refuses the network outright.

### 4. Check what you installed

- `npm view pbiplint dependencies` prints nothing: the package has no runtime dependencies, so nothing else is installed with it.
- `npm pack pbiplint --dry-run` lists what it ships: the `dist/pbiplint.mjs` bundle, the sample project, the README, `NOTICE`, `LICENSE`, and `package.json`.
- `npm audit signatures`, in an empty folder where you install only pbiplint, reports "1 package has a verified registry signature" and "1 package has a verified attestation". Releases are published from GitHub Actions with npm provenance, and [the npm page](https://www.npmjs.com/package/pbiplint) links the commit and the workflow run that built each version.

### 5. Read the code

The CLI is one bundle, `dist/pbiplint.mjs`, built from [`packages/cli`](https://github.com/pbiplint/pbiplint/tree/main/packages/cli). [A check that runs on every change](https://github.com/pbiplint/pbiplint/blob/main/packages/cli/scripts/check-network.mjs), and before every release, fails if that bundle imports any module but `node:fs`, `node:path`, and `node:url`, or refers to a network API.

If you ever find pbiplint breaking the Promise, that is a security bug. Report it privately, as [the security policy](https://github.com/pbiplint/pbiplint/blob/main/SECURITY.md) describes.
