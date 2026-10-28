# One-project goldens (#237)

What a one-project run printed before #237 changed any code: stdout, stderr, and the exit code of
the built CLI for each case in `cases.json`, recorded on October 28, 2026 on `v3/multi-project`
just after #238's merge (`cf0463b`). The contract test compares today's output with these byte
for byte, so a several-project change that touches a one-project run fails there.

**Never re-record these on this branch.** They are the record of `release/0.3.0`'s output. A run
that differs from them is a regression to fix, not a golden to update.

## The cases

Two inputs, each with seven options:

- `sample-*` lints `examples/messy-sales`.
- `below-*` lints a temp folder holding one copy of the sample at `sub/messy-sales`, so the run
  prints the "only project found below" notice.

The options are text (no option), `--quiet`, `--format json`, `--format markdown`,
`--format sarif`, `--output <OUT>/report.txt`, and `--rule PROVIDE_FORMAT_STRING_FOR_MEASURES`.
Each case has `<name>.out` (stdout), `<name>.err` (stderr), and `<name>.code` (the exit code); the
`--output` cases also have `<name>.file`, the file the run wrote. `cases.json` lists each case's
argv with the placeholders still in it.

## Placeholders

Each case ran with its own fresh temp folders, whose paths were replaced after the run:

- `<TMP>`: the folder linted by a `below-*` case (absolute, as given on the command line).
- `<OUT>`: the folder holding the `--output` file (absolute).
- `<TMPREL>`: the `<TMP>` folder relative to the cwd, as SARIF's artifact URIs give it (only in
  `below-sarif.out`). The temp folder's name has no character that SARIF percent-encodes.

A test fills these in with its own folders before comparing.

## How they were recorded

`npm run build`, then each case as `node packages/cli/dist/pbiplint.mjs <argv>` with the worktree
root as the cwd, capturing stdout and stderr separately.
