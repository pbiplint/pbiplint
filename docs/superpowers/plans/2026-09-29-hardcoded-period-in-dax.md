# HARDCODED_PERIOD_IN_DAX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pbiplint's first native model rule, HARDCODED_PERIOD_IN_DAX (issue #104, milestone 0.2.1): info findings for fixed years and dates in measures, calculated columns, and calculation items, and for date tables whose `CALENDAR` ends on a fixed date.

**Architecture:** The TMDL parser records the line where each expression's text starts (`valueLine`), so a finding can point at the period's own line. A small browser-pure DAX tokenizer in core (`packages/core/src/dax/tokenize.ts`) turns an expression into tokens that know their enclosing call and argument, plus `VAR` definitions with DAX's scoping. The rule's forms (`period-forms.ts`, with the multilingual name classes in `period-words.ts`) find periods in token lists; the rule (`periods.ts`) walks the model, drops objects named for their period, and builds one finding per object.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, ESLint and Prettier, npm workspaces (`packages/core`, `packages/cli`, `packages/web`).

**Spec:** `docs/superpowers/specs/2026-09-29-hardcoded-period-in-dax-design.md`. Read it before starting any task. The research it cites is at `.superpowers/research/2026-09-27-hardcoded-periods/report.md` (git-ignored, present in the checkout) with the corpus and prototype in `~/Downloads/pbip-lint-spike/research-104/`.

## Global Constraints

- No em dashes anywhere (code, comments, tests, pages, commit messages). A hook blocks them, and `rule-pages.test.ts` rejects U+2014 on a page. Restructure the sentence instead.
- Core stays browser-pure: no `node:` imports, no `fetch`, nothing that reads files, under `packages/core/src`. `npm run check:browser` enforces it.
- Tabular Editor is never required and never mentioned as a fix route on the page.
- Human-facing copy (the rule page, finding details) uses long-form dates ("December 31, 2026"). Bullets start with a capital letter.
- Every quote from or claim about a web page carries a link to that page, with a section anchor when there is one.
- Match the surrounding code's comment density and idiom: doc comments in full sentences on exported and non-obvious functions.
- Work on the branch `hardcoded-period-in-dax` in `~/Projects/pbiplint` (not a worktree). Commit after each task. Commit messages end with these two lines, after a blank line:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
  ```

  and carry `Part of #104.` before them. Never write a closing keyword (close, closes, fix, fixes, resolve, resolves) next to an issue number anywhere in a commit message.
- Before each commit: `npx prettier --write <changed files>`, then `npm run lint`, `npm run typecheck`, and the task's tests. At the end of Task 5 the whole suite (`npm test`) must pass.
- Never edit anything under `~/Library/CloudStorage/OneDrive-McKinleyConsulting/`.

---

### Task 1: The parser records where a value starts (`valueLine`)

**Files:**
- Modify: `packages/core/src/tmdl/types.ts` (the `TmdlNode` interface)
- Modify: `packages/core/src/tmdl/parse.ts` (the per-line loop: `collectBlock`, `collectFenced`, and the `h.hasEq` branch, around lines 232 to 333)
- Test: `packages/core/test/parse.test.ts` (append a `describe` block)

**Interfaces:**
- Produces: `TmdlNode.valueLine?: number`, set on every `expr` node and every `object` node declared with `=`. Task 4 reads it through `Named.node` (measures, calculated columns, calculation items) and through a calculated partition's child `expr` node of type `source`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/parse.test.ts` (it already imports `describe`, `expect`, `it`, and `parseTmdl`):

```ts
describe("valueLine", () => {
  it("is the header's own line for an inline value", () => {
    const pf = parseTmdl("t.tmdl", "table T\n\tmeasure M = 1\n");
    expect(pf.roots[0]!.children[0]).toMatchObject({ line: 2, valueLine: 2, value: "1" });
  });
  it("is the first non-blank line of an indented block, whose lines map one to one", () => {
    const pf = parseTmdl(
      "t.tmdl",
      "table T\n\tmeasure M =\n\n\t\t\tVAR x = 1\n\n\t\t\tRETURN x\n\t\tformatString: 0\n",
    );
    const m = pf.roots[0]!.children[0]!;
    expect(m).toMatchObject({ line: 2, valueLine: 4 });
    expect(m.value).toBe("VAR x = 1\n\nRETURN x");
  });
  it("is the line after the header for a code fence, closed or not", () => {
    const closed = parseTmdl("t.tmdl", "table T\n\tmeasure M = ```\n\t\t\t1 +\n\t\t\t2\n\t\t\t```\n");
    expect(closed.roots[0]!.children[0]).toMatchObject({ line: 2, valueLine: 3, value: "1 +\n2" });
    const open = parseTmdl("t.tmdl", "table T\n\tmeasure M = ```\n\t\t\t1\n\tmeasure N = 2\n");
    expect(open.roots[0]!.children[0]).toMatchObject({ line: 2, valueLine: 3 });
  });
  it("is set on an expression with no name, such as a calculated partition's source", () => {
    const pf = parseTmdl(
      "t.tmdl",
      "table T\n\tpartition T = calculated\n\t\tmode: import\n\t\tsource =\n\t\t\t\tCALENDAR(1, 2)\n",
    );
    const partition = pf.roots[0]!.children[0]!;
    expect(partition).toMatchObject({ kind: "object", line: 2, valueLine: 2, value: "calculated" });
    const source = partition.children.find((c) => c.type === "source")!;
    expect(source).toMatchObject({ kind: "expr", line: 4, valueLine: 5, value: "CALENDAR(1, 2)" });
  });
  it("is absent where no value is read after =", () => {
    const pf = parseTmdl("t.tmdl", "table T\n\tcolumn C\n\t\tdataType: int64\n");
    expect(pf.roots[0]!.valueLine).toBeUndefined();
    expect(pf.roots[0]!.children[0]!.valueLine).toBeUndefined();
    expect(pf.roots[0]!.children[0]!.children[0]!.valueLine).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/test/parse.test.ts -t valueLine`
Expected: FAIL, `valueLine` is undefined where a number is expected (the last test passes already).

- [ ] **Step 3: Add the field to the type**

In `packages/core/src/tmdl/types.ts`, inside `interface TmdlNode`, after the `value?: string;` member and its comment, add:

```ts
  /**
   * The file line of the value's first line, on a node whose value is read after `=` (an `expr`
   * node, or an `object` node declared with `=`): the header's own line for an inline value, the
   * first non-blank line of an indented block, the line after the header for a code fence, closed
   * or not. Every line of the value is a line of the file, in order (a blank line inside it is
   * kept as an empty line), so an offset into `value` lies on this line plus the line breaks
   * before it.
   */
  valueLine?: number;
```

- [ ] **Step 4: Record it in the parser**

In `packages/core/src/tmdl/parse.ts`, inside the `while (i < lines.length)` loop, just before the comment `// Indented multi-line expression.` that introduces `collectBlock`, add:

```ts
    /** Where the value read after `=` starts; `collectBlock` and `collectFenced` move it. */
    let valueLine = lineNo;
```

In `collectBlock`, after the line `if (blockIndent <= indent) return "";`, add:

```ts
      valueLine = j + 1;
```

In `collectFenced`, as its first statement (before `let j = i + 1;`), add:

```ts
      valueLine = lineNo + 1;
```

In the `if (h.hasEq) {` branch, give both nodes the field. Replace:

```ts
        node =
          h.name === undefined
            ? { ...base, kind: "expr", type: h.type.toLowerCase(), value }
            : { ...base, kind: "object", type: h.type.toLowerCase(), name: h.name, value };
```

with:

```ts
        node =
          h.name === undefined
            ? { ...base, kind: "expr", type: h.type.toLowerCase(), value, valueLine }
            : { ...base, kind: "object", type: h.type.toLowerCase(), name: h.name, value, valueLine };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/parse.test.ts packages/core/test/build.test.ts packages/core/test/fixtures.test.ts`
Expected: PASS. If an existing test compares a whole node with `toEqual` and now fails only on the new field, add `valueLine` to its expected object with the right line; do not loosen it to `toMatchObject`.

- [ ] **Step 6: Lint, typecheck, and commit**

```bash
npx prettier --write packages/core/src/tmdl/types.ts packages/core/src/tmdl/parse.ts packages/core/test/parse.test.ts
npm run lint && npm run typecheck
git add packages/core/src/tmdl/types.ts packages/core/src/tmdl/parse.ts packages/core/test/parse.test.ts
git commit -F - <<'EOF'
feat(core): record the line where a TMDL value starts

valueLine on a node whose value is read after =: the header's line for
an inline value, the first non-blank line of an indented block, the line
after the header for a code fence. A value's lines map one to one to the
file's, so a rule can point at the line of any offset in an expression.

Part of #104.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 2: The DAX tokenizer

**Files:**
- Create: `packages/core/src/dax/tokenize.ts`
- Test: `packages/core/test/dax-tokenize.test.ts`

**Interfaces:**
- Produces (Task 3 imports all of these from `../../dax/tokenize.js`):
  - `type DaxTokenKind = "number" | "string" | "date" | "table" | "column" | "identifier" | "operator" | "punctuation"`
  - `interface DaxToken { kind; text; start; end; depth; parent?; arg?; close?; open?; call? }`
  - `interface DaxVariable { name: string; at: number; from: number; to: number; blockEnd: number }`
  - `tokenizeDax(expression: string): DaxToken[]`
  - `daxVariables(tokens: readonly DaxToken[]): DaxVariable[]`
  - `variableAt(vars: readonly DaxVariable[], name: string, use: number): DaxVariable | undefined`
  - `isWord(t: DaxToken | undefined, word: string): boolean` (word given upper-case)
  - `isPunctuation(t: DaxToken | undefined, char: string): boolean`
- Not exported from `packages/core/src/index.ts` (internal to core).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/dax-tokenize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { daxVariables, tokenizeDax, variableAt } from "../src/dax/tokenize.js";

const kinds = (dax: string): string[] => tokenizeDax(dax).map((t) => `${t.kind}:${t.text}`);

describe("tokenizeDax", () => {
  it("reads each kind of token", () => {
    expect(
      kinds(`CALCULATE([Total], 'Date'[Year] = 2025, dt"2025-06-30", "a""b", .5, 1.5e3)`),
    ).toEqual([
      "identifier:CALCULATE",
      "punctuation:(",
      "column:Total",
      "punctuation:,",
      "table:Date",
      "column:Year",
      "operator:=",
      "number:2025",
      "punctuation:,",
      "date:2025-06-30",
      "punctuation:,",
      'string:a"b',
      "punctuation:,",
      "number:.5",
      "punctuation:,",
      "number:1.5e3",
      "punctuation:)",
    ]);
  });

  it("drops comments of all three forms", () => {
    expect(kinds("1 // 2020\n+ 2 -- 2021\n/* 2022\n */ + 3")).toEqual([
      "number:1",
      "operator:+",
      "number:2",
      "operator:+",
      "number:3",
    ]);
  });

  it("undoes a doubled quote in a table name and a doubled bracket in a column name", () => {
    expect(kinds("'Bob''s'[a]]b]")).toEqual(["table:Bob's", "column:a]b"]);
  });

  it("reads dt as a typed date's prefix only where no letter or digit comes before it", () => {
    expect(kinds('DT"2025-01-01" + Adt"x" + 2dt"y"')).toEqual([
      "date:2025-01-01",
      "operator:+",
      "identifier:Adt",
      "string:x",
      "operator:+",
      "number:2",
      "identifier:dt",
      "string:y",
    ]);
  });

  it("reads dotted and non-Latin identifiers", () => {
    expect(kinds("PERCENTILE.INC(Año, _x1)")).toEqual([
      "identifier:PERCENTILE.INC",
      "punctuation:(",
      "identifier:Año",
      "punctuation:,",
      "identifier:_x1",
      "punctuation:)",
    ]);
  });

  it("reads each operator, the longest first", () => {
    const ops = ["==", "<>", "<=", ">=", "&&", "||", "=", "<", ">", "+", "-", "*", "/", "^", "&"];
    expect(
      kinds("a == b <> c <= d >= e && f || g = h < i > j + k - l * m / n ^ o & p").filter((k) =>
        k.startsWith("operator:"),
      ),
    ).toEqual(ops.map((o) => `operator:${o}`));
  });

  it("gives each token its offsets into the expression", () => {
    const year = tokenizeDax("x = 2025")[2]!;
    expect([year.start, year.end]).toEqual([4, 8]);
    const name = tokenizeDax(`  'Sales'[Year]`)[0]!;
    expect([name.start, name.end]).toEqual([2, 9]);
  });

  it("matches brackets and records each token's depth, bracket, argument, and call", () => {
    // 0 DATE 1 ( 2 2025 3 , 4 { 5 1 6 , 7 2 8 } 9 , 10 MAX 11 ( 12 x 13 ) 14 )
    const t = tokenizeDax("DATE(2025, {1, 2}, MAX(x))");
    expect(t[1]).toMatchObject({ call: "DATE", close: 14, depth: 0 });
    expect(t[2]).toMatchObject({ parent: 1, arg: 0, depth: 1 });
    expect(t[4]).toMatchObject({ parent: 1, arg: 1, close: 8, depth: 1 });
    expect(t[4]!.call).toBeUndefined();
    expect(t[7]).toMatchObject({ parent: 4, arg: 1, depth: 2 });
    expect(t[8]).toMatchObject({ open: 4, parent: 1, arg: 1, depth: 1 });
    expect(t[11]).toMatchObject({ call: "MAX", parent: 1, arg: 2, close: 13, depth: 1 });
    expect(t[12]).toMatchObject({ parent: 11, arg: 0, depth: 2 });
    expect(t[14]).toMatchObject({ open: 1, depth: 0 });
    expect(t[14]!.parent).toBeUndefined();
  });

  it("never throws on text left open or brackets that do not match", () => {
    for (const dax of ['"open', "'open", "[open", "/* open", "a)", "((", "{)", 'dt"2025', "😀"])
      expect(() => tokenizeDax(dax), dax).not.toThrow();
    expect(kinds('"open')).toEqual(["string:open"]);
    expect(kinds("[open")).toEqual(["column:open"]);
    const stray = tokenizeDax("a)")[1]!;
    expect(stray).toMatchObject({ kind: "punctuation", text: ")", depth: 0 });
    expect(stray.open).toBeUndefined();
    expect(tokenizeDax("((")[0]!.close).toBeUndefined();
  });
});

describe("daxVariables", () => {
  const source = (dax: string) => {
    const tokens = tokenizeDax(dax);
    return daxVariables(tokens).map((v) => [
      v.name,
      tokens
        .slice(v.from, v.to)
        .map((t) => t.text)
        .join(" "),
    ]);
  };

  it("reads each definition up to the next VAR or RETURN at its level", () => {
    expect(source("VAR a = DATE(2025, 1, 1) VAR NextYear = a + 1 RETURN NextYear")).toEqual([
      ["a", "DATE ( 2025 , 1 , 1 )"],
      ["NextYear", "a + 1"],
    ]);
  });

  it("ends a definition inside a call at the call's close", () => {
    expect(source("CALCULATE(VAR y = 2025 RETURN y) + 1")).toEqual([["y", "2025"]]);
  });

  it("keeps a nested block's variables inside the outer definition", () => {
    expect(source("VAR z = CALCULATE(VAR y = 2025 RETURN y) RETURN z")).toEqual([
      ["z", "CALCULATE ( VAR y = 2025 RETURN y )"],
      ["y", "2025"],
    ]);
  });

  it("resolves a name to the nearest definition before it whose block it is still in", () => {
    const dax = "VAR y = 2024 VAR z = CALCULATE([x], VAR y = 2025 RETURN y) RETURN y + Y";
    const tokens = tokenizeDax(dax);
    const vars = daxVariables(tokens);
    const uses = tokens.flatMap((t, k) =>
      t.kind === "identifier" && t.text.toUpperCase() === "Y" && tokens[k + 1]?.text !== "="
        ? [k]
        : [],
    );
    expect(uses.map((k) => tokens[variableAt(vars, tokens[k]!.text, k)!.from]!.text)).toEqual([
      "2025",
      "2024",
      "2024",
    ]);
    expect(variableAt(vars, "missing", tokens.length - 1)).toBeUndefined();
  });

  it("does not resolve a name inside its own definition to itself", () => {
    const tokens = tokenizeDax("VAR a = a RETURN a");
    const vars = daxVariables(tokens);
    expect(variableAt(vars, "a", 3)).toBeUndefined();
    expect(variableAt(vars, "a", 5)?.at).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/test/dax-tokenize.test.ts`
Expected: FAIL, the module `../src/dax/tokenize.js` does not exist.

- [ ] **Step 3: Write the tokenizer**

Create `packages/core/src/dax/tokenize.ts`:

```ts
/**
 * A small DAX tokenizer: enough of DAX's lexical rules to tell a number from a string, a comment,
 * or a name, and to say which call and argument each token sits in. It is a port of the one the
 * research for #104 used (`daxlex.py`), browser-pure like the rest of core, and it never throws:
 * text it cannot make out becomes punctuation, one character at a time, and a string, name, or
 * comment left open runs to the end of the text. #108 moves the reference reader onto it.
 */

export type DaxTokenKind =
  | "number"
  | "string"
  | "date"
  | "table"
  | "column"
  | "identifier"
  | "operator"
  | "punctuation";

export interface DaxToken {
  kind: DaxTokenKind;
  /**
   * For a string, a `dt"..."` date, a `'table'` name, or a `[column]` name, the text between its
   * quotes or brackets with a doubled quote or bracket undone (`""`, `''`, `]]`); for any other
   * token, its source text.
   */
  text: string;
  /** Offsets into the expression: the token's source is `expression.slice(start, end)`. */
  start: number;
  end: number;
  /** How many `(` and `{` enclose the token. A bracket's own depth is the depth outside it. */
  depth: number;
  /** The index of the innermost `(` or `{` enclosing the token, if any. */
  parent?: number;
  /** The token's argument within `parent`: how many commas directly inside `parent` precede it. */
  arg?: number;
  /** On an opening `(` or `{`, the index of the token that closes it, if one does. */
  close?: number;
  /** On a closing `)` or `}`, the index of the token it closes, if it closes one. */
  open?: number;
  /** On a `(` right after an identifier, the identifier upper-cased: the function it calls. */
  call?: string;
}

/** A `VAR name = definition` in an expression. */
export interface DaxVariable {
  /** The name as written. DAX compares names without regard to case. */
  name: string;
  /** The index of the `VAR` token. */
  at: number;
  /** The definition: the tokens from `from` up to, not including, `to`. */
  from: number;
  to: number;
  /**
   * The index of the first token outside the variable's block: the first token after the `VAR`
   * that is shallower than it, or a comma at its own depth, which ends the argument it sits in.
   */
  blockEnd: number;
}

const OPERATORS = ["==", "<>", "<=", ">=", "&&", "||", "=", "<", ">", "+", "-", "*", "/", "^", "&"];
const NUMBER = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const IDENTIFIER = /[\p{L}_][\p{L}\p{N}_.]*/uy;
const WORD_CHAR = /[\p{L}\p{N}_]/u;
const DIGIT = /[0-9]/;

/** Whether a token is the identifier or keyword `word`, given upper-case, in any case. */
export const isWord = (t: DaxToken | undefined, word: string): boolean =>
  t?.kind === "identifier" && t.text.toUpperCase() === word;

/** Whether a token is the punctuation `char`. */
export const isPunctuation = (t: DaxToken | undefined, char: string): boolean =>
  t?.kind === "punctuation" && t.text === char;

/** A run from the quote or bracket at `from` to its `close` character, a doubled `close` read as one. */
function quoted(text: string, from: number, close: string): { value: string; end: number } {
  let value = "";
  let j = from + 1;
  while (j < text.length) {
    const c = text[j]!;
    if (c === close) {
      if (text[j + 1] !== close) return { value, end: j + 1 };
      j++;
    }
    value += c;
    j++;
  }
  return { value, end: text.length };
}

/** The tokens of a DAX expression, comments dropped, each with its place among the brackets. */
export function tokenizeDax(expression: string): DaxToken[] {
  const s = expression;
  const tokens: DaxToken[] = [];
  const push = (kind: DaxTokenKind, text: string, start: number, end: number): void => {
    tokens.push({ kind, text, start, end, depth: 0 });
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (s.startsWith("//", i) || s.startsWith("--", i)) {
      const nl = s.indexOf("\n", i);
      i = nl === -1 ? s.length : nl;
    } else if (s.startsWith("/*", i)) {
      const close = s.indexOf("*/", i + 2);
      i = close === -1 ? s.length : close + 2;
    } else if (c === '"') {
      const q = quoted(s, i, '"');
      push("string", q.value, i, q.end);
      i = q.end;
    } else if (
      (c === "d" || c === "D") &&
      (s[i + 1] === "t" || s[i + 1] === "T") &&
      s[i + 2] === '"' &&
      !(i > 0 && WORD_CHAR.test(s[i - 1]!))
    ) {
      const q = quoted(s, i + 2, '"');
      push("date", q.value, i, q.end);
      i = q.end;
    } else if (c === "'" || c === "[") {
      const q = quoted(s, i, c === "'" ? "'" : "]");
      push(c === "'" ? "table" : "column", q.value, i, q.end);
      i = q.end;
    } else if (DIGIT.test(c) || (c === "." && DIGIT.test(s[i + 1] ?? ""))) {
      NUMBER.lastIndex = i;
      const text = NUMBER.exec(s)![0];
      push("number", text, i, i + text.length);
      i += text.length;
    } else {
      IDENTIFIER.lastIndex = i;
      const id = IDENTIFIER.exec(s)?.[0];
      const op = id === undefined ? OPERATORS.find((o) => s.startsWith(o, i)) : undefined;
      const text = id ?? op ?? c;
      push(
        id !== undefined ? "identifier" : op !== undefined ? "operator" : "punctuation",
        text,
        i,
        i + text.length,
      );
      i += text.length;
    }
  }
  annotate(tokens);
  return tokens;
}

/** Match brackets, and give each token its depth, its enclosing bracket, its argument, and its call. */
function annotate(tokens: DaxToken[]): void {
  const open: number[] = [];
  const args: number[] = [];
  const place = (t: DaxToken): void => {
    t.depth = open.length;
    if (open.length === 0) return;
    t.parent = open[open.length - 1];
    t.arg = args[args.length - 1];
  };
  tokens.forEach((t, k) => {
    if (isPunctuation(t, "(") || isPunctuation(t, "{")) {
      place(t);
      const before = tokens[k - 1];
      if (t.text === "(" && before?.kind === "identifier") t.call = before.text.toUpperCase();
      open.push(k);
      args.push(0);
    } else if (isPunctuation(t, ")") || isPunctuation(t, "}")) {
      const o = open.pop();
      args.pop();
      if (o !== undefined) {
        tokens[o]!.close = k;
        t.open = o;
      }
      place(t);
    } else {
      place(t);
      if (isPunctuation(t, ",") && args.length > 0) args[args.length - 1] = args.at(-1)! + 1;
    }
  });
}

/**
 * Each `VAR name = definition` in the tokens. A definition runs to the next `VAR` or `RETURN` at
 * its own depth, or to the first token shallower than it.
 */
export function daxVariables(tokens: readonly DaxToken[]): DaxVariable[] {
  const out: DaxVariable[] = [];
  tokens.forEach((t, k) => {
    const name = tokens[k + 1];
    const eq = tokens[k + 2];
    if (!isWord(t, "VAR") || name?.kind !== "identifier" || eq?.kind !== "operator") return;
    if (eq.text !== "=") return;
    const from = k + 3;
    let to = from;
    for (; to < tokens.length; to++) {
      const x = tokens[to]!;
      if (x.depth < t.depth) break;
      if (x.depth === t.depth && to > from && (isWord(x, "VAR") || isWord(x, "RETURN"))) break;
    }
    let blockEnd = to;
    for (; blockEnd < tokens.length; blockEnd++) {
      const x = tokens[blockEnd]!;
      if (x.depth < t.depth || (x.depth === t.depth && isPunctuation(x, ","))) break;
    }
    out.push({ name: name.text, at: k, from, to, blockEnd });
  });
  return out;
}

/**
 * The definition a variable's name refers to at token `use`, as DAX scopes a variable: the
 * nearest `VAR` of that name before the use whose block the use is still in, leaving out one whose
 * own definition holds the use.
 */
export function variableAt(
  vars: readonly DaxVariable[],
  name: string,
  use: number,
): DaxVariable | undefined {
  const key = name.toUpperCase();
  let found: DaxVariable | undefined;
  for (const v of vars)
    if (
      v.name.toUpperCase() === key &&
      v.at < use &&
      use < v.blockEnd &&
      !(v.from <= use && use < v.to)
    )
      found = v;
  return found;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/dax-tokenize.test.ts`
Expected: PASS. If a structure expectation fails, re-derive the token indices from the comment in the test before changing code; the comment is the contract.

- [ ] **Step 5: Lint, typecheck, check the browser bundle, and commit**

```bash
npx prettier --write packages/core/src/dax/tokenize.ts packages/core/test/dax-tokenize.test.ts
npm run lint && npm run typecheck && npm run build -w @pbiplint/core && npm run check:browser
git add packages/core/src/dax/tokenize.ts packages/core/test/dax-tokenize.test.ts
git commit -F - <<'EOF'
feat(core): a small DAX tokenizer

Numbers, strings, typed dates, quoted table names, bracketed names,
identifiers, operators, and punctuation, with comments dropped, and each
token's depth, enclosing bracket, argument, and call. daxVariables reads
VAR definitions and variableAt resolves a name as DAX scopes it. A port
of the research prototype's tokenizer; browser-pure and never throwing.

Part of #104.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 3: Year names and the forms that find periods

**Files:**
- Create: `packages/core/src/rules/pbiplint/period-words.ts`
- Create: `packages/core/src/rules/pbiplint/period-forms.ts`
- Test: `packages/core/test/period-forms.test.ts`

**Interfaces:**
- Consumes (from Task 2, `../../dax/tokenize.js`): `tokenizeDax`, `daxVariables`, `variableAt`, `isWord`, `isPunctuation`, `DaxToken`, `DaxVariable`.
- Produces (Task 4 imports from `./period-forms.js`):
  - `interface Period { at: number; year: number; date?: { year: number; month: number; day: number }; ambiguous?: string }`
  - `expressionPeriods(expression: string): Period[]` (spec sections 4.2 to 4.4, in order of `at`, each `at` once)
  - `calendarEnds(expression: string): Period[]` (spec section 4.1)
- Produces (from `./period-words.js`): `type NameClass = "year" | "yearKey" | "yearCount" | "month" | "quarter"`, `nameWords(name: string): string[]`, `nameClass(name: string): NameClass | undefined`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/period-forms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calendarEnds, expressionPeriods, type Period } from "../src/rules/pbiplint/period-forms.js";
import { nameClass, nameWords } from "../src/rules/pbiplint/period-words.js";

/** A period as a test reads it: a year, a day as y-m-d, or an ambiguous string in quotes. */
const show = (p: Period): string =>
  p.ambiguous !== undefined
    ? `"${p.ambiguous}"`
    : p.date
      ? `${p.date.year}-${p.date.month}-${p.date.day}`
      : String(p.year);
const found = (dax: string): string[] => expressionPeriods(dax).map(show);
const ends = (dax: string): string[] => calendarEnds(dax).map(show);

describe("year names", () => {
  it("splits a name into lowercased words at case changes, digits, and separators", () => {
    expect(nameWords("FiscalYear")).toEqual(["fiscal", "year"]);
    expect(nameWords("anio_venta")).toEqual(["anio", "venta"]);
    expect(nameWords("Year2025")).toEqual(["year", "2025"]);
    expect(nameWords("CurrentFY")).toEqual(["current", "fy"]);
    expect(nameWords("Calendar Year (Num)")).toEqual(["calendar", "year", "num"]);
  });

  it("reads a year name in several languages", () => {
    for (const name of [
      "Year",
      "Years",
      "Año",
      "anio",
      "Ano",
      "Jahr",
      "Année",
      "Anno",
      "Jaar",
      "År",
      "FiscalYear",
      "fiscalyear",
      "Calendar Year",
      "SelectedYear",
      "CurrentFY",
      "yr",
    ])
      expect(nameClass(name), name).toBe("year");
  });

  it("reads a year beside a month or a quarter as a key, and a count of years as neither", () => {
    for (const name of ["YearMonth", "Year Month", "year_month", "Year Quarter", "YearQtr"])
      expect(nameClass(name), name).toBe("yearKey");
    expect(nameClass("yyyymm")).toBe("yearKey");
    expect(nameClass("Years of Service")).toBe("yearCount");
    expect(nameClass("Month")).toBe("month");
    expect(nameClass("MonthNum")).toBe("month");
    expect(nameClass("Quarter")).toBe("quarter");
    for (const name of ["Amount", "Acao", "Sales", "Payment"]) expect(nameClass(name), name).toBeUndefined();
  });
});

describe("expressionPeriods", () => {
  it("finds a year compared by =, ==, or <> with a year operand, on either side", () => {
    expect(found("'Date'[Year] = 2025")).toEqual(["2025"]);
    expect(found("2025 == 'Date'[Year]")).toEqual(["2025"]);
    expect(found("YEAR('Sales'[Order Date]) <> 2026")).toEqual(["2026"]);
    expect(found("Date[Year] = 2025")).toEqual(["2025"]);
    expect(found(`Productivity[Year] = "2025"`)).toEqual(["2025"]);
    expect(found("SELECTEDVALUE('Date'[Year]) = 2024")).toEqual(["2024"]);
    expect(found("MAX('Date'[Año]) = 2024")).toEqual(["2024"]);
    expect(found("MAX(YEAR('Sales'[Order Date])) = 2024")).toEqual(["2024"]);
    expect(found(`FORMAT('Sales'[Order Date], "yyyy") = "2024"`)).toEqual(["2024"]);
    expect(found(`"2024" = FORMAT('Sales'[Order Date], "yyyy")`)).toEqual(["2024"]);
    expect(found("SelectedYear = 2025")).toEqual(["2025"]);
    expect(found("2025 = _anio")).toEqual(["2025"]);
  });

  it("finds each year listed after IN beside a year operand", () => {
    expect(found("'Dim_Fecha'[Año] IN {2024, 2025, 2026}")).toEqual(["2024", "2025", "2026"]);
    expect(found(`NOT 'T'[Year] IN {"2024", "2025"}`)).toEqual(["2024", "2025"]);
    expect(found("YEAR('Sales'[Order Date]) IN {2024}")).toEqual(["2024"]);
  });

  it("finds a variable with a year's name set to a year alone", () => {
    expect(found("VAR SelectedYear = 2025 RETURN [Total]")).toEqual(["2025"]);
    expect(found(`VAR CurrentFY = "2025" RETURN [Total]`)).toEqual(["2025"]);
    expect(found("VAR x = 2025 RETURN [Total]")).toEqual([]);
    expect(found("VAR SelectedYear = 2025 + 0 RETURN [Total]")).toEqual([]);
  });

  it("finds DATE() with a fixed year, as a day when every argument is a whole number", () => {
    expect(found("DATE(2024, 12, 31)")).toEqual(["2024-12-31"]);
    expect(found("DATE(2024, 'Date'[Month], 1)")).toEqual(["2024"]);
    expect(found("DATE(2025, 13, 1)")).toEqual(["2026-1-1"]);
    expect(found(`FORMAT(DATE(2024, 1, 1), "yyyy")`)).toEqual(["2024-1-1"]);
    expect(
      found(
        "CALCULATE([Total], 'Date'[Date] >= DATE(2024, 1, 1), 'Date'[Date] <= DATE(2024, 12, 31))",
      ),
    ).toEqual(["2024-1-1", "2024-12-31"]);
  });

  it("gives each period once, where it is written, in order", () => {
    const dax = "IF('Date'[Year] = 2023, DATE(2024, 1, 1))";
    expect(expressionPeriods(dax).map((p) => [p.at, show(p)])).toEqual([
      [dax.indexOf("2023"), "2023"],
      [dax.indexOf("DATE"), "2024-1-1"],
    ]);
    const year = "DATE(2024, 'Date'[Month], 1)";
    expect(expressionPeriods(year)[0]!.at).toBe(year.indexOf("2024"));
  });

  it("leaves alone what does not go stale or is not a year", () => {
    for (const dax of [
      "'Date'[Year] >= 2019",
      "'Date'[Year] < 2020",
      "'Date'[Month] = 12",
      "QUARTER('Date'[Date]) = 4",
      `DATESYTD('Date'[Date], "6/30")`,
      "DIVIDE([Total], 12)",
      "MOD([Key] * 1993, 100)",
      "[Total] // 'Date'[Year] = 2025",
      `"Year = 2025"`,
      "[Sales 2025] + 'FY2025'[Amount]",
      "[YearMonth] = 202306",
      "'Date'[YearMonth] = 2023",
      "[Years of Service] = 2030",
      `'Acao'[Acao] IN {"2011", "2012"}`,
      "'Date'[Year] = 1949",
      "'Date'[Year] = 2050",
      "'Date'[Year] = 2025.5",
      "DATE(1900, 1, 1)",
      "DATE(9999, 12, 31)",
      `FORMAT(DATE(2000, 1, 1), "oooo")`,
      `FORMAT(DATE(2025, 'Date'[MonthNum], 1), "mmmm")`,
      "DATE(Yr, 1, 1)",
      "CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31))",
      "GENERATESERIES(DATE(2020, 1, 1), DATE(2020, 12, 31), 1)",
      `ADDCOLUMNS(CALENDAR(DATE(2020, 1, 1), TODAY()), "Year", YEAR([Date]))`,
    ])
      expect(found(dax), dax).toEqual([]);
  });
});

describe("calendarEnds", () => {
  it("reads a fixed end however it is written", () => {
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31))")).toEqual(["2026-12-31"]);
    expect(ends(`CALENDAR("2018-01-01", "2030-12-31")`)).toEqual(["2030-12-31"]);
    expect(ends(`CALENDAR(dt"2020-01-01", dt"2026-06-30")`)).toEqual(["2026-6-30"]);
    expect(ends(`CALENDAR(DATE(2020, 1, 1), DATEVALUE("31/12/2026"))`)).toEqual(["2026-12-31"]);
    expect(ends(`CALENDAR(DATE(2020, 1, 1), DATETIMEVALUE("2026/12/31 00:00"))`)).toEqual([
      "2026-12-31",
    ]);
    expect(ends(`CALENDAR(DATE(2020, 1, 1), VALUE("12/31/2026"))`)).toEqual(["2026-12-31"]);
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(2025, 13, 1))")).toEqual(["2026-1-1"]);
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(9999, 12, 31))")).toEqual(["9999-12-31"]);
    expect(
      ends(`ADDCOLUMNS(CALENDAR(DATE(2020, 1, 1), DATE(2024, 12, 31)), "Year", YEAR([Date]))`),
    ).toEqual(["2024-12-31"]);
  });

  it("reads an end through variables, and says where the day is written", () => {
    const viaVariable =
      "VAR EndDate = DATE(2025, 12, 31) RETURN CALENDAR(DATE(2020, 1, 1), EndDate)";
    expect(calendarEnds(viaVariable).map((p) => [p.at, show(p)])).toEqual([
      [viaVariable.indexOf("DATE"), "2025-12-31"],
    ]);
    const viaYear =
      "VAR __FirstYear = 2017 VAR __LastYear = 2023 RETURN CALENDAR(DATE(__FirstYear, 1, 1), DATE(__LastYear, 12, 31))";
    expect(calendarEnds(viaYear).map((p) => [p.at, p.year, show(p)])).toEqual([
      [viaYear.lastIndexOf("DATE"), 2023, "2023-12-31"],
    ]);
  });

  it("quotes a date string whose day and month read either way", () => {
    expect(ends(`CALENDAR(DATE(2020, 1, 1), "01/02/2026")`)).toEqual([`"01/02/2026"`]);
    expect(ends(`CALENDAR(DATE(2020, 1, 1), "05/05/2026")`)).toEqual(["2026-5-5"]);
  });

  it("leaves alone an end that is not fixed, or not written as the rule reads", () => {
    for (const dax of [
      "CALENDAR(DATE(2020, 1, 1), TODAY())",
      "CALENDAR(MIN('Sales'[Date]), MAX('Sales'[Date]))",
      "CALENDAR(DATE(2020, 1, 1), EOMONTH(TODAY(), 0))",
      "CALENDAR(DATE(2020, 1, 1), DATE(YEAR(MAX('Sales'[Date])), 12, 31))",
      "CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31) + 1)",
      "CALENDAR(DATE(2020, 1, 1), [End Date])",
      `CALENDAR(DATE(2020, 1, 1), "2026.9.11")`,
      `CALENDAR(DATE(2020, 1, 1), "31/02/2026")`,
      "CALENDARAUTO()",
      "VAR a = a RETURN CALENDAR(DATE(2020, 1, 1), a)",
      "CALENDAR(DATE(2020, 1, 1)",
    ])
      expect(ends(dax), dax).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/test/period-forms.test.ts`
Expected: FAIL, the modules do not exist.

- [ ] **Step 3: Write the name classes**

Create `packages/core/src/rules/pbiplint/period-words.ts`:

```ts
/**
 * The words #104's research read as naming a year, a month, or a quarter, in the languages of the
 * models it read. Multilingual by default, as decided on the issue: #97's language setting is for
 * the ported rules.
 */
const YEAR_WORDS = new Set([
  "year",
  "years",
  "yr",
  "yrs",
  "año",
  "años",
  "ano",
  "anos",
  "anio",
  "jahr",
  "année",
  "annee",
  "anno",
  "jaar",
  "år",
  "rok",
  "vuosi",
  "ejercicio",
  "exercice",
  "fy",
  "ay",
  "cy",
  "ly",
  "py",
  "yyyy",
  "y",
]);
const MONTH_WORDS = new Set([
  "month",
  "months",
  "mes",
  "mês",
  "meses",
  "monat",
  "mois",
  "mese",
  "maand",
  "mm",
  "mon",
  "mth",
  "period",
  "periodo",
  "período",
]);
const QUARTER_WORDS = new Set(["quarter", "qtr", "q", "trimestre", "quartal", "kwartaal"]);
/** Words that, beside `years`, make a name a count of years (`Years of Service`), not a year. */
const COUNT_WORDS = new Set(["of", "service", "experience", "at", "in", "since", "tenure", "old"]);

/**
 * What a name says it holds: a year, a key that joins a year with a month or a quarter
 * (`YearMonth`), a count of years, a month, or a quarter. Only a year makes a year operand.
 */
export type NameClass = "year" | "yearKey" | "yearCount" | "month" | "quarter";

/**
 * A name's words, lowercased: split at a lowercase letter followed by an uppercase one, at a
 * letter followed by a digit, and at every character that is neither a letter nor a digit.
 */
export function nameWords(name: string): string[] {
  return name
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== "")
    .map((w) => w.toLowerCase());
}

/** A name's class, as the research's `name_class` gives it (spec section 4.4). */
export function nameClass(name: string): NameClass | undefined {
  const words = nameWords(name);
  const low = name.toLowerCase();
  const squeezed = low.replace(/ /g, "");
  const year = words.some(
    (w) => YEAR_WORDS.has(w) || w.startsWith("year") || (w.endsWith("year") && w.length > 4),
  );
  const month = words.some((w) => MONTH_WORDS.has(w) || w.startsWith("month"));
  const quarter = words.some((w) => QUARTER_WORDS.has(w) || w.startsWith("quarter"));
  if (year && (month || quarter || squeezed.includes("yearmonth") || squeezed.includes("yearqtr")))
    return "yearKey";
  if (year && words.includes("years") && words.some((w) => COUNT_WORDS.has(w))) return "yearCount";
  if (year) return "year";
  if (
    low.includes("yyyymm") ||
    squeezed.includes("yearmonth") ||
    low.includes("periodkey") ||
    low.includes("monthkey")
  )
    return "yearKey";
  if (month) return "month";
  if (quarter) return "quarter";
  return undefined;
}
```

- [ ] **Step 4: Write the forms**

Create `packages/core/src/rules/pbiplint/period-forms.ts`:

```ts
import {
  daxVariables,
  isPunctuation,
  isWord,
  tokenizeDax,
  variableAt,
  type DaxToken,
  type DaxVariable,
} from "../../dax/tokenize.js";
import { nameClass } from "./period-words.js";

/**
 * A fixed period DAX writes: a year, or a day. `at` is where it is written, the offset into the
 * expression of the token a reader edits: a year's own number or string, the `DATE` of a
 * `DATE(` call, a date string, or a `dt"..."` literal.
 */
export interface Period {
  at: number;
  /** The year as the DAX writes it, which HARDCODED_PERIOD_IN_DAX looks for in the object's name. */
  year: number;
  /** For a day, the one DAX makes of it: a month or day past its end rolls over, as in DATE(2025, 13, 1). */
  date?: { year: number; month: number; day: number };
  /** For a date string whose day and month read either way, the string as written. */
  ambiguous?: string;
}

/** A run of tokens, from `from` up to, not including, `to`. */
interface Span {
  from: number;
  to: number;
}

/** The years the forms of spec sections 4.2 to 4.4 report: none outside it went stale in the research. */
const FIRST_YEAR = 1950;
const LAST_YEAR = 2049;
const COMPARISONS = new Set(["=", "==", "<>"]);
/** The research's aggregates and wrappers, whose year column or YEAR() makes a year operand. */
const WRAPPERS = new Set([
  "SELECTEDVALUE",
  "MAX",
  "MIN",
  "VALUES",
  "DISTINCT",
  "FIRSTNONBLANK",
  "LASTNONBLANK",
  "MAXX",
  "MINX",
  "LOOKUPVALUE",
  "RELATED",
  "CALCULATE",
  "HASONEVALUE",
  "SUM",
  "AVERAGE",
  "CONVERT",
  "INT",
  "VALUE",
  "FORMAT",
]);
/** The calls whose arguments are a date table's bounds, which the DATE() form leaves to 4.1. */
const BOUNDS = new Set(["CALENDAR", "GENERATESERIES"]);
/** The calls that read a date from one string argument. */
const STRING_DATES = new Set(["DATEVALUE", "DATETIMEVALUE", "VALUE"]);
const YEAR_FIRST = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:[ T]\d{1,2}:\d{2}.*)?$/;
const YEAR_LAST = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T]\d{1,2}:\d{2}.*)?$/;

const isWhole = (t: DaxToken | undefined): t is DaxToken =>
  t?.kind === "number" && /^\d+$/.test(t.text);

/** The year a token holds: four digits from 1950 to 2049, as a whole number or, where `strings`, a string. */
function yearIn(t: DaxToken | undefined, strings: boolean): number | undefined {
  const text =
    t?.kind === "number" ? t.text : strings && t?.kind === "string" ? t.text.trim() : undefined;
  if (text === undefined || !/^\d{4}$/.test(text)) return undefined;
  const year = Number(text);
  return year >= FIRST_YEAR && year <= LAST_YEAR ? year : undefined;
}

/** The arguments of the call or braces opening at `open`, split at the commas directly inside. */
function argumentsOf(tokens: readonly DaxToken[], open: number): Span[] {
  const end = tokens[open]?.close ?? tokens.length;
  const spans: Span[] = [];
  let from = open + 1;
  for (let k = open + 1; k < end; k++)
    if (tokens[k]!.parent === open && isPunctuation(tokens[k], ",")) {
      spans.push({ from, to: k });
      from = k + 1;
    }
  spans.push({ from, to: end });
  return spans;
}

/** The one token a span holds, if it holds exactly one. */
const only = (tokens: readonly DaxToken[], span: Span | undefined): DaxToken | undefined =>
  span && span.to - span.from === 1 ? tokens[span.from] : undefined;

/** Whether the call whose `(` is at `open` gives a year: YEAR(), or an aggregate or wrapper of one. */
function callGivesYear(tokens: readonly DaxToken[], open: number): boolean {
  const o = tokens[open]!;
  if (o.call === "YEAR") return true;
  if (o.call === undefined || !WRAPPERS.has(o.call) || o.close === undefined) return false;
  const inside = tokens.slice(open + 1, o.close);
  if (inside.some((x) => x.call === "YEAR")) return true;
  const named = inside.find((x) => x.kind === "column" && nameClass(x.text) !== undefined);
  if (named) return nameClass(named.text) === "year";
  return (
    o.call === "FORMAT" && inside.some((x) => x.kind === "string" && /^(?:yy|yyyy)$/i.test(x.text))
  );
}

/** Whether the operand that ends at token `k`, just before an operator, is a year operand. */
function yearBefore(tokens: readonly DaxToken[], k: number): boolean {
  const t = tokens[k];
  if (t === undefined) return false;
  if (t.kind === "column" || t.kind === "identifier") return nameClass(t.text) === "year";
  return isPunctuation(t, ")") && t.open !== undefined && callGivesYear(tokens, t.open);
}

/** Whether the operand that starts at token `k`, just after an operator, is a year operand. */
function yearAfter(tokens: readonly DaxToken[], k: number): boolean {
  const t = tokens[k];
  const next = tokens[k + 1];
  if ((t?.kind === "table" || t?.kind === "identifier") && next?.kind === "column")
    return nameClass(next.text) === "year";
  if (t?.kind === "column") return nameClass(t.text) === "year";
  if (t?.kind === "identifier" && isPunctuation(next, "(")) return callGivesYear(tokens, k + 1);
  return t?.kind === "identifier" && nameClass(t.text) === "year";
}

/** Whether the `DATE(` whose `(` is at `open` sits in a CALENDAR or GENERATESERIES argument, at any depth. */
function isBound(tokens: readonly DaxToken[], open: number): boolean {
  for (let p = tokens[open]!.parent; p !== undefined; p = tokens[p]!.parent)
    if (BOUNDS.has(tokens[p]!.call ?? "")) return true;
  return false;
}

/** Whether the `DATE(` at `open` is FORMAT's first argument, with a format that shows no year. */
function isYearFreeFormat(tokens: readonly DaxToken[], open: number): boolean {
  const date = tokens[open - 1]!;
  const p = date.parent;
  if (p === undefined || tokens[p]!.call !== "FORMAT" || date.arg !== 0) return false;
  const format = only(tokens, argumentsOf(tokens, p)[1]);
  return format?.kind === "string" && !/y/i.test(format.text);
}

/** Whether year, month, and day name a real day, with no rolling over. */
const isRealDay = (year: number, month: number, day: number): boolean =>
  month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The day DATE(year, month, day) gives: a month past 12, or a day past its month's end, rolls into the next, as Date.UTC rolls it. */
function daxDate(year: number, month: number, day: number): NonNullable<Period["date"]> {
  const d = new Date(Date.UTC(year, month - 1, day));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The day a date string names (spec section 4.1): year first with `-` or `/`, or year last with
 * the day and month in either order, each with an optional time. A year-last string whose day and
 * month read either way is ambiguous and kept as written.
 */
function dateString(t: DaxToken): Period | undefined {
  const text = t.text.trim();
  const first = YEAR_FIRST.exec(text);
  if (first) {
    const [year, month, day] = [Number(first[1]), Number(first[3]), Number(first[4])];
    return isRealDay(year, month, day) ? { at: t.start, year, date: { year, month, day } } : undefined;
  }
  const last = YEAR_LAST.exec(text);
  if (!last) return undefined;
  const [a, b, year] = [Number(last[1]), Number(last[2]), Number(last[3])];
  const monthFirst = isRealDay(year, a, b);
  const dayFirst = isRealDay(year, b, a);
  if (monthFirst && dayFirst && a !== b) return { at: t.start, year, ambiguous: text };
  if (monthFirst) return { at: t.start, year, date: { year, month: a, day: b } };
  if (dayFirst) return { at: t.start, year, date: { year, month: b, day: a } };
  return undefined;
}

/**
 * The fixed years and days in a measure's, a calculated column's, or a calculation item's DAX
 * (spec sections 4.2 to 4.4), in the order they are written, each place once.
 */
export function expressionPeriods(expression: string): Period[] {
  const tokens = tokenizeDax(expression);
  const found: Period[] = [];
  const year = (t: DaxToken, y: number): void => {
    found.push({ at: t.start, year: y });
  };
  tokens.forEach((t, k) => {
    // Compared: a year on one side of =, ==, or <>, a year operand on the other; not VAR's own =.
    if (t.kind === "operator" && COMPARISONS.has(t.text) && !isWord(tokens[k - 2], "VAR")) {
      const right = yearIn(tokens[k + 1], true);
      if (right !== undefined && yearBefore(tokens, k - 1)) year(tokens[k + 1]!, right);
      const left = yearIn(tokens[k - 1], true);
      if (left !== undefined && yearAfter(tokens, k + 1)) year(tokens[k - 1]!, left);
    }
    // Listed: each year in the braces after `<year operand> IN`.
    const list = tokens[k + 1];
    if (isWord(t, "IN") && isPunctuation(list, "{") && yearBefore(tokens, k - 1))
      for (const x of tokens.slice(k + 2, list!.close ?? tokens.length)) {
        const y = yearIn(x, true);
        if (y !== undefined) year(x, y);
      }
    // DATE() with a fixed year, outside a date table's bounds and a FORMAT that shows no year.
    if (t.call === "DATE" && !isBound(tokens, k) && !isYearFreeFormat(tokens, k)) {
      const [y, m, d] = argumentsOf(tokens, k).map((span) => only(tokens, span));
      const fixed = yearIn(y, false);
      if (fixed === undefined) return;
      if (isWhole(m) && isWhole(d))
        found.push({
          at: tokens[k - 1]!.start,
          year: fixed,
          date: daxDate(fixed, Number(m.text), Number(d.text)),
        });
      else year(y!, fixed);
    }
  });
  // Assigned: `VAR <year name> = <year>`, the year alone.
  for (const v of daxVariables(tokens)) {
    const y = yearIn(only(tokens, v), true);
    if (y !== undefined && nameClass(v.name) === "year") year(tokens[v.from]!, y);
  }
  const seen = new Set<number>();
  const periods: Period[] = [];
  for (const p of found.sort((a, b) => a.at - b.at))
    if (!seen.has(p.at)) {
      seen.add(p.at);
      periods.push(p);
    }
  return periods;
}

/** A whole number a DATE() argument gives: one number token, or one variable defined as one. */
function wholeNumber(
  tokens: readonly DaxToken[],
  vars: readonly DaxVariable[],
  span: Span,
): number | undefined {
  let t = only(tokens, span);
  if (t?.kind === "identifier") {
    const v = variableAt(vars, t.text, span.from);
    t = v ? only(tokens, v) : undefined;
  }
  return isWhole(t) ? Number(t.text) : undefined;
}

/**
 * The day a CALENDAR end fixes (spec section 4.1): DATE() of whole numbers or of variables holding
 * one, a `dt"..."` literal, DATEVALUE, DATETIMEVALUE, or VALUE of a date string, or a bare date
 * string, filling the whole argument, directly or through a variable. Anything else is not fixed.
 */
function fixedDay(
  tokens: readonly DaxToken[],
  vars: readonly DaxVariable[],
  span: Span,
  seen: Set<DaxVariable>,
): Period | undefined {
  const first = tokens[span.from];
  if (first === undefined || span.to <= span.from) return undefined;
  if (span.to - span.from === 1) {
    if (first.kind === "string") return dateString(first);
    if (first.kind === "date") {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(first.text.trim());
      if (!m) return undefined;
      const year = Number(m[1]);
      return { at: first.start, year, date: daxDate(year, Number(m[2]), Number(m[3])) };
    }
    if (first.kind !== "identifier") return undefined;
    const v = variableAt(vars, first.text, span.from);
    if (v === undefined || seen.has(v)) return undefined;
    seen.add(v);
    return fixedDay(tokens, vars, v, seen);
  }
  // A call filling the whole span.
  const open = span.from + 1;
  if (first.kind !== "identifier" || tokens[open]?.close !== span.to - 1) return undefined;
  const call = first.text.toUpperCase();
  const args = argumentsOf(tokens, open);
  if (call === "DATE" && args.length === 3) {
    const [y, m, d] = args.map((a) => wholeNumber(tokens, vars, a));
    if (y !== undefined && m !== undefined && d !== undefined)
      return { at: first.start, year: y, date: daxDate(y, m, d) };
  }
  const text = args.length === 1 ? only(tokens, args[0]) : undefined;
  if (STRING_DATES.has(call) && text?.kind === "string") return dateString(text);
  return undefined;
}

/** The fixed ends of the CALENDAR calls in a calculated table's DAX, in order, whatever their year. */
export function calendarEnds(expression: string): Period[] {
  const tokens = tokenizeDax(expression);
  const vars = daxVariables(tokens);
  const ends: Period[] = [];
  tokens.forEach((t, k) => {
    if (t.call !== "CALENDAR") return;
    const end = argumentsOf(tokens, k)[1];
    const day = end && fixedDay(tokens, vars, end, new Set());
    if (day) ends.push(day);
  });
  return ends;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/period-forms.test.ts`
Expected: PASS. Two cases to reason through if they fail, before touching the tests:
- `"'Date'[Year] = 2025.5"`: the number token is `2025.5`, which `yearIn` refuses (not four digits).
- `"CALENDAR(DATE(2020, 1, 1)"` (unclosed): `argumentsOf` runs to the end and finds one argument, so there is no end.

If a test's expectation is wrong against the spec, stop and report it rather than changing either.

- [ ] **Step 6: Lint, typecheck, check the browser bundle, and commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/period-words.ts packages/core/src/rules/pbiplint/period-forms.ts packages/core/test/period-forms.test.ts
npm run lint && npm run typecheck && npm run build -w @pbiplint/core && npm run check:browser
git add packages/core/src/rules/pbiplint/period-words.ts packages/core/src/rules/pbiplint/period-forms.ts packages/core/test/period-forms.test.ts
git commit -F - <<'EOF'
feat(core): find fixed years and days in DAX

The forms of HARDCODED_PERIOD_IN_DAX, on the new tokenizer: a year
compared, listed, or assigned beside a year column, YEAR(), an aggregate,
or a year-named variable, with multilingual year words; DATE() with a
fixed year outside date table bounds and year-free FORMAT; and a
CALENDAR end fixed through DATE(), a date string, DATEVALUE, or a typed
date, directly or through variables.

Part of #104.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 4: The rule

**Files:**
- Create: `packages/core/src/rules/pbiplint/periods.ts`
- Test: `packages/core/test/rules-native-periods.test.ts`

The rule is not registered in `pbiplintRules` yet (Task 5 does that with its page), so the suite stays green: its tests call the rule directly or pass it to `lint` through `options.rules`.

**Interfaces:**
- Consumes: `expressionPeriods`, `calendarEnds`, `Period` from `./period-forms.js` (Task 3); `TmdlNode.valueLine` (Task 1); `finding` from `../helpers.js`; `isAutoDateTable` from `../../model/names.js`; `pbiplintRule` from `./define.js`.
- Produces: `HARDCODED_PERIOD_IN_DAX: Rule`, `periodRules: Rule[]`, `namesYear(name: string, year: number): boolean`, `englishList(items: readonly string[]): string`, all exported from `packages/core/src/rules/pbiplint/periods.ts`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/rules-native-periods.test.ts`:

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { buildIndexes } from "../src/index/build.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { englishList, HARDCODED_PERIOD_IN_DAX, namesYear } from "../src/rules/pbiplint/periods.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { modelFrom, parseModelDir } from "./helpers.js";

const check = (model: Model) =>
  HARDCODED_PERIOD_IN_DAX.check({ model }, { indexes: buildIndexes({ model }), options: {} });
const run = (tmdl: string) =>
  check(modelFrom(tmdl)).map((f) => ({
    type: f.objectType,
    name: f.objectName,
    line: f.location?.line,
    detail: f.detail,
  }));
/** A Sales table, four lines long, before the lines given. */
const sales = (lines: string) =>
  `table Sales\n\tcolumn 'Order Date'\n\t\tdataType: dateTime\n\t\tsourceColumn: Order Date\n${lines}`;
/** A calculated table, its source on line 7. `name` is written as TMDL needs it. */
const dateTable = (name: string, source: string) =>
  `table ${name}\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tsourceColumn: [Date]\n\tpartition ${name} = calculated\n\t\tmode: import\n\t\tsource = ${source}\n`;

describe("HARDCODED_PERIOD_IN_DAX", () => {
  it("is pbiplint's own info rule on the model, with no skip for a partly read model", () => {
    expect(HARDCODED_PERIOD_IN_DAX).toMatchObject({
      id: "HARDCODED_PERIOD_IN_DAX",
      name: "Hardcoded period in DAX",
      category: "DAX Expressions",
      severity: 1,
      scope: ["Measure", "CalculatedColumn", "CalculationItem", "CalculatedTable"],
      layer: "model",
      needs: ["model"],
      status: "builtin",
    });
    expect(HARDCODED_PERIOD_IN_DAX.skipWhenModelUnread).toBeUndefined();
    expect(HARDCODED_PERIOD_IN_DAX.options).toBeUndefined();
  });

  it("reports a measure, a calculated column, and a calculation item once each, at the period's line", () => {
    const tmdl =
      sales(
        "\tmeasure 'Current Sales' = CALCULATE([Total], 'Sales'[Year] = 2025, 'Sales'[Year] <> 2024)\n" +
          "\tcolumn 'Is Recent' = YEAR('Sales'[Order Date]) IN {2024, 2025}\n\t\tdataType: boolean\n",
      ) +
      "table 'Time Calc'\n\tcalculationGroup\n\t\tcalculationItem 'This Year' = CALCULATE(SELECTEDMEASURE(), 'Date'[Year] = 2025)\n\tcolumn Name\n\t\tdataType: string\n";
    expect(run(tmdl)).toEqual([
      { type: "Measure", name: "[Current Sales]", line: 5, detail: "fixed years 2025 and 2024" },
      {
        type: "CalculatedColumn",
        name: "'Sales'[Is Recent]",
        line: 6,
        detail: "fixed years 2024 and 2025",
      },
      {
        type: "CalculationItem",
        name: "This Year",
        line: 10,
        detail: "fixed year 2025 in calculation group 'Time Calc'",
      },
    ]);
  });

  it("points at the line of the first period in a block, a fence, and a part of a split table", () => {
    const block = sales(
      "\tmeasure Stale =\n\t\t\tVAR x = [Total]\n\t\t\tRETURN\n\t\t\t\tCALCULATE(x, 'Sales'[Year] = 2025)\n",
    );
    expect(run(block).map((f) => f.line)).toEqual([8]);
    const fenced = sales(
      "\tmeasure Stale = ```\n\t\t\tCALCULATE([Total],\n\t\t\t\t'Sales'[Year] = 2025)\n\t\t\t```\n",
    );
    expect(run(fenced).map((f) => f.line)).toEqual([7]);
    const split = buildModel([
      parseTmdl("tables/Sales.tmdl", sales("\tmeasure Total = SUM('Sales'[Amount])\n")),
      parseTmdl(
        "tables/Sales more.tmdl",
        "table Sales\n\n\tmeasure Stale = CALCULATE([Total], 'Sales'[Year] = 2025)\n",
      ),
    ]);
    expect(check(split).map((f) => f.location)).toEqual([
      { file: "tables/Sales more.tmdl", line: 3 },
    ]);
  });

  it("names years, days, or both in the detail", () => {
    const details = run(
      sales(
        "\tmeasure A = CALCULATE([Total], 'Sales'[Order Date] >= DATE(2024, 1, 1), 'Sales'[Order Date] <= DATE(2024, 12, 31))\n" +
          "\tmeasure B = CALCULATE([Total], 'Sales'[Year] = 2025, 'Sales'[Order Date] <= DATE(2024, 12, 31))\n" +
          "\tmeasure C = CALCULATE([Total], 'Sales'[Year] IN {2020, 2021, 2022, 2023, 2024, 2025})\n" +
          "\tmeasure D = IF('Sales'[Year] = 2025, 1, IF(YEAR(MAX('Sales'[Order Date])) = 2025, 2))\n",
      ),
    ).map((f) => f.detail);
    expect(details).toEqual([
      "fixed dates January 1, 2024 and December 31, 2024",
      "fixed periods 2025 and December 31, 2024",
      "fixed years 2020, 2021, 2022, and 3 more",
      "fixed year 2025",
    ]);
  });

  it("leaves alone an object whose name carries one of its years, in four digits or two", () => {
    const names = run(
      sales(
        "\tmeasure 'Total Sales 2026' = CALCULATE([Total], YEAR('Sales'[Order Date]) = 2026)\n" +
          "\tmeasure 'Growth from 19/20' = CALCULATE([Total], 'Sales'[Year] = 2019)\n" +
          "\tmeasure 'Top 10 Sales' = CALCULATE([Total], 'Sales'[Year] = 2025)\n",
      ),
    ).map((f) => f.name);
    expect(names).toEqual(["[Top 10 Sales]"]);
  });

  it("does not read a format string expression", () => {
    const tmdl = sales(
      `\tmeasure Total = SUM('Sales'[Amount])\n\t\tformatStringDefinition = IF('Sales'[Year] = 2025, "0", "0.0")\n`,
    );
    expect(run(tmdl)).toEqual([]);
  });

  it("reports a date table whose CALENDAR ends on a fixed date, at the line where the day is written", () => {
    expect(run(dateTable("Date", "CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31))"))).toEqual([
      {
        type: "CalculatedTable",
        name: "'Date'",
        line: 7,
        detail: "ends on a fixed date, December 31, 2026",
      },
    ]);
    const viaVariable =
      "\n\t\t\t\tVAR StartDate = DATE(2020, 1, 1)\n\t\t\t\tVAR EndDate = DATE(2025, 12, 31)\n\t\t\t\tRETURN CALENDAR(StartDate, EndDate)";
    expect(run(dateTable("Date", viaVariable)).map((f) => [f.line, f.detail])).toEqual([
      [9, "ends on a fixed date, December 31, 2025"],
    ]);
    expect(run(dateTable("Date", `CALENDAR("2020-01-01", "01/02/2026")`))[0]!.detail).toBe(
      `ends on a fixed date, "01/02/2026"`,
    );
    const two =
      "UNION(CALENDAR(DATE(2020, 1, 1), DATE(2025, 12, 31)), CALENDAR(DATE(2026, 1, 1), DATE(2026, 12, 31)))";
    expect(run(dateTable("Date", two))[0]!.detail).toBe(
      "ends on fixed dates December 31, 2025 and December 31, 2026",
    );
  });

  it("leaves alone a dynamic end, Desktop's auto date tables, a table named for its end, and other calculated tables", () => {
    const fixed = "CALENDAR(DATE(2015, 1, 1), DATE(2015, 1, 1))";
    for (const tmdl of [
      dateTable("Date", "CALENDAR(DATE(2020, 1, 1), MAX('Sales'[Order Date]))"),
      dateTable("DateTableTemplate_96ead6f8", fixed),
      dateTable("LocalDateTable_ef30d063", fixed),
      dateTable("'Calendar 2026'", "CALENDAR(DATE(2026, 1, 1), DATE(2026, 12, 31))"),
      dateTable("Recent", "FILTER('Sales', YEAR('Sales'[Order Date]) = 2025)"),
      dateTable("Days", `DATATABLE("Day", DATETIME, {{DATE(2025, 1, 1)}})`),
    ])
      expect(run(tmdl), tmdl).toEqual([]);
  });

  it("stays silent on an object that ignores it", () => {
    const text = sales(
      "\tmeasure Stale = CALCULATE([Total], 'Sales'[Year] = 2025)\n\t\tannotation pbiplint.ignore = HARDCODED_PERIOD_IN_DAX\n",
    );
    const ids = (t: string) =>
      lint([{ path: "definition/tables/Sales.tmdl", text: t }], {
        rules: [HARDCODED_PERIOD_IN_DAX],
      }).findings.map((f) => f.ruleId);
    expect(ids(text)).toEqual([]);
    expect(ids(text.replace(/\t\tannotation .*\n/, ""))).toEqual(["HARDCODED_PERIOD_IN_DAX"]);
  });

  it("finds nothing in the sample's and the fixtures' models", () => {
    const root = new URL("../../../", import.meta.url).pathname;
    const modelDirs = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .flatMap((e) =>
          e.name.endsWith(".SemanticModel") ? [join(dir, e.name)] : modelDirs(join(dir, e.name)),
        );
    const dirs = [...modelDirs(join(root, "tests/fixtures")), ...modelDirs(join(root, "examples"))];
    expect(dirs.length).toBeGreaterThan(5);
    for (const dir of dirs) expect(check(buildModel(parseModelDir(dir))), dir).toEqual([]);
  });
});

describe("namesYear", () => {
  it("reads a year in a name as its four digits, or its last two with no digit beside them", () => {
    expect(namesYear("Values2025", 2025)).toBe(true);
    expect(namesYear("discharged_on_or_after_01042022", 2022)).toBe(true);
    expect(namesYear("Average Daily Calls Jan-24 to Dec-24", 2024)).toBe(true);
    expect(namesYear("% Frail 2021/22", 2022)).toBe(true);
    expect(namesYear("24", 2024)).toBe(true);
    expect(namesYear("Top 125 Sales", 2025)).toBe(false);
    expect(namesYear("Sales 2024", 2025)).toBe(false);
    expect(namesYear("Anything", 50)).toBe(false);
  });
});

describe("englishList", () => {
  it("lists as English does, with semicolons between items that hold commas, and names three at most", () => {
    expect(englishList(["2025"])).toBe("2025");
    expect(englishList(["2024", "2025"])).toBe("2024 and 2025");
    expect(englishList(["2024", "2025", "2026"])).toBe("2024, 2025, and 2026");
    expect(englishList(["January 1, 2024", "June 30, 2024", "December 31, 2024"])).toBe(
      "January 1, 2024; June 30, 2024; and December 31, 2024",
    );
    expect(englishList(["2020", "2021", "2022", "2023", "2024", "2025"])).toBe(
      "2020, 2021, 2022, and 3 more",
    );
  });
});
```

Lines in the block test: 1 `table Sales`, 2 to 4 the column, 5 `measure Stale =`, 6 `VAR`, 7 `RETURN`, 8 the `CALCULATE` holding 2025. In the variable test: 7 `source =`, 8 `VAR StartDate`, 9 `VAR EndDate = DATE(2025, 12, 31)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/test/rules-native-periods.test.ts`
Expected: FAIL, the module `../src/rules/pbiplint/periods.js` does not exist.

- [ ] **Step 3: Write the rule**

Create `packages/core/src/rules/pbiplint/periods.ts`:

```ts
import { isAutoDateTable } from "../../model/names.js";
import type { Model, SourceLocation, Table } from "../../model/types.js";
import type { TmdlNode } from "../../tmdl/types.js";
import { finding } from "../helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";
import { calendarEnds, expressionPeriods, type Period } from "./period-forms.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A period found in an object's DAX, with the node whose value holds that DAX. */
interface Found {
  period: Period;
  node: TmdlNode | undefined;
}

/** How a detail names a period: a year as `2025`, a day in long form, an ambiguous string as written. */
const shown = (p: Period): string =>
  p.ambiguous !== undefined
    ? `"${p.ambiguous}"`
    : p.date
      ? `${MONTHS[p.date.month - 1]} ${p.date.day}, ${p.date.year}`
      : String(p.year);

/**
 * A list as English writes one: `a and b`, or `a, b, and c`, with semicolons in place of commas
 * when an item holds a comma, as a long-form date does. At most three are named; the rest are
 * counted, as `and 3 more`.
 */
export function englishList(items: readonly string[]): string {
  const named = items.length > 3 ? [...items.slice(0, 3), `${items.length - 3} more`] : [...items];
  if (named.length <= 2) return named.join(" and ");
  const sep = named.some((s) => s.includes(",")) ? "; " : ", ";
  return `${named.slice(0, -1).join(sep)}${sep}and ${named.at(-1)}`;
}

/**
 * Whether a name carries a year (spec section 4.5): its four digits anywhere (`Values2025`), or
 * its last two with no digit on either side (`Jan-24`, `19/20`). An object so named is almost
 * always meant to fix that year; all 87 in the research were.
 */
export function namesYear(name: string, year: number): boolean {
  const digits = String(year);
  if (digits.length !== 4) return false;
  return name.includes(digits) || new RegExp(`(?:^|\\D)${digits.slice(2)}(?:\\D|$)`).test(name);
}

/** The file and line of `offset` into a node's value: its first line, plus the line breaks before the offset. */
function lineAt(node: TmdlNode | undefined, offset: number): SourceLocation | undefined {
  if (node?.valueLine === undefined || node.value === undefined) return undefined;
  let line = node.valueLine;
  for (let k = 0; k < offset && k < node.value.length; k++) if (node.value[k] === "\n") line++;
  return { file: node.file, line };
}

/** A measure's, a column's, or a calculation item's detail: what it fixes, years, days, or both. */
function fixesDetail(periods: readonly Period[]): string {
  const names = [...new Set(periods.map(shown))];
  const days = periods.filter((p) => p.date !== undefined || p.ambiguous !== undefined).length;
  const noun = days === 0 ? "year" : days === periods.length ? "date" : "period";
  return `fixed ${noun}${names.length > 1 ? "s" : ""} ${englishList(names)}`;
}

/** A date table's detail: the day, or days, its CALENDAR calls end on. */
function endsDetail(periods: readonly Period[]): string {
  const names = [...new Set(periods.map(shown))];
  return names.length === 1
    ? `ends on a fixed date, ${names[0]}`
    : `ends on fixed dates ${englishList(names)}`;
}

/**
 * One finding for an object whose DAX fixes the periods found, at the line of the first, unless
 * its name carries one of their years. A finding that already names its context, as a
 * calculation item's names its group, keeps it after the rule's own words.
 */
function fixedFinding(
  base: RuleFinding,
  name: string,
  found: readonly Found[],
  detail: (periods: readonly Period[]) => string,
): RuleFinding[] {
  const periods = found.map((f) => f.period);
  if (periods.length === 0 || periods.some((p) => namesYear(name, p.year))) return [];
  const where = lineAt(found[0]!.node, found[0]!.period.at);
  const own = detail(periods);
  return [
    {
      ...base,
      ...(where ? { location: where } : {}),
      detail: base.detail === undefined ? own : `${own} in ${base.detail}`,
    },
  ];
}

/** The periods in an expression, each with the node whose value it is. */
const inNode = (node: TmdlNode | undefined, expression: string): Found[] =>
  expressionPeriods(expression).map((period) => ({ period, node }));

/**
 * A calculated table's fixed CALENDAR ends, from each calculated partition's `source`. Desktop's
 * auto date/time tables are left out: their template ends on a fixed day by design, and
 * REMOVE_AUTO-DATE_TABLE reports them.
 */
function dateTableEnds(t: Table): Found[] {
  if (t.kind !== "calculated" || isAutoDateTable(t)) return [];
  return t.partitions
    .filter((p) => p.sourceType === "calculated")
    .flatMap((p) => {
      const node = p.node?.children.find((c) => c.kind === "expr" && c.type === "source");
      return calendarEnds(p.source ?? "").map((period) => ({ period, node }));
    });
}

function periodFindings(model: Model): RuleFinding[] {
  const out: RuleFinding[] = [];
  for (const t of model.tables) {
    out.push(...fixedFinding(finding.table(t), t.name, dateTableEnds(t), endsDetail));
    for (const x of t.measures)
      out.push(...fixedFinding(finding.measure(x), x.name, inNode(x.node, x.expression), fixesDetail));
    for (const c of t.columns)
      if (c.kind === "calculated")
        out.push(
          ...fixedFinding(finding.column(c), c.name, inNode(c.node, c.expression ?? ""), fixesDetail),
        );
    for (const i of t.calculationGroup?.items ?? [])
      out.push(
        ...fixedFinding(finding.calculationItem(i), i.name, inNode(i.node, i.expression), fixesDetail),
      );
  }
  return out;
}

export const HARDCODED_PERIOD_IN_DAX = pbiplintRule({
  id: "HARDCODED_PERIOD_IN_DAX",
  name: "Hardcoded period in DAX",
  category: "DAX Expressions",
  severity: 1,
  scope: ["Measure", "CalculatedColumn", "CalculationItem", "CalculatedTable"],
  layer: "model",
  // No skipWhenModelUnread: each finding rests on the object's own expression, so a file the
  // parser could not read can hide an object from the rule, never put a period in one.
  check: ({ model }) => (model ? periodFindings(model) : []),
});

export const periodRules = [HARDCODED_PERIOD_IN_DAX];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/rules-native-periods.test.ts packages/core/test/period-forms.test.ts packages/core/test/dax-tokenize.test.ts`
Expected: PASS. If "finds nothing in the sample's and the fixtures' models" fails, do not change the rule to silence it: report the object, the DAX, and why it fired, since the spec expects every fixture to be silent.

- [ ] **Step 5: Lint, typecheck, check the browser bundle, and commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/periods.ts packages/core/test/rules-native-periods.test.ts
npm run lint && npm run typecheck && npm run build -w @pbiplint/core && npm run check:browser
npm test
git add packages/core/src/rules/pbiplint/periods.ts packages/core/test/rules-native-periods.test.ts
git commit -F - <<'EOF'
feat(core): HARDCODED_PERIOD_IN_DAX

One info finding per measure, calculated column, calculation item, or
date table whose DAX fixes a period, at the line where the first is
written, with a detail that names what it fixes. An object named for its
period is left alone, as are Desktop's auto date/time tables. Not yet in
the default rule set; its page comes next.

Part of #104.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

`npm test` must pass in full here, since the rule is not registered yet.

---

### Task 5: Register the rule, write its page, and move the pins

**Files:**
- Modify: `packages/core/src/rules/pbiplint/index.ts` (import `periodRules`, list it after `measureRules`, and update the doc comment's order)
- Create: `rules/hardcoded-period-in-dax.md`
- Regenerate: `packages/core/src/rules/rule-summaries.data.ts`, `packages/cli/src/rule-help.data.ts` (by `scripts/sync-rule-pages.mjs`, never by hand)
- Modify: `packages/core/test/pack.test.ts:26` (99 to 100)
- Modify: `packages/web/test/generate.test.ts:620,621,636,641,646,661` (99 to 100; the index sentence's "17 built into pbiplint" to "18 built into pbiplint")
- Modify: `packages/core/test/report-parity.test.ts` (the sample check, around lines 153 to 164)
- Modify: `CONTRIBUTING.md` (step 3 of "Adding a report rule", line 39)

**Interfaces:**
- Consumes: `periodRules` from `./periods.js` (Task 4).

- [ ] **Step 1: Register the rule**

In `packages/core/src/rules/pbiplint/index.ts`, add `import { periodRules } from "./periods.js";` in alphabetical order among the imports, change the doc comment to `pbiplint's own rules, in the spec's order: references, opening, visuals, pages, measures, periods in DAX, actions and bookmarks, tab order.`, and insert `...periodRules,` after `...measureRules,`.

- [ ] **Step 2: See what the registration breaks**

Run: `npm test 2>&1 | tail -60`
Expected failures, and only these: `rule-pages.test.ts` for HARDCODED_PERIOD_IN_DAX (no page), `pack.test.ts` (100 rules), and, in `report-parity.test.ts`, "fires every native rule and every ported report rule" (the sample has no fixed period). Anything else failing is a surprise: stop and report it.

- [ ] **Step 3: Narrow the sample check to the rules the sample plants**

In `packages/core/test/report-parity.test.ts`, replace the comment and test of `describe("the sample", ...)` with:

```ts
/**
 * The sample plants every report rule (spec section 11), so each native rule outside the model
 * layer and each ported report rule has a non-empty list in its expectation: the native map for a
 * native rule, the oracle's ids for a ported one, or `ours` for a deviating one. The checks above
 * hold the run to those lists. A native model rule (HARDCODED_PERIOD_IN_DAX) is not planted: its
 * own tests pin it, and the quiet check above still holds it to every fixture's native map.
 */
describe("the sample", () => {
  const sample = expectations.find((exp) => exp.name === "messy-sales");
  it("fires every native rule outside the model layer and every ported report rule", () => {
    expect(sample, "tests/expectations/messy-sales.report.json").toBeDefined();
    for (const r of native.filter((r) => r.layer !== "model"))
      expect(sample!.native[r.id]?.length, r.id).toBeGreaterThan(0);
    for (const r of ported) expect(expectedIds(sample!, r.id).length, r.id).toBeGreaterThan(0);
  });
});
```

In `CONTRIBUTING.md` line 39, after the sentence ending "so a new one is planted in `examples/messy-sales` too.", add: ` A native model rule is not planted: its unit tests pin it, and the quiet check still holds it silent on every project fixture unless the fixture's \`native\` map lists its findings.`

In `packages/core/test/pack.test.ts`, change `toBe(99)` to `toBe(100)`.

- [ ] **Step 4: Write the rule page**

Create `rules/hardcoded-period-in-dax.md` with the content below. Before committing, open every link (WebFetch) and confirm three things. First, each URL resolves; the anchor `#generate-with-dax` on the date tables guidance must exist. Second, the page still says what the sentences citing it claim:
- CALENDAR's end is any expression that returns a date.
- The date tables guidance says the date column must span full years and suggests `MIN`/`MAX` of a column as CALENDAR's bounds.
- Creating a numeric range parameter creates a measure for its value.
- A calculation item is edited in Model view in the DAX formula bar.

Third, a row whose date is not in the date table is grouped under a blank value in visuals that group by the date table. If a claim does not hold, rewrite the sentence to what the page does say, with its link, and note the change in your report.

````markdown
---
id: HARDCODED_PERIOD_IN_DAX
name: "Hardcoded period in DAX"
category: DAX Expressions
severity: info
scope: [Measure, CalculatedColumn, CalculationItem, CalculatedTable]
status: builtin
layer: model
video:
sources:
---

# Hardcoded period in DAX

## What it checks

Measures, calculated columns, and calculation items whose DAX fixes a year or a date, and date tables whose CALENDAR ends on a fixed date.

Each finding names the object, as `[Current Year Sales]`, `'Sales'[Is Recent]` for a calculated column, or `'Date'` for a date table, at the line where the first fixed period is written rather than the line where the object starts. Its detail says what the object fixes, as `fixed year 2025` or `fixed dates January 1, 2024 and December 31, 2024`, or, for a date table, `ends on a fixed date, December 31, 2026`.

The rule reads three forms:

- A year from 1950 to 2049, as a number or a string of four digits, compared with `=`, `==`, or `<>`, or listed after `IN`, beside something that holds a year: a column or a variable with a year's name (`'Date'[Year]`, `'Date'[Año]`, `SelectedYear`), a call to `YEAR()`, or an aggregate of either (`SELECTEDVALUE('Date'[Year])`). A variable with a year's name set to a year alone counts too, as `VAR SelectedYear = 2025`.
- `DATE()` with a year from 1950 to 2049 as a number, such as `DATE(2024, 12, 31)` or `DATE(2024, 'Date'[Month], 1)`.
- The end of a `CALENDAR` call in a calculated table, when it is a fixed date however it is written: `DATE()` of whole numbers or of variables holding them, a date string, `DATEVALUE("...")`, or `dt"2026-12-31"`, directly or through a variable. The start is never read, since a date table that starts on a fixed date is normal.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column 'Order Date'
		dataType: dateTime
		sourceColumn: Order Date
	measure 'Current Year Sales' = CALCULATE(SUM(Sales[Amount]), YEAR(Sales[Order Date]) = 2025)
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column 'Order Date'
		dataType: dateTime
		sourceColumn: Order Date
	measure 'Current Year Sales' = CALCULATE(SUM(Sales[Amount]), YEAR(Sales[Order Date]) = YEAR(TODAY()))
		formatString: #,0
```

## Why it matters

A year typed into DAX is right for the year it was written in and quietly wrong after it. A measure named Current Year Sales that filters on 2025 still shows 2025's sales all through 2026, under the same name, with no error, and a reader has no way to tell.

A date table built with `CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31))` has no rows after December 31, 2026. From January 1, 2027, new rows in a table related to it find no date there: a visual that groups by the date table's columns shows them under a blank value, a filter or slicer on it leaves them out, and time intelligence stops at the table's last day. [Microsoft's guidance on date tables](https://learn.microsoft.com/power-bi/guidance/model-date-tables#generate-with-dax) suggests building CALENDAR's bounds from the data, such as `MAX(Sales[OrderDate])`, so that the table follows the data.

## How to fix it

Take the period from something that moves with time.

- For the current period, use `TODAY()`: `YEAR(TODAY())` for this year, as the fixed example does, or `TODAY()` itself for an as-of date.
- For the latest period in the data, which stays right when a refresh runs late, take it from the fact table: `YEAR(MAX('Sales'[Order Date]))`. Inside a measure, MAX reads only the dates the visual's filters leave, so write `CALCULATE(MAX('Sales'[Order Date]), REMOVEFILTERS())` when the measure needs the latest date in all the data.
- When a report reader should choose the period, add a parameter: on the Modeling tab select New parameter, then Numeric range, with the years it offers. Power BI Desktop creates the parameter and a measure that returns the selected value ([what-if parameters](https://learn.microsoft.com/power-bi/transform-model/desktop-what-if#create-a-parameter)), and your measure compares with that measure instead of a number.

For a date table, end CALENDAR on the data rather than on a day:

```
Date = CALENDAR ( DATE ( 2020, 1, 1 ), DATE ( YEAR ( MAX ( Sales[Order Date] ) ), 12, 31 ) )
```

This ends on the last day of the latest year in Sales, so the table spans full years, as [Microsoft's guidance](https://learn.microsoft.com/power-bi/guidance/model-date-tables) asks of a date table, and grows when a refresh brings a new year. [CALENDARAUTO](https://learn.microsoft.com/dax/calendarauto-function-dax) does the same from every date column in the model.

In Power BI Desktop, select a measure, calculated column, or calculated table in the Data pane and edit its DAX in the formula bar. A calculation item is edited in Model view: select it under its calculation group on the Model tab of the Data pane, and its DAX opens in the same formula bar ([calculation groups](https://learn.microsoft.com/power-bi/transform-model/calculation-groups)). In TMDL, edit the expression after the object's `=`, or, for a date table, the `source` of its `calculated` partition.

## When to ignore it

A fixed period is sometimes the point: a baseline year a measure compares against, a known event such as a change of data source or a day of bad data, a cohort such as customers whose first purchase was in 2023, a rule that changed in a given year, or sample data that never changes. A date table can end on purpose too, such as one that must stop at a contract's last day.

Often the better move is a name that says so. An object whose name carries its year, such as `Sales 2024` or `Growth from 19/20`, reads as deliberate to anyone who opens the model, and the rule leaves it alone.

## Quirks

- An object whose name carries one of the years it fixes, as four digits (`Sales 2024`) or as the year's last two digits with no digit beside them (`Jan-24`, `19/20`), is left out, since such an object is almost always meant to fix its year. Two digits can match by chance, as `Top 20` beside a fixed 2020 does, which hides that one object.
- A date string at a date table's end whose day and month read either way, such as `"01/02/2026"`, is quoted as written: DAX reads it by the model's culture, which pbiplint does not settle.
- A year outside 1950 to 2049 is left alone, such as `DATE(9999, 12, 31)` as an open end or `DATE(1900, 1, 1)` as a default, but a date table's end is reported whatever its year.
- Forms that were mostly deliberate, or never went stale, in real models are left out: a year compared with `<`, `<=`, `>`, or `>=` (usually a cut-off or a cohort), year arithmetic such as `[Year] - 2025`, fiscal-year labels such as `"2024/25"`, year-month keys such as `202306`, date strings outside a date table's end, and the DAX of other calculated tables, user-defined functions, row-level security filters, and format string expressions. So is a date table end reached through a measure or written with arithmetic, such as `DATE(2026, 12, 31) + 1`.
- A month or a quarter compared with a number, a year-end date such as `"6/30"` given to DATESYTD, and a `DATE()` inside FORMAT with a format that shows no year, as `FORMAT(DATE(2000, [Month], 1), "mmmm")` for a month's name, never fire: none of them goes stale.
- Year names are read in several languages (year, año, anio, jahr, année, anno, jaar, år, and more), whatever the model's culture.
- Desktop's own auto date/time tables are left alone, since Desktop builds them itself.

## Related rules

- `MODEL_SHOULD_HAVE_A_DATE_TABLE` reports a model with no date table; one built with CALENDAR counts, and this rule checks where it ends.
- `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` asks that a date table be marked as one.
- `REMOVE_AUTO-DATE_TABLE` reports Desktop's auto date/time tables, which this rule leaves alone.

## Links

- [CALENDAR function (DAX), whose end date is any expression that returns a date](https://learn.microsoft.com/dax/calendar-function-dax)
- [CALENDARAUTO function (DAX)](https://learn.microsoft.com/dax/calendarauto-function-dax)
- [DATE function (DAX)](https://learn.microsoft.com/dax/date-function-dax)
- [TODAY function (DAX)](https://learn.microsoft.com/dax/today-function-dax)
- [Design guidance for date tables in Power BI Desktop, including generating one with DAX](https://learn.microsoft.com/power-bi/guidance/model-date-tables#generate-with-dax)
- [Use parameters to visualize variables, the numeric range parameter](https://learn.microsoft.com/power-bi/transform-model/desktop-what-if)
- [Create calculation groups in Power BI, including editing a calculation item](https://learn.microsoft.com/power-bi/transform-model/calculation-groups)
````

- [ ] **Step 5: Regenerate the data files from the page**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
git diff --stat packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
```

Expected: both files change, each by the new rule's entry only.

- [ ] **Step 6: Move the site's pins**

In `packages/web/test/generate.test.ts`, lines 620, 621, 641, 646: `99` to `100`; line 661: `3 + 99` to `3 + 100`; line 636: `"99 rules: 66 model rules ... and 17 built into pbiplint."` to `"100 rules: 66 model rules ported from Microsoft's Best Practice Analyzer ruleset so the results match Tabular Editor, 5 listed but not run because they need statistics only a live model has, 11 report rules ported from PBI Inspector's base rules by Nat Van Gulck, and 18 built into pbiplint."`. Do not touch the synthetic sentences at lines 725, 758, 849, and 858, which count rule sets the test builds itself.

- [ ] **Step 7: Run everything**

```bash
npx prettier --write rules/hardcoded-period-in-dax.md packages/core/src/rules/pbiplint/index.ts packages/core/test/report-parity.test.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts CONTRIBUTING.md
npm run lint && npm run typecheck && npm run build && npm run check:browser && npm test
```

Expected: PASS in full. If `rule-pages.test.ts` fails on the Example, the fires snippet must produce a finding and no parse issue, and the fixed one neither. If it fails on the description, rerun Step 5.

Then confirm the sample gains nothing and the CLI prints the rule:

```bash
node packages/cli/dist/index.js examples/messy-sales --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.findings.length, r.findings.filter(f=>f.ruleId==="HARDCODED_PERIOD_IN_DAX").length)})'
```

Expected: `256 0` (the sample's count before this branch, per the #84 close-out on September 29, 2026). If the CLI's entry point or JSON shape differs, find the real ones in `packages/cli/package.json` (`bin`) and report the numbers; the second must be 0.

- [ ] **Step 8: Commit**

```bash
git add rules/hardcoded-period-in-dax.md packages/core/src/rules/pbiplint/index.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/core/test/report-parity.test.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts CONTRIBUTING.md
git commit -F - <<'EOF'
feat: HARDCODED_PERIOD_IN_DAX in the default rule set, with its page

The rule joins pbiplint's own rules after the measure rules, with a page
that shows a Current Year Sales measure fixed on 2025 and fixed with
TODAY(), explains why a fixed year and a date table's fixed end go stale,
and gives the fixes in Power BI Desktop. The sample check in the report
parity test now asks the sample to plant only the native rules outside
the model layer, as its comment always said; the quiet check still holds
the new rule to every fixture. 100 rules, 18 built in.

Part of #104.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 6: The corpus check (scratch work, nothing committed)

Spec section 10. Everything here lives in the session scratchpad, `/private/tmp/claude-501/-Users-michaelmckinley-Projects-pbiplint/46f2480b-def4-4ddf-b00b-a29c696f8248/scratchpad/corpus104/`. Read the corpus and the research outputs only; write nothing under `~/Downloads/pbip-lint-spike/`.

**Files:**
- Create (scratch): `corpus104/models.py`, `corpus104/lint.mjs`, `corpus104/compare.py`, `corpus104/report.md`

**Interfaces:**
- Consumes: the built core (`packages/core/dist/index.js`: `parseTmdl`, `buildModel`, `buildIndexes`, `pbiplintRules`), and from `~/Downloads/pbip-lint-spike/research-104/`: `groups.py` (`repos()`, `models(repo)`, `model_group_ex(repo, model_dir)`, `CORPUS`), `findings.jsonl`, `review.txt`, `labels.tsv`.

- [ ] **Step 1: List the models with their groups**

`corpus104/models.py`:

```python
"""Print one JSON line per model: repo, model (relative to the repo), group, and its folder."""
import json, os, sys
R = os.path.expanduser("~/Downloads/pbip-lint-spike/research-104")
sys.path.insert(0, R)
import groups as g

for repo in g.repos():
    for model in g.models(repo):
        print(json.dumps({
            "repo": repo,
            "model": os.path.relpath(model, os.path.join(g.CORPUS, repo)),
            "group": g.model_group_ex(repo, model),
            "dir": model,
        }, ensure_ascii=False))
```

Run: `python3 corpus104/models.py > corpus104/models.jsonl && wc -l corpus104/models.jsonl` (from the scratchpad). Expected: 970 desktop, 45 agent, and 302 tool lines (`grep -c '"group": "desktop"'` and so on). Report the counts if they differ.

- [ ] **Step 2: Run the rule over every model**

`corpus104/lint.mjs`:

```js
// Run HARDCODED_PERIOD_IN_DAX over each model in models.jsonl; print one JSON line per finding,
// and one per model that threw.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
const core = await import(process.argv[2] + "/packages/core/dist/index.js");
const rule = core.pbiplintRules.find((r) => r.id === "HARDCODED_PERIOD_IN_DAX");
const tmdlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tmdlFiles(join(dir, e.name)) : e.name.endsWith(".tmdl") ? [join(dir, e.name)] : [],
  );
for (const line of readFileSync(new URL("./models.jsonl", import.meta.url), "utf8").split("\n")) {
  if (!line) continue;
  const m = JSON.parse(line);
  try {
    const files = tmdlFiles(m.dir).map((p) => core.parseTmdl(relative(m.dir, p), readFileSync(p, "utf8")));
    const model = core.buildModel(files);
    for (const f of rule.check({ model }, { indexes: core.buildIndexes({ model }), options: {} }))
      console.log(JSON.stringify({
        repo: m.repo, model: m.model, group: m.group, type: f.objectType, name: f.objectName,
        table: f.object?.table?.name ?? (f.objectType === "CalculatedTable" ? f.object?.name : undefined),
        file: f.location?.file, line: f.location?.line, detail: f.detail,
      }));
  } catch (e) {
    console.log(JSON.stringify({ repo: m.repo, model: m.model, group: m.group, error: String(e?.stack ?? e) }));
  }
}
```

Run: `node corpus104/lint.mjs ~/Projects/pbiplint > corpus104/ours.jsonl` after `npm run build -w @pbiplint/core`. Expected: no line with `"error"`. A model that throws is a bug to report, whatever its group.

- [ ] **Step 3: Rebuild the prototype's side and compare**

`corpus104/compare.py` rebuilds, from `findings.jsonl`, the Desktop occurrences the spec's forms cover (spec section 10). Keep:
- `B_full_date`/`DATE-literal` and `A_year_context`/`DATE-year-arg`, with `in_range`, in measures, calculated columns, and calculation items. Drop a row whose `where` starts with `CALENDAR` or `GENERATESERIES`, and a row whose `where` is `in FORMAT` when its `line_text` shows that FORMAT's second argument as a string with no `y`.
- `A_year_context` rows `compare` and `compare-reversed` with `op` in `=`, `==`, `<>` and `in_range`; `compare-string-year` with `op` in those, `opclass == "year"`, and `in_range`; `in-list` and `in-list-string` with `in_range`; `var-assign` with `in_range`.
- `D_date_table`/`CALENDAR` rows whose `end[0] == "literal"`, in calculated tables.

It groups them into objects keyed by `(repo, model, kind, table, name)`, with measures keyed without their table, since a measure's name is unique in a model. It then drops objects whose name carries one of their years, with the same test as `namesYear` in `periods.ts`: the four digits, or the last two with no digit on either side. Our side comes from `ours.jsonl`, keyed the same way:

| `type` | kind |
|---|---|
| `Measure` | measure, name from `[...]` |
| `CalculatedColumn` | calculatedColumn, table and name from `'T'[C]` |
| `CalculationItem` | calculationItem, table from the detail's `calculation group '...'` |
| `CalculatedTable` | calculatedTable |

Print:
- Counts per side, Desktop only: objects, repositories, date tables.
- Every object on one side and not the other, with repo, file, line, and the DAX line (from `line_text`, or read from the file for ours).
- The agent group's and the tool group's counts, apart.
- Where the research's hand labels apply, the stale share among our flagged objects. The labels are in `labels.tsv` by R number; `review.txt` headers give each R number's repo, file, and line, and its forms line lists the values.

Expected: about 81 flagged objects counting copies (74 distinct) in 23 repositories, plus date tables from the 38 fixed ends.

- [ ] **Step 4: Explain every difference**

For each difference, read the DAX and put it in one of these classes:
- One of the spec's named deliberate differences: `FORMAT(... "yyyy")` read on the right of a comparison, a variable resolved by DAX's scoping, a variable's name classed as written rather than lowercased, `compare-string-year` against a column with no year name, or the spec's stricter `IN` and DATEVALUE shapes.
- A prototype limit (for example, a construct its patterns did not know).
- A bug in the rule.

A bug is fixed on the branch with a failing test first, in its own commit (`fix(core): ...`, with the same trailers and `Part of #104.`), and the check is rerun. Write `corpus104/report.md` with the counts, each difference and its class, the stale share, and the agent and tool counts. It goes into the pull request body. A difference that fits none of the classes, or that you cannot explain, goes to the controller unresolved rather than being guessed at.

---

## After the tasks (controller)

These are the controller's steps, listed so the plan covers the whole of #104's remaining box:
- A whole-branch review at the top tier, with the spec and plan as its brief, before the pull request.
- The pull request, carrying `Part of #104` (never a closing keyword) and the corpus summary.
- After the merge: tick #104's remaining box, close #104 by hand with a close-out comment, add a release note to #116 (the README's Status clause for the first native model rule is #116's), and update #103.
