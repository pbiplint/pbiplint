# Robustness Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the eighteen robustness follow-ups recorded in issue #7 after the v1 reviews, in four independently reviewable pull requests.

**Architecture:** No new modules and no new dependencies. Every change is a local edit to an existing file, each paired with a test that fails first. The four stages are ordered by what a change can break: the parser fix changes what a user is told, the web runtime fixes change what a visitor sees, the web build fixes change only generated output, and the release fixes change how the next publish behaves and are hardest to prove locally, so they go last.

**Tech Stack:** TypeScript 6, Vitest 5 (happy-dom for DOM tests), Vite 8, Node scripts as plain `.mjs`, GitHub Actions.

**Spec:** https://github.com/pbiplint/pbiplint/issues/7 (the checklist is the spec; there is no separate design doc). Background: `docs/superpowers/specs/2026-09-04-pbiplint-v1-design.md`.

## Global Constraints

- `packages/core` stays browser-pure: no `node:` imports, no `fetch`, no telemetry. Enforced by `npm run check:browser`.
- Tabular Editor is never required by users, the CLI, or CI.
- No em dashes anywhere, including code comments, test names, commit messages, and PR bodies.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3`
- Every commit must leave `npm run lint && npm run typecheck && npm test` green. Run `npm run format` before committing.
- Node floor for the repo is `^20.19.0 || >=22.12.0`.
- Files under `examples/` and `tests/fixtures/` are `-text` in `.gitattributes` and keep their exact bytes. Do not reformat them.
- The repo pushes through a repo-local credential helper pinned to TheDataPractitioner. Any `gh` command that needs org rights runs after `gh auth switch --user TheDataPractitioner` and switches back to `michaelmckinleyconsulting` afterwards.

## File Structure

No files are created except tests and one new test directory.

| File | Stage | Responsibility after the change |
|---|---|---|
| `packages/core/src/tmdl/parse.ts` | 1 | Reports an orphan `///` description wherever it sits, and names the fence the way the rule page does |
| `packages/core/test/parse.test.ts` | 1 | Covers both forms of a trailing description |
| `packages/web/src/main.ts` | 2 | Owns run sequencing: the newest input wins, whatever order the reads finish in |
| `packages/web/src/results/render.ts` | 2 | One reset timer for the copy button |
| `packages/web/src/results/export.ts` | 2 | `copy()` reports every failure as a rejection |
| `packages/web/src/input/read-drop.ts` | 2 | Owns `SKIP_DIRS`, `wanted`, and the shared walk depth cap |
| `packages/web/src/input/pick-folder.ts` | 2 | Applies the skip list and the depth cap to the picked root as well as its children |
| `packages/web/src/build/pages.ts` | 3 | Deterministic rule ordering; refuses an unknown category |
| `packages/web/src/build/generate.ts` | 3 | Regenerates the rules tree from empty |
| `packages/web/src/build/check-site.ts` | 3 | Also catches inline handlers, bare `@import` URLs, `srcset`, and unquoted attributes |
| `scripts/publish.mjs` | 4 | Publishes only when the registry actually said 404 |
| `scripts/check-pack.mjs` | 4 | Matches forbidden paths at any depth; refuses an unknown package |
| `scripts/test/` (new) | 4 | Tests for the two release scripts |
| `vitest.config.ts` | 4 | Also runs `scripts/test/**/*.test.mjs` |
| `.github/workflows/release.yml` | 4 | Verify job without `id-token`, publish job with it |
| `.gitattributes` | 4 | Fixture byte rules win over the Markdown normalisation rule |
| `packages/core/package.json`, `packages/cli/package.json` | 4 | Node floor matches the root |

---

## Stage 1: Core parser

Branch: `parser-followups`. PR title: `fix: report a trailing /// description and name the fence as the rule page does`.

### Task 1: Report a `///` description at the very end of a file

**Files:**
- Modify: `packages/core/src/tmdl/parse.ts:52-75` and the end of `parseTmdl`
- Test: `packages/core/test/parse.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change. `parseTmdl(file, text)` still returns `ParsedFile`; only `issues` gains an entry in the trailing case.

**Background:** the orphan check lives in the blank-line branch, so `"table T\n\t/// Described\n"` (a trailing newline, which makes the last array element `""`) reports, while `"table T\n\t/// Described"` (no trailing newline) falls out of the loop silently. Power BI Desktop always writes the trailing newline; a hand-edited or git-normalised file may not.

- [ ] **Step 1: Write the failing test**

Add this to `packages/core/test/parse.test.ts`, directly after the existing test named `drops a /// description that a blank line separates from its object, which Tabular Editor's reader rejects (checked 2026-09)`:

```ts
  it("reports a /// description at the end of a file, with or without a trailing newline", () => {
    const orphan = {
      file: "t.tmdl",
      line: 2,
      text: "\t/// Described",
      reason: "description is not followed by a declaration",
    };
    expect(parseTmdl("t.tmdl", "table T\n\t/// Described\n").issues).toEqual([orphan]);
    // The same file without the final newline: nothing follows the description there either.
    expect(parseTmdl("t.tmdl", "table T\n\t/// Described").issues).toEqual([orphan]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/core/test/parse.test.ts -t "end of a file"`
Expected: FAIL. The second assertion gets `[]` instead of one issue.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/tmdl/parse.ts`, replace lines 52-55:

```ts
  let pendingDescription: string[] = [];
  // The first `///` line of the pending run, for the issue reported when it leads nowhere.
  let descriptionLine = 0;
  let descriptionText = "";
```

with:

```ts
  let pendingDescription: string[] = [];
  // The first `///` line of the pending run, for the issue reported when it leads nowhere.
  let descriptionLine = 0;
  let descriptionText = "";
  /** A pending description that nothing will claim: report it and drop it. */
  const orphanDescription = (): void => {
    issues.push({
      file,
      line: descriptionLine,
      text: descriptionText,
      reason: "description is not followed by a declaration",
    });
    pendingDescription = [];
  };
```

Then replace the body of the blank-line branch (lines 64-72) with the call:

```ts
      // Tabular Editor's TMDL reader rejects a blank line after a `///` description, so a
      // description separated from its declaration never reaches it. Report and drop it.
      if (pendingDescription.length) orphanDescription();
```

Then, immediately before the final `return` of `parseTmdl`, add:

```ts
  // A description on the last line has no blank line after it to reach the check above. Desktop
  // always writes a trailing newline, which does, but a hand-edited file need not.
  if (pendingDescription.length) orphanDescription();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/parse.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Run the full suite, since parse issues feed the PARSE_ISSUE rule and the parity fixtures**

Run: `npm test`
Expected: PASS. If `packages/core/test/parity.test.ts` fails, a committed expectation counted issues for a fixture that ends without a newline: read the diff before changing any fixture.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tmdl/parse.ts packages/core/test/parse.test.ts
git commit -m "$(cat <<'MSG'
fix(core): report a /// description at the very end of a file

The orphan check only ran from the blank-line branch, so a description on
the last line of a file with no trailing newline was dropped in silence.
Both cases now report the same issue.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 2: Name the fence the way the rule page does

**Files:**
- Modify: `packages/core/src/tmdl/parse.ts:132`
- Test: `packages/core/test/parse.test.ts:174`

**Interfaces:**
- Consumes: nothing.
- Produces: the `ParseIssue.reason` string for an unclosed fence becomes `"unterminated code fence"`. `rules/parse-issue.md` and `packages/core/src/rules/rule-summaries.data.ts` already say "an unterminated code fence" and need no edit.

- [ ] **Step 1: Change the expectation first**

In `packages/core/test/parse.test.ts:174`, replace:

```ts
      [3, "unterminated ``` fence"],
```

with:

```ts
      [3, "unterminated code fence"],
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/core/test/parse.test.ts -t "unterminated fences"`
Expected: FAIL, the received value still reads `unterminated \`\`\` fence`.

- [ ] **Step 3: Change the parser**

In `packages/core/src/tmdl/parse.ts:132`, replace:

```ts
        issues.push({ file, line: lineNo, text: raw, reason: "unterminated ``` fence" });
```

with:

```ts
        // "code fence", the words rules/parse-issue.md uses, so the finding and the page agree.
        issues.push({ file, line: lineNo, text: raw, reason: "unterminated code fence" });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/core/test/parse.test.ts -t "unterminated fences"`
Expected: PASS.

- [ ] **Step 5: Check nothing else pinned the old string**

Run: `grep -rn "unterminated" packages/*/src packages/*/test rules tests scripts`
Expected: no hit outside `packages/core/src/tmdl/parse.ts`, `packages/core/test/parse.test.ts`, and the three files that already say "an unterminated code fence" in prose. Hits under any `dist/` directory are stale build output and are ignored.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tmdl/parse.ts packages/core/test/parse.test.ts
git commit -m "$(cat <<'MSG'
fix(core): call it an unterminated code fence, as the rule page does

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 3: Ship stage 1

- [ ] **Step 1: Run every gate**

Run: `npm run lint && npm run typecheck && npm test && npm run check:browser`
Expected: all four pass.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin parser-followups
gh pr create --title "fix: report a trailing /// description and name the fence as the rule page does" --body "$(cat <<'MSG'
Two boxes from #7, both in the TMDL parser.

- A `///` description on the last line of a file was only reported as an orphan when the file ended with a newline. The pending description is now flushed after the loop as well, so both forms report.
- The finding said "unterminated ``` fence" while `rules/parse-issue.md` says "code fence". They now agree.

Refs #7

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

- [ ] **Step 3: Tick the two Core boxes on issue #7 once the PR merges**

---

## Stage 2: Web runtime

Branch: `web-runtime-followups`. PR title: `fix: let the newest input win, and harden the copy button and the folder walks`.

Everything in this stage ships in the browser bundle. Task 4 leads because it is the only item in issue #7 that can put results for one input under a status line describing another.

### Task 4: The newest input wins, whatever order the reads finish in

**Files:**
- Modify: `packages/web/src/main.ts:104-175`
- Test: `packages/web/test/home.test.ts`

**Interfaces:**
- Consumes: `readDataTransfer`, `readPickedDirectory`, `readDirectoryInput`, all unchanged.
- Produces: module-private `startRun(): number` and `superseded(token: number): boolean`. Nothing is exported; `main.ts` has no exports today and gains none.

**Background:** the four input routes each call `run()` or `fail()` from a promise callback. A folder walk started first can resolve after a paste or a second drop, replacing newer results and leaving the status line describing a different input.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/test/home.test.ts`, inside the `describe("home page")` block, after the test named `clears the last results when the next input fails`:

```ts
  it("lets the newest input win when two reads finish out of order", async () => {
    const input = document.getElementById("folder-input") as HTMLInputElement;
    let release: (() => void) | undefined;
    // A folder file whose read never settles until the test says so.
    const slow = Object.assign(new File(["table Slow\n"], "Slow.tmdl"), {
      webkitRelativePath: "Slow.SemanticModel/definition/tables/Slow.tmdl",
      text: () => new Promise<string>((resolve) => (release = () => resolve("table Slow\n"))),
    });
    Object.defineProperty(input, "files", { configurable: true, value: [slow] });
    try {
      input.dispatchEvent(new Event("change"));
    } finally {
      Reflect.deleteProperty(input, "files");
    }
    await tick();
    // The folder read is still waiting on its file, so a paste finishes first and owns the page.
    (document.getElementById("paste") as HTMLTextAreaElement).value = "table Pasted\n";
    document.getElementById("lint-paste")!.click();
    await tick();
    expect(document.querySelector("#results h2")!.textContent).toBe("Results for pasted TMDL");
    release!();
    await tick();
    await tick();
    // The superseded read comes back last and is dropped rather than replacing the paste.
    expect(document.querySelector("#results h2")!.textContent).toBe("Results for pasted TMDL");
    expect(document.getElementById("status")!.hidden).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/test/home.test.ts -t "finish out of order"`
Expected: FAIL. The final assertion reads `Results for Slow.SemanticModel (1 file)`.

- [ ] **Step 3: Add the token**

In `packages/web/src/main.ts`, insert after the `fail` function (line 49):

```ts
/**
 * Two reads can be in flight at once, a drop landing while a folder walk is still going, and they
 * can come back in either order. Every input takes the next token as it starts; a read holding
 * anything but the newest token has been superseded, so its results and its failures are both
 * dropped rather than overwriting what the newer input is already showing.
 */
let latestRun = 0;
const startRun = (): number => (latestRun += 1);
const superseded = (token: number): boolean => token !== latestRun;
```

- [ ] **Step 4: Claim a token on the two synchronous routes**

Replace the `lint-paste` and `try-sample` handlers (lines 104-119) with:

```ts
byId("lint-paste").addEventListener("click", () => {
  const text = paste.value;
  // Claimed even for an empty paste: a folder still reading must not land on top of the message.
  startRun();
  if (text.trim() === "") {
    problem("Paste some TMDL first.");
    return;
  }
  run({ files: [{ path: "pasted.tmdl", text }], source: "pasted TMDL" });
});

byId("try-sample").addEventListener("click", () => {
  startRun();
  run({
    files: SAMPLE_FILES,
    source: `${SAMPLE_NAME} (${plural(SAMPLE_FILES.length, "file")})`,
    read: SAMPLE_FILES.map((f) => f.path),
  });
});
```

- [ ] **Step 5: Guard the drop route**

Replace the body of the `dropZone` drop listener (lines 156-163) with:

```ts
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  unlight();
  if (!event.dataTransfer) return;
  const token = startRun();
  reading();
  // readDataTransfer takes the entries before its first await, while the DataTransfer is still readable.
  readDataTransfer(event.dataTransfer).then(
    (tree) => {
      if (!superseded(token)) runEntries(tree);
    },
    (e) => {
      if (!superseded(token)) fail(e);
    },
  );
});
```

- [ ] **Step 6: Guard the picker and the directory input**

Replace lines 165-175 with:

```ts
const picker = directoryPicker();
byId("choose-folder").addEventListener("click", () => {
  if (!picker) {
    folderInput.click();
    return;
  }
  // The token is claimed when a folder is chosen rather than when the dialog opens: the dialog can
  // sit open for as long as the person likes, and it must not cancel an input made in the meantime.
  // A failure before that has no token, and a picker that will not open is worth saying out loud.
  let token = 0;
  readPickedDirectory(picker, () => {
    token = startRun();
    reading();
  }).then(
    (entries) => {
      if (entries && !superseded(token)) runEntries(entries);
    },
    (e) => {
      if (token === 0 || !superseded(token)) fail(e);
    },
  );
});
folderInput.addEventListener("change", () => {
  const token = startRun();
  reading();
  readDirectoryInput(folderInput).then(
    (tree) => {
      if (!superseded(token)) runEntries(tree);
    },
    (e) => {
      if (!superseded(token)) fail(e);
    },
  );
  folderInput.value = "";
});
```

- [ ] **Step 7: Run the web tests**

Run: `npx vitest run packages/web/test`
Expected: PASS, including `home-picker.test.ts`, whose `["picked:", "walk:Reading files..."]` assertion still holds because `reading()` still runs inside `onPicked`.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/main.ts packages/web/test/home.test.ts
git commit -m "$(cat <<'MSG'
fix(web): let the newest input win when two reads finish out of order

A drop landing while a folder walk was still reading could resolve second
and replace the newer results, leaving the status line describing one
input and the results showing another. Every input now claims a token and
a superseded read is dropped.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 5: One reset timer on the copy button

**Files:**
- Modify: `packages/web/src/results/render.ts:135-163`
- Test: `packages/web/test/render.test.ts`

**Interfaces:**
- Consumes: `copy`, `exportMarkdown` from `../src/results/export.js`, unchanged.
- Produces: no signature change. `renderExportBar` stays module-private and keeps returning `HTMLElement`.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/test/render.test.ts`, inside `describe("renderResults")`:

```ts
  it("keeps one reset timer, so a second copy cannot flip the label back early", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.useFakeTimers();
    try {
      renderResults(container, result, { source: "x" });
      const button = [...container.querySelectorAll("button")].find(
        (b) => b.textContent === "Copy Markdown",
      )!;
      button.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(button.textContent).toBe("Copied");
      await vi.advanceTimersByTimeAsync(1000);
      button.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(button.textContent).toBe("Copied");
      // The first click's reset was due here; the second click cleared it.
      await vi.advanceTimersByTimeAsync(600);
      expect(button.textContent).toBe("Copied");
      await vi.advanceTimersByTimeAsync(900);
      expect(button.textContent).toBe("Copy Markdown");
    } finally {
      vi.useRealTimers();
    }
  });
```

Add `vi` to the vitest import at the top of the file if it is not there yet:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/test/render.test.ts -t "reset timer"`
Expected: FAIL at the assertion after the 600 ms advance, which reads `Copy Markdown`.

- [ ] **Step 3: Write the implementation**

In `packages/web/src/results/render.ts`, replace lines 141-162 (the `return h("div", { class: "export" }, ...)` call) with:

```ts
  // One handle for the copy button's reset: a second click before the first reset lands would
  // otherwise schedule a second one that flips the label back early.
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;
  return h(
    "div",
    { class: "export" },
    button("Download Markdown", () => download(exportMarkdown(result))),
    button("Download JSON", () => download(exportJson(result))),
    button("Copy Markdown", (b) => {
      const flash = (label: string): void => {
        b.textContent = label;
        clearTimeout(restoreTimer);
        restoreTimer = setTimeout(() => (b.textContent = "Copy Markdown"), 1500);
      };
      void copy(exportMarkdown(result))
        .then(() => flash("Copied"))
        // A browser with no clipboard API, an insecure context, an unfocused document, or a
        // refused permission all land here. Say so on the button instead of failing silently.
        .catch(() => flash("Copy failed"));
    }),
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/test/render.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/results/render.ts packages/web/test/render.test.ts
git commit -m "$(cat <<'MSG'
fix(web): keep one reset timer for the copy button

Two quick clicks stacked two timers, so the second "Copied" could flip
back to the idle label 900 ms early.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 6: `copy()` reports every failure as a rejection

**Files:**
- Modify: `packages/web/src/results/export.ts:36-46`
- Test: `packages/web/test/export.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `copy(file: ExportFile): Promise<void>` keeps its signature. The guarantee tightens: it never throws synchronously, whatever `navigator.clipboard` does.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/test/export.test.ts`, inside `describe("export")`, after the test named `rejects rather than throws when there is no clipboard`:

```ts
  it("rejects rather than throws when writeText itself throws", async () => {
    setClipboard({
      writeText: () => {
        throw new Error("Write permission denied by policy");
      },
    });
    const promise = copy(file);
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow("Write permission denied by policy");
  });
  it("rejects rather than throws when reading navigator.clipboard throws", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get() {
        throw new Error("Blocked by permissions policy");
      },
    });
    await expect(copy(file)).rejects.toThrow("Blocked by permissions policy");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/test/export.test.ts -t "rejects rather than throws when"`
Expected: FAIL on both new tests. The error is thrown out of `copy(file)` itself, so the assertion never runs.

- [ ] **Step 3: Write the implementation**

Replace lines 36-46 of `packages/web/src/results/export.ts` with:

```ts
/**
 * Copies the text with the async clipboard API. Every way this can go wrong comes back as a
 * rejected promise, so callers have one failure path rather than two: an insecure context or an
 * older browser has no `navigator.clipboard` at all, a permissions policy can make reading the
 * property or calling `writeText` throw outright, and a refused permission rejects.
 */
export function copy(file: ExportFile): Promise<void> {
  return Promise.resolve().then(() => {
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (!clipboard) throw new Error("Clipboard access is not available");
    return clipboard.writeText(file.text);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/test/export.test.ts packages/web/test/render.test.ts`
Expected: PASS. The render test still passes because `advanceTimersByTimeAsync` flushes the extra microtask the wrapper adds.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/results/export.ts packages/web/test/export.test.ts
git commit -m "$(cat <<'MSG'
fix(web): make copy() reject rather than throw on every failure path

A permissions policy can make navigator.clipboard throw on read and
writeText throw on call. Both now reach the caller as a rejection, which
is the one failure path the doc comment promised.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 7: The picker skips a picked root that is itself a skipped folder

**Files:**
- Modify: `packages/web/src/input/pick-folder.ts:46-63`
- Test: `packages/web/test/pick-folder.test.ts`

**Interfaces:**
- Consumes: `SKIP_DIRS` from `./read-drop.js`, already imported.
- Produces: `readPickedDirectory` keeps its signature. `walkHandle` stays module-private; the skip test moves from the recursive call site to the top of the function, which is where `walkEntry` in `read-drop.ts` already does it.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/test/pick-folder.test.ts`, inside `describe("readPickedDirectory")`:

```ts
  it("reads nothing when the picked folder is itself one of the skipped folders", async () => {
    const picked = dirHandle("node_modules", [
      dirHandle("pkg", [fileHandle("model.tmdl", "model Model\n")]),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(out).toEqual({ entries: [], modelFolders: [] });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/test/pick-folder.test.ts -t "itself one of the skipped folders"`
Expected: FAIL. `entries` holds `node_modules/pkg/model.tmdl`.

- [ ] **Step 3: Write the implementation**

Replace `walkHandle` (lines 46-63) with:

```ts
async function walkHandle(
  dir: DirectoryHandleLike,
  prefix: string,
  tree: InputTree,
): Promise<void> {
  // Tested here rather than at the recursive call below, so the picked root is tested too: the
  // drop route's walkEntry checks the entry it is handed the same way.
  if (SKIP_DIRS.has(dir.name)) return;
  if (isModelFolder(dir.name)) tree.modelFolders.push(prefix);
  for await (const handle of dir.values()) {
    if (handle.kind === "file") {
      if (wanted(handle.name))
        tree.entries.push({
          path: `${prefix}/${handle.name}`,
          text: await (await handle.getFile()).text(),
        });
    } else {
      await walkHandle(handle, `${prefix}/${handle.name}`, tree);
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/test/pick-folder.test.ts`
Expected: PASS, including the existing test that skips a `node_modules` child.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/input/pick-folder.ts packages/web/test/pick-folder.test.ts
git commit -m "$(cat <<'MSG'
fix(web): test the picked root folder against the skip list

The drop route drops a skipped folder before walking it. The picker route
only tested children, so choosing node_modules or .git read the lot.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 8: A depth cap so a folder cycle cannot walk forever

**Files:**
- Modify: `packages/web/src/input/read-drop.ts:6-7,37-59`
- Modify: `packages/web/src/input/pick-folder.ts` (`walkHandle`)
- Test: `packages/web/test/read-drop.test.ts`, `packages/web/test/pick-folder.test.ts`

**Interfaces:**
- Produces: `read-drop.ts` exports `MAX_DEPTH: number` alongside `SKIP_DIRS` and `wanted`. `walkEntry(entry: FileSystemEntry, tree: InputTree, depth?: number): Promise<void>` gains a third parameter that defaults to `0`, so existing callers and the existing tests are unchanged.
- `pick-folder.ts` imports `MAX_DEPTH` and gives `walkHandle` the same defaulted `depth` parameter.

**Background:** no browser follows a symlink into a dropped or picked folder today, so this has no known trigger. A cycle would otherwise recurse until the stack gives out. A depth cap bounds it in both walkers with one constant and needs no async identity comparison.

- [ ] **Step 1: Write the failing tests**

Add to `packages/web/test/read-drop.test.ts`, inside `describe("walkEntry")`:

```ts
  it("stops instead of looping when a folder contains itself", async () => {
    // A symlink cycle would look like this. No browser hands one out today.
    const loop = {
      isFile: false,
      isDirectory: true,
      name: "Loop",
      fullPath: "/Loop",
      createReader: () => {
        let done = false;
        return {
          readEntries: (ok: (entries: FileSystemEntry[]) => void) => {
            ok(done ? [] : [loop]);
            done = true;
          },
        };
      },
    } as unknown as FileSystemDirectoryEntry;
    const tree: InputTree = { entries: [], modelFolders: [] };
    await walkEntry(loop, tree);
    expect(tree).toEqual({ entries: [], modelFolders: [] });
  });
```

Add to `packages/web/test/pick-folder.test.ts`, inside `describe("readPickedDirectory")`:

```ts
  it("stops instead of looping when a picked folder contains itself", async () => {
    const loop: Handle = {
      kind: "directory",
      name: "Loop",
      async *values() {
        yield loop;
      },
    };
    const out = await readPickedDirectory(async () => loop as never);
    expect(out).toEqual({ entries: [], modelFolders: [] });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/web/test/read-drop.test.ts packages/web/test/pick-folder.test.ts -t "contains itself"`
Expected: FAIL. Both hang until Vitest's timeout or die with `RangeError: Maximum call stack size exceeded`.

- [ ] **Step 3: Add the constant**

In `packages/web/src/input/read-drop.ts`, after the `SKIP_DIRS` declaration (line 7), add:

```ts
/**
 * How deep a folder walk goes. A drop or a picked folder is a tree today, since no browser follows
 * a symlink into one, but a cycle would otherwise recurse until the stack gives out. A real PBIP
 * folder is under ten deep, so a genuine model never reaches this.
 */
export const MAX_DEPTH = 64;
```

- [ ] **Step 4: Cap the drop walker**

In `packages/web/src/input/read-drop.ts`, change the signature and the two lines that use the depth:

```ts
export async function walkEntry(
  entry: FileSystemEntry,
  tree: InputTree,
  depth = 0,
): Promise<void> {
```

```ts
  if (!entry.isDirectory || SKIP_DIRS.has(entry.name) || depth >= MAX_DEPTH) return;
```

```ts
    for (const child of batch) await walkEntry(child, tree, depth + 1);
```

- [ ] **Step 5: Cap the picker walker**

In `packages/web/src/input/pick-folder.ts`, change the import on line 2 and `walkHandle`:

```ts
import { MAX_DEPTH, SKIP_DIRS, wanted } from "./read-drop.js";
```

```ts
async function walkHandle(
  dir: DirectoryHandleLike,
  prefix: string,
  tree: InputTree,
  depth = 0,
): Promise<void> {
  // Tested here rather than at the recursive call below, so the picked root is tested too: the
  // drop route's walkEntry checks the entry it is handed the same way.
  if (SKIP_DIRS.has(dir.name) || depth >= MAX_DEPTH) return;
```

```ts
    } else {
      await walkHandle(handle, `${prefix}/${handle.name}`, tree, depth + 1);
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/web/test`
Expected: PASS, and the two cycle tests finish in well under a second.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/input/read-drop.ts packages/web/src/input/pick-folder.ts packages/web/test/read-drop.test.ts packages/web/test/pick-folder.test.ts
git commit -m "$(cat <<'MSG'
fix(web): cap the depth of both folder walks

No browser follows a symlink into a dropped or picked folder today, so
this has no known trigger, but a cycle would have recursed until the
stack gave out. One shared constant bounds both walkers.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 9 (optional, beyond issue #7): Announce the copy result to a screen reader

Drop this task if the PR review would rather keep the branch to the issue. It is here because the copy result is visible on the button only, and a screen reader user clicking Copy Markdown gets no reliable announcement.

**Files:**
- Modify: `packages/web/src/results/render.ts` (`renderExportBar`)
- Test: `packages/web/test/render.test.ts`

**Interfaces:**
- Produces: the export bar gains a `<span class="visually-hidden" role="status">` as its last child. `.visually-hidden` already exists in `packages/web/src/styles.css:95`. `#announce` in `index.html` is untouched, so nothing double-announces: this region only ever fills on a copy click.

- [ ] **Step 1: Write the failing test**

```ts
  it("announces the copy result through its own status region", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderResults(container, result, { source: "x" });
    const region = container.querySelector(".export [role='status']")!;
    expect(region.textContent).toBe("");
    expect(region.classList.contains("visually-hidden")).toBe(true);
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === "Copy Markdown")!
      .click();
    await new Promise((r) => setTimeout(r, 0));
    expect(region.textContent).toBe("Report copied to the clipboard");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/web/test/render.test.ts -t "own status region"`
Expected: FAIL, `container.querySelector(...)` is null.

- [ ] **Step 3: Write the implementation**

In `renderExportBar`, create the region before the `return` and update `flash` to fill it:

```ts
  // The button label flips for everyone who can see it; this says the same thing out loud. It is
  // empty until a copy happens, so it never competes with the #announce region on the page.
  const announce = h("span", { class: "visually-hidden", role: "status" });
```

Change `flash` to take both strings:

```ts
      const flash = (label: string, spoken: string): void => {
        b.textContent = label;
        announce.textContent = spoken;
        clearTimeout(restoreTimer);
        restoreTimer = setTimeout(() => (b.textContent = "Copy Markdown"), 1500);
      };
      void copy(exportMarkdown(result))
        .then(() => flash("Copied", "Report copied to the clipboard"))
        .catch(() => flash("Copy failed", "Copying to the clipboard failed"));
```

and add `announce` as the last child of the returned `div`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/web/test/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/results/render.ts packages/web/test/render.test.ts
git commit -m "$(cat <<'MSG'
feat(web): announce the copy result to a screen reader

The label flip on the button is visual only. A hidden status region beside
the buttons says the same thing, and stays empty until a copy happens so
it never competes with the page's announcer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 10: Ship stage 2

- [ ] **Step 1: Run every gate, including the real browsers**

Run: `npm run lint && npm run typecheck && npm test && npm run build -w @pbiplint/web`
Expected: all pass, and the site check prints `site check passed`.

- [ ] **Step 2: Run the end-to-end suite, since this stage changes the input routes**

Run: `npm run test:e2e`
Expected: PASS in Chromium, Firefox, and WebKit. If Playwright browsers are missing, run `npx playwright install --with-deps chromium firefox webkit` first.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin web-runtime-followups
gh pr create --title "fix: let the newest input win, and harden the copy button and the folder walks" --body "$(cat <<'MSG'
Five boxes from #7, all in what the browser runs.

- Every input now claims a run token, so a folder walk that resolves after a newer input is dropped instead of replacing its results.
- The copy button keeps one reset timer, so two quick clicks cannot flip the label back early.
- `copy()` rejects rather than throws on every failure path, including a permissions policy that makes reading `navigator.clipboard` throw.
- The picker route tests the picked root folder against the skip list, as the drop route already did.
- Both folder walkers stop at a depth cap, so a symlink cycle cannot walk forever. No browser hands one out today.

Refs #7

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

- [ ] **Step 4: Tick the five Web app boxes on issue #7 once the PR merges** (see "Ticking the boxes on issue #7" at the end of this plan)

---

## Stage 3: Web build

Branch: `web-build-followups`. PR title: `fix: make the generated site deterministic and fail the build on what it used to drop`.

Nothing in this stage ships in the browser bundle. All four changes are about a build that could be wrong and still green.

### Task 11: Sort the rules index with an explicit locale

**Files:**
- Modify: `packages/web/src/build/pages.ts:212`
- Test: `packages/web/test/generate.test.ts`

**Interfaces:**
- Produces: `rulesIndex(metas: RuleMeta[]): string` keeps its signature. Add `rulesIndex` to the existing `../src/build/pages.js` import in the test file, which currently imports `NAV, parseFrontmatter, rulePage`.

**Background:** `localeCompare` with no locale uses the host's default, so the same rule set can come out in a different order on a different machine and produce a different `rules/index.html` from identical input.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/test/generate.test.ts`, in a new `describe` block after `describe("generateSite")`:

```ts
describe("rulesIndex", () => {
  const metas = generateSite({ outDir: mkdtempSync(join(tmpdir(), "pbiplint-index-")) });
  it("sorts with an explicit locale, so the order does not depend on the build machine", () => {
    const seen: (string | string[] | undefined)[] = [];
    const real = String.prototype.localeCompare;
    const spy = vi
      .spyOn(String.prototype, "localeCompare")
      .mockImplementation(function (this: string, that: string, locales?: string | string[]) {
        seen.push(locales);
        return real.call(this, that, locales);
      });
    try {
      rulesIndex(metas);
    } finally {
      spy.mockRestore();
    }
    expect(seen.length).toBeGreaterThan(0);
    expect([...new Set(seen)]).toEqual(["en"]);
  });
});
```

Add `vi` to the vitest import, and `rulesIndex` to the `../src/build/pages.js` import, at the top of the file:

```ts
import { describe, expect, it, vi } from "vitest";
import { generateSite, pageEntries, RULES_DIR } from "../src/build/generate.js";
import { NAV, parseFrontmatter, rulePage, rulesIndex } from "../src/build/pages.js";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/test/generate.test.ts -t "explicit locale"`
Expected: FAIL with `[...new Set(seen)]` reported as `[undefined]`. Measured on the current code: the sort makes 178 calls and every one of them is the sort, so after the fix the set is exactly `["en"]`.

- [ ] **Step 3: Write the implementation**

In `packages/web/src/build/pages.ts:212`, replace:

```ts
      .sort((a, b) => a.title.localeCompare(b.title));
```

with:

```ts
      // An explicit locale: with none, the order comes from the build machine's default and the
      // same rule set can generate a different index on a different machine.
      .sort((a, b) => a.title.localeCompare(b.title, "en"));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/test/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/build/pages.ts packages/web/test/generate.test.ts
git commit -m "$(cat <<'MSG'
fix(web): sort the rules index with an explicit locale

Without one the order came from the build machine's default, so the same
rule set could generate a different index elsewhere.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

**Note for the PR description, not a change here:** four other `localeCompare` calls take no locale (`packages/cli/src/walk.ts:16`, `packages/core/src/engine/rank.ts:65`, `packages/web/src/sample.ts:16`, `packages/web/src/input/model-files.ts:98,111`). `rank.ts` is the interesting one, because it orders the findings a user sees. Issue #7 names only `pages.ts`, so leave the rest alone and propose a new checkbox rather than widening this PR.

### Task 12: Refuse a rule whose category has no section

**Files:**
- Modify: `packages/web/src/build/pages.ts:207-221`
- Test: `packages/web/test/generate.test.ts`

**Interfaces:**
- Produces: `rulesIndex` throws `Error` with the message `<slug>: unknown category "<category>"` instead of returning an index that silently omits the rule.

- [ ] **Step 1: Write the failing test**

Add inside the `describe("rulesIndex")` block from Task 11:

```ts
  it("refuses a rule whose category has no section, rather than dropping it from the index", () => {
    const invented = { ...metas[0]!, slug: "invented", category: "Invented" };
    expect(() => rulesIndex([invented])).toThrow('invented: unknown category "Invented"');
    // Every real rule still passes.
    expect(() => rulesIndex(metas)).not.toThrow();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/test/generate.test.ts -t "no section"`
Expected: FAIL, `rulesIndex` returns a page rather than throwing.

- [ ] **Step 3: Write the implementation**

In `packages/web/src/build/pages.ts`, insert at the top of `rulesIndex`, before `const count = ...`:

```ts
  // CATEGORY_ORDER drives the sections, so a rule with any other category would be in the count
  // at the top of the page and in no list below it. Fail the build rather than ship a rule page
  // nothing links to.
  for (const m of metas)
    if (!CATEGORY_ORDER.includes(m.category))
      throw new Error(`${m.slug}: unknown category "${m.category}"`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/test/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/build/pages.ts packages/web/test/generate.test.ts
git commit -m "$(cat <<'MSG'
fix(web): fail the build on a rule category the index has no section for

Such a rule was counted at the top of the page and listed nowhere below
it, so its page shipped with nothing linking to it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 13: Regenerate the rules tree from empty

**Files:**
- Modify: `packages/web/src/build/generate.ts:1,18-31`
- Test: `packages/web/test/generate.test.ts`

**Interfaces:**
- Produces: `generateSite(options)` keeps its signature and return type. It now removes `<outDir>/rules` before writing. Everything under that directory is generated and gitignored (`.gitignore` lists `packages/web/rules/`), so nothing tracked is at risk.

- [ ] **Step 1: Write the failing test**

Add inside `describe("generateSite")`:

```ts
  it("clears the generated rules tree, so a renamed rule leaves no orphan page", () => {
    const out = mkdtempSync(join(tmpdir(), "pbiplint-stale-"));
    mkdirSync(join(out, "rules", "renamed-away"), { recursive: true });
    writeFileSync(join(out, "rules", "renamed-away", "index.html"), "<html>stale</html>");
    generateSite({ outDir: out });
    expect(existsSync(join(out, "rules", "renamed-away", "index.html"))).toBe(false);
    expect(existsSync(join(out, "rules", "hide-foreign-keys", "index.html"))).toBe(true);
    expect(existsSync(join(out, "rules", "index.html"))).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/test/generate.test.ts -t "orphan page"`
Expected: FAIL, the stale page is still there.

- [ ] **Step 3: Write the implementation**

In `packages/web/src/build/generate.ts:1`, add `rmSync` to the `node:fs` import:

```ts
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
```

Then insert as the first statement inside `generateSite`, before `const metas: RuleMeta[] = []`:

```ts
  // Every page under rules/ is generated and gitignored, so it is cleared first: a renamed or
  // deleted rule would otherwise leave a page behind that nothing links to and the sitemap no
  // longer names, until the next clean checkout.
  rmSync(join(outDir, "rules"), { recursive: true, force: true });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/web/test/generate.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Check the real build still works**

Run: `npm run build -w @pbiplint/web`
Expected: `generated 72 rule pages, ...` then `site check passed`.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/build/generate.ts packages/web/test/generate.test.ts
git commit -m "$(cat <<'MSG'
fix(web): clear the generated rules tree before regenerating it

A renamed rule left its old page behind in a local build until the next
clean checkout. CI always starts clean, so this never reached the site.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 14: Widen the site check

**Files:**
- Modify: `packages/web/src/build/check-site.ts:21-26,54-81`
- Test: `packages/web/test/check-site.test.ts`

**Interfaces:**
- Produces: `checkSite(dir): SiteReport` keeps its signature. Four new problem sources, with two new message shapes: `<rel>: inline event handler <tag>` and, from a `<style>` block, the existing `<rel>: external <match>` form.

**Background:** the Content-Security-Policy blocks all four at run time, so this is hardening, not a live hole. It matters because the site check is what proves a build never phones home, and a check with a known blind spot is a weaker proof than it looks.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/test/check-site.test.ts`, inside `describe("checkSite")`:

```ts
  it("names an inline handler, a bare @import, a srcset, an unquoted attribute, and an inline style", () => {
    const dir = site({
      "index.html": `<html><head>${META}</head><body><button onclick="go()">x</button></body></html>`,
      "a/index.html": `<html><head>${META}</head><body><img srcset="https://img.example/x.png 2x, /favicon.svg 1x"></body></html>`,
      "b/index.html": `<html><head>${META}</head><body><script src=https://cdn.example/x.js></script></body></html>`,
      "c/index.html": `<html><head>${META}<style>@import "https://fonts.example/x.css";</style></head></html>`,
      "assets/a.css": '@import "https://fonts.example/y.css";',
    });
    expect(checkSite(dir).problems).toEqual([
      'a/index.html: external resource <img srcset="https://img.example/x.png 2x, /favicon.svg 1x">',
      'assets/a.css: external @import "https://fonts.example/y.css"',
      "b/index.html: external resource <script src=https://cdn.example/x.js>",
      'c/index.html: external @import "https://fonts.example/x.css"',
      'index.html: inline event handler <button onclick="go()">',
    ]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/web/test/check-site.test.ts -t "inline handler"`
Expected: FAIL with `problems` empty: none of the five is caught today.

- [ ] **Step 3: Add the patterns**

In `packages/web/src/build/check-site.ts`, replace lines 21-26 with:

```ts
/** Elements that load something, with the attribute that names it. Anchors navigate; they are not resources. */
const RESOURCE_TAG = /<(script|link|img|iframe|video|audio|source|embed|object)\b[^>]*>/gi;
/** Any opening tag, for the checks that are not about a resource. */
const ANY_TAG = /<[a-z][^>]*>/gi;
const OFF_ORIGIN = /^(https?:)?\/\//i;
const CSS_URL = /url\((["']?)((?:https?:)?\/\/[^)"']*)\1\)/gi;
/** `@import "https://..."`, which CSS_URL misses because it names no url(). */
const CSS_IMPORT = /@import\s+(["'])(?:https?:)?\/\/[^"']*\1/gi;
/** A <style> block's contents, so an inline stylesheet gets the same checks as a file. */
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
/**
 * An inline event handler. The CSP's script-src blocks these at run time, so this is hardening.
 * The generator writes no attribute beginning with "on", which is why the match can be this broad.
 */
const INLINE_HANDLER = /\son[a-z]{2,}\s*=/i;
/** src, href, or srcset written unquoted, which the quoted matcher below would skip. */
const UNQUOTED_ATTR = /\s(?:src|href|srcset)=(?!["'])([^\s>]+)/i;
/** An opening tag that carries an id, with the id captured. */
const ID_ATTR = /<[a-z][^>]*\sid="([^"]*)"[^>]*>/gi;

/** Every candidate URL in a srcset: comma separated, each a URL and an optional descriptor. */
const srcsetUrls = (tag: string): string[] => {
  const value = /\ssrcset=["']([^"']*)["']/i.exec(tag)?.[1];
  if (!value) return [];
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
};
```

- [ ] **Step 4: Use them**

Replace `checkHtml` (lines 54-72) with:

```ts
function checkHtml(rel: string, html: string, report: SiteReport): void {
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
  const csp = decodeAttribute(meta);
  if (!csp.includes("connect-src 'none'"))
    report.problems.push(`${rel}: no Content-Security-Policy meta with connect-src 'none'`);
  for (const tag of html.match(RESOURCE_TAG) ?? []) {
    if (/\brel="canonical"/.test(tag)) continue;
    const targets = [
      /\s(?:src|href)=["']([^"']*)["']/i.exec(tag)?.[1] ?? "",
      UNQUOTED_ATTR.exec(tag)?.[1] ?? "",
      ...srcsetUrls(tag),
    ];
    // One problem per tag, however many of its attributes reach off the origin.
    if (targets.some((target) => OFF_ORIGIN.test(target)))
      report.problems.push(`${rel}: external resource ${tag}`);
  }
  for (const tag of html.match(ANY_TAG) ?? [])
    if (INLINE_HANDLER.test(tag)) report.problems.push(`${rel}: inline event handler ${tag}`);
  // An inline stylesheet can reach off the origin exactly as a file can.
  for (const m of html.matchAll(STYLE_BLOCK)) checkStyle(rel, m[1]!, report);
  // Heading ids are made from heading text, so a repeated or empty one would break a deep link.
  const ids = new Set<string>();
  for (const m of html.matchAll(ID_ATTR)) {
    const id = m[1]!;
    if (id === "") report.problems.push(`${rel}: empty id on ${m[0]}`);
    else if (ids.has(id)) report.problems.push(`${rel}: duplicate id "${id}"`);
    ids.add(id);
  }
}
```

and replace `checkStyle` (lines 79-81) with:

```ts
function checkStyle(rel: string, css: string, report: SiteReport): void {
  for (const m of css.matchAll(CSS_URL)) report.problems.push(`${rel}: external ${m[0]}`);
  for (const m of css.matchAll(CSS_IMPORT)) report.problems.push(`${rel}: external ${m[0]}`);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/web/test/check-site.test.ts`
Expected: PASS, including the existing test that passes a clean site. If that one now reports a problem, the new patterns are too broad: narrow the pattern, do not loosen the test.

- [ ] **Step 6: Run the real build, which runs this check on the real output**

Run: `npm run build -w @pbiplint/web`
Expected: `site check passed`. If a new problem appears, read it before changing anything: the check has just found something real in the built site, and the fix belongs in whatever generated it.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/build/check-site.ts packages/web/test/check-site.test.ts
git commit -m "$(cat <<'MSG'
fix(web): catch inline handlers, bare @imports, srcset, and unquoted attributes

The CSP blocks all of these at run time, so this is hardening. The site
check is the proof that a build never phones home, and a proof with known
blind spots is weaker than it looks.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 15: Ship stage 3

- [ ] **Step 1: Run every gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build -w @pbiplint/web`
Expected: all pass.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin web-build-followups
gh pr create --title "fix: make the generated site deterministic and fail the build on what it used to drop" --body "$(cat <<'MSG'
Four boxes from #7, all build-time. Nothing here ships in the browser bundle.

- The rules index sorts with an explicit `"en"` locale, so the same rule set generates the same page on any machine.
- An unknown rule category now throws instead of dropping the rule from the index while still counting it at the top.
- `generateSite` clears the generated `rules/` tree first, so a renamed rule leaves no orphan page in a local build.
- The site check also catches inline event handlers, an `@import` of a bare URL, `srcset`, unquoted attribute values, and an inline `<style>` block that reaches off the origin. The CSP blocks all of these at run time, so this is hardening.

Not changed here: four other `localeCompare` calls take no locale, and `packages/core/src/engine/rank.ts:65` is the one worth a look, since it orders what a user reads. That is not a box on #7, so it is left for a new one rather than widening this PR.

Refs #7

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

- [ ] **Step 3: Tick the four Web app boxes on issue #7 once the PR merges**

---

## Stage 4: Release and packaging

Branch: `release-followups`. PR title: `ci: make the release checks honest about what they proved`.

Highest blast radius and the least provable locally, so it goes last. Two items are settings rather than code.

### Task 16: `publish.mjs` treats only a 404 as "not published"

**Files:**
- Modify: `scripts/publish.mjs`
- Modify: `vitest.config.ts`
- Create: `scripts/test/publish.test.mjs`

**Interfaces:**
- Produces: `scripts/publish.mjs` exports `PACKAGE_DIRS: string[]` and `viewState(result, version): "published" | "missing" | "unknown"`, and runs its loop only when invoked as a script. `viewState` takes the object `spawnSync` returns (`{ status, stdout, stderr, error }`) and the version that was asked for.
- `vitest.config.ts` `test.include` gains `"scripts/test/**/*.test.mjs"`. Tests here are `.mjs` so `tsconfig.test.json` needs no change and ESLint's existing `**/*.mjs` block already covers them.

- [ ] **Step 1: Let Vitest see the scripts tests**

In `vitest.config.ts`, replace:

```ts
    include: ["packages/*/test/**/*.test.ts"],
```

with:

```ts
    // The release scripts are plain .mjs, and so are their tests: no TypeScript build step sits
    // between scripts/publish.mjs and the workflow step that runs it.
    include: ["packages/*/test/**/*.test.ts", "scripts/test/**/*.test.mjs"],
```

- [ ] **Step 2: Write the failing test**

Create `scripts/test/publish.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { viewState } from "../publish.mjs";

describe("viewState", () => {
  it("is published only when the registry answered with the version asked for", () => {
    expect(viewState({ status: 0, stdout: "0.1.0\n", stderr: "" }, "0.1.0")).toBe("published");
    expect(viewState({ status: 0, stdout: "0.0.9\n", stderr: "" }, "0.1.0")).toBe("unknown");
  });
  it("is missing only when the registry answered 404", () => {
    const notFound = {
      status: 1,
      stdout: "",
      stderr:
        "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/pbiplint\n",
    };
    expect(viewState(notFound, "0.2.0")).toBe("missing");
  });
  it("is unknown when the registry could not be reached, so the run stops short of publishing", () => {
    const offline = {
      status: 1,
      stdout: "",
      stderr: "npm error code ENOTFOUND\nnpm error network request failed\n",
    };
    expect(viewState(offline, "0.2.0")).toBe("unknown");
    expect(viewState({ error: new Error("spawn npm ENOENT") }, "0.2.0")).toBe("unknown");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/test/publish.test.mjs`
Expected: FAIL. `publish.mjs` exports nothing, and importing it runs the publish loop.

- [ ] **Step 4: Write the implementation**

Replace the whole of `scripts/publish.mjs` with:

```js
#!/usr/bin/env node
// Usage: node scripts/publish.mjs   (in the release workflow, after build and check:pack)
//
// Publishes each package whose version is not on the registry yet. Skipping what is already there
// makes the workflow safe to rerun and lets a tag follow a first publish done by hand.
// In GitHub Actions the publish authenticates through npm trusted publishing (OIDC), so no token
// is read here; provenance is attached by npm.
// The publish runs with --ignore-scripts, so the tarball is exactly the tree check:pack
// inspected: no prepack rebuild happens between the check and the upload.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PACKAGE_DIRS = ["packages/core", "packages/cli"];

/**
 * What one `npm view <name>@<version> version` run actually established.
 *
 * "published" only when the registry answered with the version asked for, "missing" only when it
 * answered 404, "unknown" for anything else. The difference matters: a registry that cannot be
 * reached looks exactly like a package that was never published, and treating that as missing
 * falls through to a publish the registry then rejects, reporting a network problem as a
 * publishing one.
 */
export function viewState(result, version) {
  if (result.error) return "unknown";
  const stdout = `${result.stdout ?? ""}`;
  if (result.status === 0) return stdout.trim() === version ? "published" : "unknown";
  return /E404|404 Not Found/.test(`${stdout}${result.stderr ?? ""}`) ? "missing" : "unknown";
}

function main() {
  for (const dir of PACKAGE_DIRS) {
    const { name, version } = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
    const seen = spawnSync("npm", ["view", `${name}@${version}`, "version"], { encoding: "utf8" });
    const state = viewState(seen, version);
    if (state === "published") {
      console.log(`${name}@${version} is already published, skipping`);
      continue;
    }
    if (state === "unknown") {
      console.error(`${seen.stderr ?? ""}${seen.stdout ?? ""}${seen.error?.message ?? ""}`.trim());
      throw new Error(
        `npm view ${name}@${version} answered with neither that version nor a 404, so whether it is published is unknown; not publishing`,
      );
    }
    console.log(`publishing ${name}@${version}`);
    execFileSync("npm", ["publish", "--ignore-scripts", "-w", name], { stdio: "inherit" });
  }
}

// Only when run as a script, so viewState can be imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/test/publish.test.mjs`
Expected: PASS, three tests.

- [ ] **Step 6: Prove the script still runs as a script**

Run: `node scripts/publish.mjs`
Expected: with network access, two `... is already published, skipping` lines and exit 0. Nothing is published, because 0.1.0 is on the registry already.

- [ ] **Step 7: Commit**

```bash
git add scripts/publish.mjs scripts/test/publish.test.mjs vitest.config.ts
git commit -m "$(cat <<'MSG'
fix(release): publish only when the registry actually said 404

A registry that could not be reached looked exactly like a package that
was never published, and the run fell through to a publish the registry
then rejected, reporting a network problem as a publishing one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 17: `check-pack.mjs` matches at any depth and refuses an unknown package

**Files:**
- Modify: `scripts/check-pack.mjs`
- Create: `scripts/test/check-pack.test.mjs`

**Interfaces:**
- Consumes: the Vitest include added in Task 16.
- Produces: `scripts/check-pack.mjs` exports `REQUIRED`, `FORBIDDEN`, and `packProblems(packs): string[]`, and runs `npm pack` only when invoked as a script. `packs` is the array `npm pack --dry-run --json` prints: each entry has `name`, `version`, `entryCount`, `unpackedSize`, and `files: { path: string }[]`.

- [ ] **Step 1: Write the failing test**

Create `scripts/test/check-pack.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { packProblems } from "../check-pack.mjs";

const pack = (name, paths, version = "0.1.0") => ({
  name,
  version,
  files: paths.map((path) => ({ path })),
});
const core = (extra = []) =>
  pack("@pbiplint/core", [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/index.js.map",
    "dist/index.d.ts.map",
    "src/index.ts",
    ...extra,
  ]);
const cli = (extra = []) =>
  pack("pbiplint", [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/pbiplint.mjs",
    "sample/definition/model.tmdl",
    "sample/definition/tables/Sales.tmdl",
    ...extra,
  ]);

describe("packProblems", () => {
  it("passes the two packages as they ship today", () => {
    expect(packProblems([core(), cli()])).toEqual([]);
  });
  it("catches a forbidden file at any depth, not only at the package root", () => {
    // The core ships all of src, so a stray file deep in the tree has to be caught too.
    expect(packProblems([core(["src/config/.env.local"]), cli()])).toEqual([
      "@pbiplint/core: must not ship src/config/.env.local",
    ]);
    expect(packProblems([core(["src/rules/test/helper.ts"]), cli()])).toEqual([
      "@pbiplint/core: must not ship src/rules/test/helper.ts",
    ]);
  });
  it("fails on a package it does not know rather than checking nothing", () => {
    expect(packProblems([core(), pack("renamed-cli", ["package.json"])])).toEqual([
      "renamed-cli: not a package this check knows; add it to REQUIRED or stop packing it",
    ]);
  });
  it("still catches a missing file, a wrong count, and mismatched versions", () => {
    expect(packProblems([core()])).toEqual(["expected 2 packages, got 1"]);
    expect(packProblems([core(), pack("pbiplint", ["package.json"], "0.2.0")])).toEqual([
      "pbiplint: missing README.md",
      "pbiplint: missing LICENSE",
      "pbiplint: missing NOTICE",
      "pbiplint: missing dist/pbiplint.mjs",
      "pbiplint: missing sample/definition/model.tmdl",
      "pbiplint: missing sample/definition/tables/Sales.tmdl",
      "versions differ: 0.1.0, 0.2.0",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/test/check-pack.test.mjs`
Expected: FAIL. `check-pack.mjs` exports nothing, and importing it shells out to `npm pack`.

- [ ] **Step 3: Write the implementation**

Replace the whole of `scripts/check-pack.mjs` with:

```js
#!/usr/bin/env node
// Usage: node scripts/check-pack.mjs   (after npm run build)
//
// Dry-runs npm pack for both published packages and fails when a file that must ship is missing,
// a file that must not ship is present, a package is not one this check knows, or the two versions
// differ. Scripts are skipped so the check looks at what the last build produced, exactly as the
// release workflow publishes it.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const REQUIRED = {
  "@pbiplint/core": [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/index.js.map",
    "dist/index.d.ts.map",
    "src/index.ts",
  ],
  pbiplint: [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/pbiplint.mjs",
    "sample/definition/model.tmdl",
    "sample/definition/tables/Sales.tmdl",
  ],
};
/**
 * Anchored at a path segment rather than at the package root: the core ships all of src, so a
 * .env.local or a test folder deeper in the tree has to be caught as well.
 */
export const FORBIDDEN = [
  /(^|\/)test\//,
  /\.test\./,
  /tsbuildinfo$/,
  /(^|\/)\.env/,
  /\.DS_Store$/,
  /(^|\/)node_modules\//,
];

/** Everything wrong with one `npm pack --dry-run --json` result, as a list of messages. */
export function packProblems(packs) {
  const problems = [];
  for (const pack of packs) {
    const required = REQUIRED[pack.name];
    // A renamed package would otherwise be checked against an empty list and pass in silence.
    if (!required) {
      problems.push(
        `${pack.name}: not a package this check knows; add it to REQUIRED or stop packing it`,
      );
      continue;
    }
    const files = new Set(pack.files.map((f) => f.path));
    for (const f of required) if (!files.has(f)) problems.push(`${pack.name}: missing ${f}`);
    for (const f of files)
      if (FORBIDDEN.some((re) => re.test(f))) problems.push(`${pack.name}: must not ship ${f}`);
  }
  if (packs.length !== 2) problems.push(`expected 2 packages, got ${packs.length}`);
  const versions = new Set(packs.map((p) => p.version));
  if (versions.size !== 1) problems.push(`versions differ: ${[...versions].join(", ")}`);
  return problems;
}

function main() {
  const json = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts", "-w", "@pbiplint/core", "-w", "pbiplint"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const packs = JSON.parse(json);
  for (const pack of packs)
    console.log(
      `${pack.name}@${pack.version}: ${pack.entryCount} files, ${(pack.unpackedSize / 1024).toFixed(0)} KB unpacked`,
    );
  const problems = packProblems(packs);
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log("pack contents look right");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/test/check-pack.test.mjs`
Expected: PASS, four tests.

- [ ] **Step 5: Prove the script still runs as a script against the real tarballs**

Run: `npm run build && npm run check:pack`
Expected: two size lines then `pack contents look right`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-pack.mjs scripts/test/check-pack.test.mjs
git commit -m "$(cat <<'MSG'
fix(release): match forbidden paths at any depth and refuse an unknown package

The patterns were anchored at the package root while the core ships all of
src, so a .env.local deeper in the tree would have shipped. A renamed
package was checked against an empty required list and passed in silence.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 18: Tighten the Node floor

**Files:**
- Modify: `packages/core/package.json` (`engines.node`)
- Modify: `packages/cli/package.json` (`engines.node`)
- Test: `packages/core/test/version.test.ts`

**Interfaces:**
- Produces: both published packages declare `"node": "^20.19.0 || >=22.12.0"`, the same range the workspace root declares.

**Background:** `>=20` is wrong for the core, because `require()` of an ESM package resolves only on Node 20.19 or later. Issue #7 names the core; the CLI is bundled and does not hit that resolver, but leaving the three manifests disagreeing is worse than one honest floor. CI's Node 20 leg resolves to the newest 20.x, so the matrix stays green.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/version.test.ts`:

```ts
it("declares the same Node floor as the workspace root, which require() of an ESM package needs", () => {
  const floor = (path: string): string =>
    JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).engines.node;
  // >=20 is not enough: require() of an ESM package resolves only on 20.19 or later.
  expect(floor("../package.json")).toBe("^20.19.0 || >=22.12.0");
  expect(floor("../../cli/package.json")).toBe("^20.19.0 || >=22.12.0");
  expect(floor("../../../package.json")).toBe("^20.19.0 || >=22.12.0");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/core/test/version.test.ts -t "Node floor"`
Expected: FAIL, received `>=20` for the first two.

- [ ] **Step 3: Change both manifests**

In `packages/core/package.json` and `packages/cli/package.json`, replace:

```json
  "engines": {
    "node": ">=20"
  }
```

with:

```json
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/core/test/version.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the local Node still satisfies the new floor**

Run: `node -e "console.log(process.version)"`
Expected: 20.19.0 or later, or 22.12.0 or later. If not, `npm ci` will warn but not fail; note it in the PR.

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json packages/cli/package.json packages/core/test/version.test.ts
git commit -m "$(cat <<'MSG'
chore(release): declare the Node floor the packages actually need

require() of an ESM package resolves only on Node 20.19 or later, so >=20
was a promise neither package could keep. Both now match the root.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 19: Let the fixture byte rules win in `.gitattributes`

**Files:**
- Modify: `.gitattributes`

**Interfaces:**
- Produces: no code change. `git check-attr` reports `text: unset` for a Markdown path under `examples/` or `tests/fixtures/`, and `text: set, eol: lf` for Markdown anywhere else.

**Background:** later lines win in `.gitattributes`, so `*.md text eol=lf` currently overrides `examples/** -text` for a Markdown file in a fixture folder. No such file exists today, which is why nothing has broken. Issue #7 says to move it if that ever happens; moving it now costs nothing and the day it matters is the day nobody is looking.

- [ ] **Step 1: Record what the rules say today**

Run: `git check-attr text eol -- tests/fixtures/demo.md examples/demo.md rules/parse-issue.md`
Expected, measured on 2026-09-17 before the change: all three report `text: set` and `eol: lf`. The first two are the bug; `rules/parse-issue.md` is correct and must stay that way.

- [ ] **Step 2: Reorder the file**

Replace the whole of `.gitattributes` with:

```
# The page generator requires LF frontmatter. Listed first so the two fixture rules below win for
# a Markdown file inside them: a fixture is compared byte for byte and must never be normalised.
*.md text eol=lf

examples/** -text
tests/fixtures/** -text
```

- [ ] **Step 3: Verify**

Run: `git check-attr text eol -- tests/fixtures/demo.md examples/demo.md rules/parse-issue.md`
Expected: `tests/fixtures/demo.md: text: unset` and `eol: unspecified`, the same for `examples/demo.md`, and `rules/parse-issue.md: text: set` with `eol: lf`.

- [ ] **Step 4: Confirm nothing in the working tree changed**

Run: `git status --porcelain && git diff --stat`
Expected: only `.gitattributes` is modified. If any other file shows up, a line ending has changed: stop and investigate before committing.

- [ ] **Step 5: Commit**

```bash
git add .gitattributes
git commit -m "$(cat <<'MSG'
chore: let the fixture byte rules win over Markdown normalisation

Later lines win, so *.md text eol=lf overrode examples/** -text for any
Markdown file in a fixture folder. None exists yet, which is the best time
to fix it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 20: Split the release workflow and drop the checkout credentials

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Produces: two jobs. `verify` runs every check with `contents: read` and no OIDC token. `publish` needs `verify`, and is the only job holding `id-token: write` and `contents: write`. Neither job keeps the checkout's git credential.

**Background:** today one job runs the whole test suite while holding the token npm trusted publishing authenticates with, and leaves a credential in `.git/config` for every step after checkout. Nothing has gone wrong, and nothing here changes what gets published. This cannot be fully proven until the next tag, so Task 22 covers that.

- [ ] **Step 1: Replace the workflow**

Replace the whole of `.github/workflows/release.yml` with:

```yaml
name: Release

on:
  push:
    tags: ["v*"]

# Nothing here: each job asks for exactly what it needs, so the job that runs the test suite never
# holds the OIDC token the publish authenticates with.
permissions: {}

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      # persist-credentials: false, so no git credential is left in .git/config for the steps
      # that follow. Nothing in this job pushes.
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci --ignore-scripts
      - run: node scripts/check-release-tag.mjs "$GITHUB_REF_NAME"
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run check:browser
      - run: npm run build
      - run: npm run check:pack

  publish:
    needs: verify
    runs-on: ubuntu-latest
    permissions:
      contents: write # softprops/action-gh-release creates the release
      id-token: write # npm trusted publishing
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      # Trusted publishing needs npm 11.5.1 or later; Node 22 ships an older npm.
      # npm@11 resolves to the newest 11.x, which satisfies that, and pins the major.
      - run: npm install -g npm@11
      - run: npm ci --ignore-scripts
      - run: npm run build
      # Run again on this job's own tree rather than trusting the verify job's: this is the
      # tarball that ships.
      - run: npm run check:pack
      - run: node scripts/publish.mjs
      - uses: softprops/action-gh-release@efb35369e0ad2afab669f228072c1b0d510eae64 # v3.0.3
        with:
          generate_release_notes: true
```

- [ ] **Step 2: Check it parses and that the steps survived the split**

Run:

```bash
python3 -c "import sys,yaml; d=yaml.safe_load(open('.github/workflows/release.yml')); print(list(d['jobs'])); [print(j, [s.get('run') or s.get('uses') for s in d['jobs'][j]['steps']]) for j in d['jobs']]"
```

Expected: jobs `['verify', 'publish']`, and every `run` line from the old single job appears in one of them, with `node scripts/publish.mjs` and the release action only in `publish`.

- [ ] **Step 3: Lint the workflow if actionlint is available**

Run: `command -v actionlint >/dev/null && actionlint .github/workflows/release.yml || echo "actionlint not installed, skipped"`
Expected: no output from actionlint, or the skip message.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "$(cat <<'MSG'
ci: split release into a verify job and a publish job

The test suite ran holding the OIDC token the publish authenticates with,
and every step after checkout carried a git credential it never used.
Only the publish job asks for id-token now, and neither checkout persists
credentials.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

### Task 21: Protect the `v*` tags with a repository ruleset

**Files:** none. This is a GitHub repository setting.

**Background:** any push of a tag matching `v*` runs the release workflow. A tag that can be deleted and re-pushed at a different commit can therefore re-run a release against different content.

- [ ] **Step 1: Switch to the account that can write to the org**

Run: `gh auth switch --user TheDataPractitioner && gh api repos/pbiplint/pbiplint --jq .permissions`
Expected: `push` and `admin` are true. If they are not, stop: this task needs an account with admin on the repository, and the rest of the plan is unaffected.

- [ ] **Step 2: Create the ruleset**

Run:

```bash
gh api -X POST repos/pbiplint/pbiplint/rulesets --input - <<'JSON'
{
  "name": "tags: protect v* release tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [{ "type": "deletion" }, { "type": "non_fast_forward" }]
}
JSON
```

Expected: a JSON object with an `id` and `"enforcement": "active"`.

- [ ] **Step 3: Confirm it is listed alongside the existing branch ruleset**

Run: `gh api repos/pbiplint/pbiplint/rulesets --jq '.[] | "\(.id) \(.target) \(.name) \(.enforcement)"'`
Expected: two lines, the existing `main: require the CLA check` branch ruleset and the new tag ruleset.

- [ ] **Step 4: Switch the account back**

Run: `gh auth switch --user michaelmckinleyconsulting && gh auth status --active`
Expected: `michaelmckinleyconsulting` is the active account. This matters: ContentStudio depends on it.

- [ ] **Step 5: Note the result in the PR description**

There is no commit for this task. Record the ruleset id in the stage 4 PR body so the change is traceable.

### Task 22: Ship stage 4

- [ ] **Step 1: Run every gate**

Run: `npm run lint && npm run typecheck && npm test && npm run check:browser && npm run build && npm run check:pack`
Expected: all pass, and `npm test` now reports the two scripts test files alongside the package ones.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin release-followups
gh pr create --title "ci: make the release checks honest about what they proved" --body "$(cat <<'MSG'
The last seven boxes from #7. Closes the issue.

- `scripts/publish.mjs` treats a miss as unpublished only when the registry answered 404. A registry that cannot be reached now stops the run instead of falling through to a publish it would reject.
- `scripts/check-pack.mjs` matches forbidden paths at any depth, not only at the package root, which matters because the core ships all of `src`.
- `scripts/check-pack.mjs` fails on a package name it does not know rather than checking it against an empty list.
- Both release scripts now export their decision logic and run their side effects only as a script, so they have tests. `vitest.config.ts` picks up `scripts/test/**/*.test.mjs`.
- `engines.node` on both published packages is `^20.19.0 || >=22.12.0`, matching the root. `>=20` was wrong: `require()` of an ESM package resolves only on 20.19 or later.
- `.gitattributes` lists `*.md text eol=lf` first, so the two fixture `-text` rules win for a Markdown file inside them.
- The release workflow is split: a `verify` job with `contents: read` and no OIDC token, and a `publish` job that needs it and holds `id-token: write`. Neither checkout persists credentials.

Also done, with no commit: a repository ruleset now protects `refs/tags/v*` against deletion and non-fast-forward updates, so a release tag cannot be moved to different content and re-run.

The workflow split cannot be fully proven until the next tag. Watch the first `v0.2.0` run.

Closes #7

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
MSG
)"
```

- [ ] **Step 3: Tick the remaining boxes on issue #7 once the PR merges**

---

## Ticking the boxes on issue #7

The user asked for the checklist to be kept current. Do this after each stage's PR merges, not before: a box means the change is on `main`.

The active `gh` account has read-only access to `pbiplint/pbiplint`, so editing the issue needs the same account switch Task 21 uses.

- [ ] **After each merge:**

```bash
gh auth switch --user TheDataPractitioner
gh issue view 7 --json body --jq .body > /tmp/issue7.md
# Flip only the lines this stage closed, matching on a distinctive phrase from each one:
#   sed -i '' 's/^- \[ \] \(.*Copy Markdown.*\)$/- [x] \1/' /tmp/issue7.md
gh issue edit 7 --body-file /tmp/issue7.md
gh issue view 7 --json body --jq .body | grep -c '^- \[x\]'   # confirm the new count
gh auth switch --user michaelmckinleyconsulting
```

Running count as the stages land: stage 1 takes it to 2 of 18, stage 2 to 7, stage 3 to 11, stage 4 to 18. The stage 4 PR body carries `Closes #7`, so merging it closes the issue; tick the boxes first so the closed issue reads as complete.

## What this plan does not do

- `packages/core/src/engine/rank.ts:65` sorts rule ids with `localeCompare` and no locale, which can order findings differently on different machines. That is the same class of bug as the one Task 11 fixes, but it is not a box on issue #7. Propose it as a new checkbox rather than folding it in.
- Task 9 is beyond issue #7 and is marked optional. Drop it if the stage 2 review would rather keep the branch to the issue.
- The release workflow split (Task 20) is not provable until a tag is pushed. Nothing else in stage 4 depends on it.
