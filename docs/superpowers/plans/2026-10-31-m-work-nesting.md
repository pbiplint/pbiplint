# M work budget: nesting Implementation Plan

**Goal:** Make the M work budget (`packages/core/src/m/budget.ts`) count a cost it misses today, so a query whose parse would take far more memory than the budget's other worst shapes is a `PARSE_ISSUE` instead of being parsed.

**Why:** Nesting multiplies the parser's work when a `(` has no matching `)` after it. `mWork` does not count that, so a query far under the limit can take far more memory than the budget's other worst shapes.

**Approach:** One term in `mWork`, the smallest change that closes the gap. It keeps a stack of `(` that holds only parentheses, with the tokens read so far at each. A `)` pops one. At the end of the text, each `(` left on the stack is charged a weight times its token count. A `(` that closes and an open `{` or `[` are not charged.

A query with such a `(` cannot parse, so the charge takes no reading from that query. It can turn the parser's message for broken M into the budget's message, on large M, and both are a `PARSE_ISSUE`. The charge counts toward the model's budget, so broken queries with heavy charges can take a valid query after them over the model's limit until the broken M is fixed.

The review of this change found a second miss in the same count: `mWork` read `[\w.@]+` as one word where the lexer splits it, so `1 and@a` hid its operator from the chain term, and `1..2` and `.1.2` counted as one token. A second small change splits a word at `@`, at each `..` or `...`, and after each number it starts with.

**Out of scope:** The limits themselves and the depth limit. The other costs the budget counts. `SECURITY.md`'s text.

## Steps

1. **Failing tests.** In `packages/core/test/m-budget.test.ts`: the units of the new term, on brackets that close, stay open, or are closed by the wrong bracket; and the shape family read as over the budget, unparsed, within the file's time bound, with a smaller one still reaching the parser. In `packages/cli/test/cli.test.ts`: a model of the 117 KB shape, run through the CLI's `main` as the file's other tests are, exits 1 with a `PARSE_ISSUE`. The built CLI is checked on the same file by hand, in a child process, for no signal.
2. **The term and its weight.** Calibrate the weight with shapes just under the query limit: the shape family at several depths, with the tokens before each bracket made of lists, calls, field reads, records, functions, conditionals, `let` steps, and section members, against every shape the budget's calibration already measures. No shape may cost more memory or time than the worst the budget already allows, about 1 GB and about ten seconds per query.
3. **The corpus.** Every query stays under the budget. Compare whole findings between the base commit and this branch across the research corpus, with a control run of the base against itself. Zero changes expected.
4. **The copy.** `budget.ts`'s comment and the v3 spec's budget amendment, with a dated note. The spec, the hardening plan, and the comment also say how long the slowest shapes take as measured: up to about ten seconds per query on a laptop, longer on slower runners.
5. **Checks and review.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:browser`, `npm run check:network`, `npm run check:pack`, `npm run test:e2e`, then one review of the whole branch.
