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
npx pbiplint explain HIDE_FOREIGN_KEYS   # one rule's guidance, offline (--format json too)
npx pbiplint skill --install claude      # the skill for AI assistants, where Claude Code reads it
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
| `--quiet` | Prints the summary and what was read or skipped, any notices, then one line per rule with findings (its severity, id, and count), then the next step. Text only. |
| `--rule <RULE_ID>` | Shows only that rule's findings, in any format; give it more than once for several. Every rule still runs, the summary says how many findings are shown of how many, and `--fail-on` counts only the ones shown. |
| `--help`, `--version` | Prints the help text, or the version. |

### Choose a format

- **text** is for reading in a terminal: the "Report at a glance" block when the input has a report, the five groups to fix first, then every finding with a link to its rule's page.
- **markdown** is for pasting where Markdown renders: a pull request comment, a wiki page, or an issue.
- **sarif** is for code scanning and editors. GitHub code scanning and the SARIF viewers for editors such as VS Code read it and put each finding on its line.
- **json** is for scripts: the summary, the findings in their groups, the notices, and the report's facts, as data.

### Read a rule's guidance

`pbiplint explain <RULE_ID>` prints what a rule checks, an example, why it matters, how to fix it, when to ignore it, and its quirks, from the rule's page as the installed version carries it, with no network. The id is the one each finding names, in any case; the page name from its link works too. `--format json` prints the same as one document, each section a field of its own, for a script or an AI assistant. An id it does not know exits `2` and names the nearest ones. The text report ends by pointing at it when there are findings.

An AI assistant that lints after each edit can keep its context small: `pbiplint <path> --quiet` for the counts, `pbiplint <path> --rule <RULE_ID>` for one rule's findings, and `pbiplint explain <RULE_ID>` for how to fix them. When there are findings, the quiet output's last line names the other two.

### Give an AI assistant the skill

`pbiplint skill` prints a skill, in the [Agent Skills](https://agentskills.io/home) format, that tells a coding assistant when to run pbiplint, how to keep its output short, how to read the results, and what to leave to you, such as ignoring a finding or editing files while Power BI Desktop has the project open. It ships with the CLI, so it always matches the version installed, and an assistant can read it from that command without installing anything.

To keep it in a project, run `pbiplint skill --install <assistant>` from the project's or repository's root folder:

| Assistant | Folder it writes |
| --- | --- |
| `claude` (Claude Code) | `.claude/skills/pbiplint/` |
| `copilot` (GitHub Copilot) | `.github/skills/pbiplint/` |
| `codex` (Codex) or `gemini` (Gemini CLI) | `.agents/skills/pbiplint/` |

GitHub Copilot reads all three folders, so one copy is enough for it. `--install` never replaces a copy that differs from the one it would write, an edited copy or one from another version, unless you add `--force`; `--dry-run` says what it would do and writes nothing. `--show` lists each folder, whether the skill is there, and whether that copy matches the version installed. To remove it, delete the `pbiplint` folder `--show` names.

To lint a folder named `explain`, `rules`, or `skill`, give it as `./explain`, `./rules`, or `./skill`.

### Gate a build on it

pbiplint exits `0` when nothing is at or above `--fail-on`, `1` when something is, and `2` for a usage or input error, such as a path that is not there. Any CI system that fails a step on a nonzero exit can use it as a gate. `--fail-on error` is the default; `--fail-on warning` and `--fail-on info` tighten the gate, and `--fail-on none` never exits 1, for a run that reports without blocking. [What a script can rely on](#contract) lists every cause of `2`.

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

<h2 id="contract">What a script can rely on</h2>

Scripts, pipelines, and AI assistants read what the CLI prints, so these parts of its behavior are promised, and the CLI's [contract tests](https://github.com/pbiplint/pbiplint/blob/main/packages/cli/test/contract.test.ts) pin each one. This page follows the main branch: a promise marked "from 0.2.5" holds from that release on, and `pbiplint --version` says which you have.

### stdout and stderr

- With `--format json`, `sarif`, or `markdown`, stdout carries exactly one document and nothing else, so it can be piped straight into a parser or a file. So does `pbiplint explain --format json` (from 0.2.5).
- Notices (`pbiplint: notice: ...`), the one-line summary `--output` prints, a config's unknown rule ids, and every error go to stderr. The text and Markdown reports also list each notice in the report.
- `--help` and `--version` print text, whatever the format. `pbiplint` alone prints the help and exits `0`; options with no path and no `--sample` exit `2` (from 0.2.5), so an empty path in a script never passes as a clean run.
- With `--output`, stdout is empty: the report goes to the file and the one-line summary to stderr.

### Exit codes

- `0`: nothing at or above `--fail-on`. With `--rule` (from 0.2.5), only the findings shown count. `pbiplint rules`, `pbiplint explain` with a rule it knows, `--help`, and `--version` exit `0` too.
- `1`: something at or above `--fail-on`.
- `2`, with nothing on stdout and the reason on stderr:
  - a usage error, such as an unknown option, an option with no value or a value it does not take, two paths, or options with no path; from 0.2.5 also an unknown rule id given to `explain` or `--rule`, or `--quiet` with a format other than text;
  - a config file it cannot use;
  - an input it cannot read, such as a path that is not there, a `.pbix` file, or a model folder with no `.tmdl` files;
  - a run that reads nothing it can lint, such as a report stored only as `report.json`;
  - a folder that holds several projects or parts, naming each;
  - an unexpected error.

### The JSON document

`--format json` prints one object. `version` is `1`. Its fields:

- `tool`: `name` and `version`.
- `summary`: the number of `files` read, and of `findings`, `errors`, `warnings`, and `infos`; `rulesRun`, the number of rules that ran; `rulesSkipped`, each with `id` and `reason`; `ruleErrors`, each with `id` and `message`; `ignored`, the number of findings an annotation ignored; and `unknownRules`, the config's rule ids that match no rule. Under `--rule` (from 0.2.5), `shown` holds `rules`, `findings`, `errors`, `warnings`, and `infos` for what is shown, while the other counts stay the whole run's.
- `layers`: `model` and `report`, each `present: true` with `files`, the number read, or `present: false` with `reason`.
- `facts`: what the report is at a glance, each with `layer`, `label`, `value`, and an optional `detail` and `ruleId`.
- `diagnostics`: the notices, each with `kind`, `message`, and an optional `path`.
- `groups`: the findings by rule, errors first. Each has `rule` (`id`, `name`, `category`, `severity` from `1` for info to `3` for error, `layer`, `slug`, `url`, and `status`), `count`, and `findings`, each with `layer`, `objectType`, `objectName`, and an optional `objectId`, `file`, `line`, and `detail`.

A new field is additive and keeps `version` at `1`, so a reader should ignore fields it does not know. One planned addition is a message id and parameters for each finding. New values can appear in a field that names one of a set, such as a skipped rule's `reason`, a notice's `kind`, or a rule's `category` and `status`, also without a version change. A field removed or renamed, or one whose meaning changes, raises `version`.

### The quiet output (from 0.2.5)

`--quiet` prints the summary on the first line, which starts `pbiplint: `. Each line that starts with `error `, `warning `, or `info ` is a rule line: the severity, the rule id, and the number of findings, separated by single spaces. A rule id holds no spaces. When there are findings, the last line starts `Next: `. The lines between, what was read and any notices, are for reading, and their wording is not promised.

### pbiplint explain --format json (from 0.2.5)

One object: `version` (`1`), `tool`, `rule` (the JSON document's rule fields plus `description`, what the rule checks), and `sections`: `example`, `whyItMatters`, `howToFixIt`, `whenToIgnoreIt`, and `quirks`, each in Markdown. `whyItMatters` and `howToFixIt` are always there; the others are left out when the rule's page has none. The same rule for changes applies.

### Not promised

The text format's layout and wording, which are for people and may change; the Markdown export's layout; the wording of any message, notice, or error; and the SARIF document beyond what SARIF 2.1.0 defines.

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
