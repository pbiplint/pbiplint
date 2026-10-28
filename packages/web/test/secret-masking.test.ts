// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defaultRules, lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import {
  fakeSecrets,
  leaks,
  PARSE_SECRETS_FIXTURE,
  SECRETS_FIXTURE,
} from "../../../tests/support/fake-secrets.js";
import { plantedLeakRule } from "../../../tests/support/planted-rule.js";
import { exportForAssistant, exportJson, exportMarkdown } from "../src/results/export.js";
import { renderResults } from "../src/results/render.js";

// The secret guard (v3 spec, section 11.3) on the site: the results page, both downloads, and the
// copy for an AI assistant, built from a lint of m-zoo as the page runs it.
const secrets = fakeSecrets();
/** A fixture's files as the page reads a dropped folder: paths relative to the model folder. */
function folder(root: string): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true }))
      if (e.isDirectory()) walk(join(d, e.name));
      else
        files.push({
          path: relative(root, join(d, e.name)).split("\\").join("/"),
          text: readFileSync(join(d, e.name), "utf8"),
        });
  };
  walk(root);
  return files;
}
const result = await lint(folder(SECRETS_FIXTURE));

describe("the secret guard, on the site (v3 spec, section 11.3)", () => {
  it("lints m-zoo with its credentials reported", () => {
    expect(secrets.length).toBeGreaterThanOrEqual(6);
    expect(
      result.findings.filter((f) => f.ruleId === "HARDCODED_SECRET_IN_QUERY").length,
    ).toBeGreaterThanOrEqual(5);
  });
  it("keeps every part of every value out of the rendered results", () => {
    document.body.innerHTML = '<section id="results"></section>';
    const container = document.getElementById("results")!;
    renderResults(container, result, { source: "m-zoo.SemanticModel" });
    expect(container.textContent).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(container.innerHTML, secrets)).toEqual([]);
  });
  it.each([
    ["the Markdown download", exportMarkdown],
    ["the JSON download", exportJson],
    ["the copy for an AI assistant", exportForAssistant],
  ] as const)("keeps every part of every value out of %s", (_name, exported) => {
    const text = exported(result).text;
    expect(text).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(text, secrets)).toEqual([]);
  });
});

describe("the secret guard, on lines PARSE_ISSUE quotes, on the site (v3 spec, sections 7 and 11.3)", async () => {
  const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
  const parsed = await lint(folder(PARSE_SECRETS_FIXTURE));
  it("keeps every part of every value out of the rendered results", () => {
    expect(planted).toHaveLength(4);
    document.body.innerHTML = '<section id="results"></section>';
    const container = document.getElementById("results")!;
    renderResults(container, parsed, { source: "parse-secrets.SemanticModel" });
    expect(container.textContent).toContain("PARSE_ISSUE");
    expect(leaks(container.innerHTML, planted)).toEqual([]);
  });
  it.each([
    ["the Markdown download", exportMarkdown],
    ["the JSON download", exportJson],
    ["the copy for an AI assistant", exportForAssistant],
  ] as const)("keeps every part of every value out of %s", (_name, exported) => {
    const text = exported(parsed).text;
    expect(text).toContain("PARSE_ISSUE");
    expect(leaks(text, planted)).toEqual([]);
  });
});

describe("the secret guard, on a rule that could not finish, on the site (v3 spec, section 11.3)", async () => {
  // PLANTED_LEAK throws with each query's M as its message, and then with all of it.
  const crashed = await lint(folder(SECRETS_FIXTURE), {
    rules: [...defaultRules, plantedLeakRule()],
  });
  it("keeps every part of every value out of the rendered results", () => {
    document.body.innerHTML = '<section id="results"></section>';
    const container = document.getElementById("results")!;
    renderResults(container, crashed, { source: "m-zoo.SemanticModel" });
    expect(container.textContent).toContain("PLANTED_LEAK");
    expect(leaks(container.innerHTML, secrets)).toEqual([]);
  });
  it.each([
    ["the Markdown download", exportMarkdown],
    ["the JSON download", exportJson],
    ["the copy for an AI assistant", exportForAssistant],
  ] as const)("keeps every part of every value out of %s", (_name, exported) => {
    expect(leaks(exported(crashed).text, secrets)).toEqual([]);
  });
});
