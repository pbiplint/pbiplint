# CLI colour Implementation Plan

**Goal:** Colour the CLI's text report when it prints to a terminal, so errors stand out in a long run, and keep every other output byte for byte as it is. Issue: #256, whose Decided section and boxes are the spec.

**Approach:** One pull request, the smallest change that meets the issue's boxes. The core's text format learns to wrap a few fixed strings in colour codes when asked, and is never asked by default. The CLI decides whether to ask, from whether stdout is a terminal and from the environment, and only for the text report on stdout. No new dependency, and no new Node module in the CLI bundle: `process.stdout.isTTY` and `process.env` are enough, so the network check's list of allowed modules stays as it is.

**Out of scope:** As the issue says: `--quiet`, `pbiplint explain`, `--help`, the GitHub Action's and the Azure Pipelines task's logs, a `--color` option, and the site.

## The colours

The 16 standard ANSI colours and bold only, as the issue decides. Each choice was checked for contrast against the background of a light and a dark theme in nine common palettes (macOS Terminal's Basic and Pro profiles, VS Code's Light+ and Dark+, Windows Terminal's Campbell, xterm on white and on black, GNOME's Tango on light and dark, and iTerm2's default), using the contrast ratio [WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum) defines. The floor is 3:1 in every palette, the ratio WCAG asks of large text ("Large-scale text and images of large-scale text have a contrast ratio of at least 3:1"): the severity words are always printed, so colour is never the only cue ([WCAG 2.2, 1.4.1 Use of Color](https://www.w3.org/TR/WCAG22/#use-of-color): "Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element").

| What | Style | Lowest contrast in the nine palettes |
| --- | --- | --- |
| `ERROR` on a rule's heading line, and a non-zero error count in the summary line | Bold bright red (`1;91`) | 4.0:1 (xterm on white) |
| `WARN` on a rule's heading line, and a non-zero warning count | Bright magenta (`95`) | 3.1:1 (xterm on white) |
| `INFO`, and the info count | The terminal's own foreground, no code | The theme's own text contrast |
| `Fix these first:` | Bold (`1`) | The theme's own text contrast |

Why not the usual yellow and blue or cyan:

- **Yellow** falls to between 1.7:1 and 3.1:1 on every light background checked (3.0:1 in macOS Terminal's Basic profile, 1.7:1 in xterm on white), and bright yellow to between 1.1:1 and 2.1:1.
- **Red without bright** falls to 2.4:1 on macOS Terminal's Pro profile.
- **Blue and cyan** each fail one side: blue falls to 1.6:1 on a dark background, bright blue to 2.4:1, and cyan to 2.0:1 on a light one. Info is the least urgent severity, so it keeps the terminal's own foreground, which every theme makes readable, and leaves the two colours to the findings that need action.
- **Bright red and bright magenta** are also the two bright colours Solarized keeps as colours (orange and violet), where it maps the other brights to greys.

A zero count stays plain: a red "0 errors" would read as an alarm. Each code is closed by its own reset (`22` for bold, `39` for the colour), so nothing else on the line changes.

## When colour is on

Off, whatever the environment, for `--quiet`, `--format json`, `sarif`, or `markdown`, and `--output`. For the text report on stdout, in this order:

1. **`FORCE_COLOR`**, when set, decides, as [Node's documentation](https://nodejs.org/api/cli.html#force_color1-2-3) gives it: "`1`, `true`, or the empty string `''` indicate 16-color support, `2` to indicate 256-color support, or `3` to indicate 16 million-color support. When `FORCE_COLOR` is used and set to a supported value, both the `NO_COLOR`, and `NODE_DISABLE_COLORS` environment variables are ignored. Any other value will result in colorized output being disabled." So `FORCE_COLOR=0` turns colour off even in a terminal.
2. **`NO_COLOR`** set to a non-empty value turns colour off, as [no-color.org](https://no-color.org/) asks: "Command-line software which adds ANSI color to its output by default should check for a `NO_COLOR` environment variable that, when present and not an empty string (regardless of its value), prevents the addition of ANSI color."
3. **`TERM=dumb`** turns colour off.
4. Otherwise colour is on when stdout is a terminal, which [Node's documentation](https://nodejs.org/api/tty.html#tty) says to check this way: "The preferred method of determining whether Node.js is being run within a TTY context is to check that the value of the `process.stdout.isTTY` property is `true`".

A run of the CLI that `pbiplint mcp` captures for a tool call never colours, since its output goes to an assistant, not a terminal.

## Steps

Each step starts with a failing test.

1. **The core's styles** (`packages/core/src/format/text.ts`). `FormatOptions` gains `colour?: boolean`, false by default. With it, `formatText` wraps the severity tag (the word only, so its padding and the columns after it stay where they are), the summary line's non-zero error and warning counts, and the `Fix these first:` heading. `countsLine` takes an optional function that styles a count, so the summary sentence the Markdown format and the site share is unchanged. The core reads no environment and imports nothing. Tests in `packages/core/test/format.test.ts`: no code by default; codes around exactly those strings with `colour: true`; the output with the codes removed equals the plain output; a name holding an escape character still prints as `\u001b`, and the only escape characters in the output are the ones the format added.
2. **Several projects** (`packages/cli/src/several.ts`). `severalText` passes the option to each project's report and styles the combined summary line's counts.
3. **The CLI's decision** (a small new module in `packages/cli/src`, called from `main.ts`). `Io` gains an optional `isTTY` and `env`, which `bin.ts` fills from `process.stdout.isTTY` and `process.env`. Left out, as every existing test and the MCP capture leave them, colour is off. Tests in `packages/cli/test/cli.test.ts`: on in a terminal; on through a pipe with `FORCE_COLOR`; off for a pipe, `NO_COLOR`, `TERM=dumb`, and `FORCE_COLOR=0` in a terminal; off for `--output`, `--format json`, `--format sarif`, `--format markdown`, and `--quiet` even with `FORCE_COLOR` set; a visual title holding an escape character prints as `\u001b` with colour on; a run over several projects colours each report. The contract tests and the golden outputs pass unchanged.
4. **The CLI page** (`packages/web/content/cli.md`, "stdout and stderr"). One bullet: colour codes appear only in the text report written to a terminal, or through a pipe with `FORCE_COLOR`, and never in JSON, SARIF, Markdown, `--quiet`, or a file `--output` writes; `NO_COLOR` turns them off. Sources quoted with links as above.
5. **Checks.** `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `npm run check:browser`, `npm run check:network`, `npm run check:pack`, `npm run test:e2e`. The built bundle's `--sample` run, through a pipe, is byte for byte the same as main's.
6. **Screenshots.** The sample's report in a dark terminal theme and in macOS Terminal's Basic profile, rendered from the CLI's real output, escape codes and all. Nothing from this goes in the repository.
7. **Review and pull request.** One review of the whole branch, then the pull request, naming each colour and why, and how the screenshots were made.
