import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { readModelFiles } from "./helpers.js";

/** One finding as `tests/expectations/pbiplint/m-zoo.json` pins it. */
interface PinnedFinding {
  rule: string;
  objectType: string;
  object: string;
  file: string;
  line: number;
  column?: number;
  detail: string;
}

interface MExpectation {
  fixture: string;
  about: string;
  rules: string[];
  findings: PinnedFinding[];
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const expectation = JSON.parse(
  readFileSync(repoRoot + "tests/expectations/pbiplint/m-zoo.json", "utf8"),
) as MExpectation;

/** pbiplint's own Power Query rules: built in, on the Power Query layer. They have no oracle. */
const ownRules = defaultRules
  .filter((r) => r.status === "builtin" && r.layer === "powerquery")
  .map((r) => r.id)
  .sort();

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** By file, then line, then column, then rule: the order the expectations file is written in. */
const byPlace = (a: PinnedFinding, b: PinnedFinding): number =>
  cmp(a.file, b.file) ||
  a.line - b.line ||
  (a.column ?? 0) - (b.column ?? 0) ||
  cmp(a.rule, b.rule);

describe("pbiplint's own Power Query rules on m-zoo (v3 spec, section 11.1)", () => {
  it("pins every built-in Power Query rule, and no other", () => {
    expect([...expectation.rules].sort()).toEqual(ownRules);
  });
  it("finds exactly the pinned findings", async () => {
    const result = await lint(readModelFiles(repoRoot + expectation.fixture));
    const found = result.findings
      .filter((f) => expectation.rules.includes(f.ruleId))
      .map((f) => ({
        rule: f.ruleId,
        objectType: f.objectType,
        object: f.objectName,
        file: f.location!.file,
        line: f.location!.line,
        ...(f.location!.column === undefined ? {} : { column: f.location!.column }),
        detail: f.detail!,
      }))
      .sort(byPlace);
    expect(found).toEqual([...expectation.findings].sort(byPlace));
  });
  it("is written in place order, so a reader can follow it beside the fixture", () => {
    expect(expectation.findings).toEqual([...expectation.findings].sort(byPlace));
  });
  it("shows every pinned rule firing at least once, so m-zoo holds a shape for each", () => {
    for (const id of expectation.rules)
      expect(
        expectation.findings.some((f) => f.rule === id),
        id,
      ).toBe(true);
  });
});
