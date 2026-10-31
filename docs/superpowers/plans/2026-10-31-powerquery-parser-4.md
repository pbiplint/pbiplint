# Power Query parser 4.0.1 Implementation Plan

**Goal:** Move the core from `@microsoft/powerquery-parser` 2.0.0 to 4.0.1 and show that nothing a user sees changes without a reason. Issue: #258.

**Approach:** One pull request, the smallest change that meets the issue's boxes. pbiplint calls `TaskUtils.tryLexParse` and walks the tree it returns, and uses no inspection, so the breaking change behind 4.0.0 should not reach it. The change most likely to is the lexer's, which now scans the whole document and stops at the first failure: `parseM` (`packages/core/src/m/parse.ts`) reads a per-line error map that may no longer appear.

**Out of scope:** Changes to the Power Query rules, unless the corpus diff shows one is needed to keep a finding as it was. Historical specs and plans keep naming 2.0.0, since they record what was true when they were written.

## Steps

1. **The pin.** `npm install --save-exact @microsoft/powerquery-parser@4.0.1 -w @pbiplint/core`, and the pin's test in `packages/core/test/m-parse.test.ts` first (it fails until the pin moves).
2. **Types and tests.** `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `npm run check:browser`, `npm run check:network`, `npm run check:pack`, `npm run test:e2e`. Any change to how `parseM` reads an error starts with a failing test in `m-parse.test.ts`.
3. **The corpus diff.** Build the core at the base commit with 2.0.0 and at this branch with 4.0.1, lint every model in the research corpus with both, and compare whole findings: rule, object, file, line, column, detail, and message. Every difference is explained in the pull request, or the upgrade waits.
4. **The M work budget's calibration.** Re-measure on 4.0.1 the numbers that set the limits in `packages/core/src/m/budget.ts`: the corpus's largest query, largest model's M, and deepest nesting (they count text, so they should not move), and the time and memory of the slowest shapes just under the limits, on both versions. The limits stay unless the numbers call for a change. The figures in the comments are updated if they moved.
5. **The bundle.** `npm run check:browser`. The parser's budget (385 KB) holds, or rises in a measured step, recorded in the script's comment and the pull request.
6. **The copy.** `NOTICE` and `SECURITY.md`, and a grep for anything else that names 2.0.0 as the current version.
7. **Review and pull request.** One review of the whole branch, then the pull request with the corpus diff summary and the measurements.
