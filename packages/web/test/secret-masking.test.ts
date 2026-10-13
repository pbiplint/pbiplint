// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { fakeSecrets, leaks, SECRETS_FIXTURE } from "../../../tests/support/fake-secrets.js";
import { exportForAssistant, exportJson, exportMarkdown } from "../src/results/export.js";
import { renderResults } from "../src/results/render.js";

// The secret guard (v3 spec, section 11.3) on the site: the results page, both downloads, and the
// copy for an AI assistant, built from a lint of m-zoo as the page runs it.
const secrets = fakeSecrets();
/** m-zoo's files as the page reads a dropped folder: paths relative to the model folder. */
const files: { path: string; text: string }[] = [];
const walk = (d: string): void => {
  for (const e of readdirSync(d, { withFileTypes: true }))
    if (e.isDirectory()) walk(join(d, e.name));
    else
      files.push({
        path: relative(SECRETS_FIXTURE, join(d, e.name)).split("\\").join("/"),
        text: readFileSync(join(d, e.name), "utf8"),
      });
};
walk(SECRETS_FIXTURE);
const result = await lint(files);

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
