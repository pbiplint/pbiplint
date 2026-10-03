---
title: The pbiplint Privacy Promise
description: What pbiplint promises about the projects you lint, on this site, on the command line, and in the GitHub Action, and how to check it for yourself.
---

# The pbiplint Privacy Promise

pbiplint checks your Power BI project where it already is: in your browser tab, on your own machine, or in your own GitHub workflow. The Promise is what it commits to about what you lint, on every one of those surfaces, and every line of it can be checked.

## The Promise

1. **Nothing you lint leaves your machine.** The site runs in your browser tab. The command line reads the files you point it at and writes to your terminal or to a file you name. Neither makes a network request. The GitHub Action runs the command line on your workflow's runner and sends the findings only to your own repository on GitHub, as [below](#in-the-github-action) says.
2. **pbiplint never stores, sends, or opens your data.**\* It reads only the files that describe your model and report, never the data they load. Imported data lives in the model's local cache, the `.pbi` folder, which pbiplint never opens. It never connects to a data source, the Power BI engine, or the Power BI service.
3. **No account, no cookies, and no analytics script.** There is no pbiplint server: the site is static files, and nothing behind them receives what you lint. Like any website, the services that host and deliver these files see each request for a page, with the address it came from, and can log or count it; the request names the page, never your project. The site stores nothing in your browser.
4. **You can check it.** The [checks below](#check) need nothing but a browser, and the code they point to is public.
5. **If you use an AI assistant.** If you give pbiplint's findings to an AI assistant, or run pbiplint inside one, the assistant sees the findings, as it sees anything else you show it. The Promise covers pbiplint, not the assistant.

\* Some values live inside the files that describe a project: rows typed in with Enter data, a table written with `DATATABLE`, the values a filter or slicer is set to, and the text of titles and text boxes. And those files are metadata by nature: the names of your tables, columns, and measures, your formulas, and queries that can name your servers and databases. pbiplint reads all of it, because that is what it checks, and none of it leaves your machine.

## Where it holds

### On this site

The linter is part of the page and runs in your browser tab. When you drop or choose a folder, the page opens only the files that describe a project: the `.tmdl` files, the report's JSON files, the `.pbip` file, `definition.pbir`, `.platform`, and `pbiplint.config.json`. Everything else in the folder, the `.pbi` folder included, stays unopened. The results are made in the tab, and a report you export goes only to your browser's downloads, or to your clipboard when you copy it.

### On the command line

`pbiplint` opens the same kinds of files the site does: those under the path you give it, and those in the report or model folder that a `.pbip` file or a report's `definition.pbir` points to, along with the nearest `pbiplint.config.json` or the one `--config` names. It writes to your terminal, or to the file `--output` names, and nowhere else. It makes no network request: no telemetry and no update check. Installing it is the only network step: `npm` or `npx` fetches the package from the npm registry, and that request carries nothing from your project.

### In the GitHub Action

The Action runs the same command line inside your own workflow, on GitHub's runners or on your own. It fetches the version of `pbiplint` it pins from the npm registry, a request that carries nothing from your project, and lints on the runner. What it writes goes to your repository on GitHub and nowhere else: the check, the annotations, and the job summary on the workflow run, and the SARIF report in your repository's code scanning. That upload, made by GitHub's own upload step, is the one step that sends the findings beyond the run, and `upload-sarif: false` turns it off. On a public repository, anyone who can see the run can see the findings, and the findings name your tables, columns, and measures.

<h2 id="check">How to check it</h2>

1. **Watch the network.** Open your browser's developer tools, switch to the Network tab, load this site, and lint a model. After the page's own files load, no request is made: not when you drop a folder, not when you click a button, not when you export a report.
2. **Turn the network off.** Load the page, then turn on airplane mode or unplug the network. Everything still works, because nothing needed the network.
3. **Read the policy.** View the page source. Every page carries a Content-Security-Policy with `connect-src 'none'`: the browser itself refuses to let the page open a connection of any kind.
4. **Look for stored data.** In the developer tools' Application tab (Storage in Firefox and Safari), the site has no cookies, and nothing in local storage, session storage, or IndexedDB.
5. **Read the code.** The linter core has [a build check](https://github.com/pbiplint/pbiplint/blob/main/packages/core/scripts/check-browser-bundle.mjs) that fails if it references a network API, and the command line has [a check of its own](https://github.com/pbiplint/pbiplint/blob/main/packages/cli/scripts/check-network.mjs) that fails if its bundle reaches for a network module or API. Both run on every change, and the site build fails if any page references an external script, style, font, or image. The source is on [GitHub](https://github.com/pbiplint/pbiplint).

If you ever find pbiplint breaking the Promise, that is a security bug. Report it privately, as [the security policy](https://github.com/pbiplint/pbiplint/blob/main/SECURITY.md) describes.
