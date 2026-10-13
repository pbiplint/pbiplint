import { describe, expect, it } from "vitest";
import { fakeSecrets, leaks, SECRETS_FIXTURE } from "../../../tests/support/fake-secrets.js";
import { lint } from "../src/engine/lint.js";
import { formatJson, formatMarkdown, formatSarif, formatText } from "../src/format/index.js";
import { readModelFiles } from "./helpers.js";

// The secret guard (v3 spec, section 11.3): m-zoo plants made-up credentials, and no output pbiplint
// writes may hold any part of one. The web and CLI suites hold their own outputs to the same test.
const secrets = fakeSecrets();
const result = await lint(readModelFiles(SECRETS_FIXTURE));

describe("the secret guard, in core (v3 spec, section 11.3)", () => {
  it("reads m-zoo's made-up credentials, so the guard has something to look for", () => {
    expect(secrets.length).toBeGreaterThanOrEqual(6);
    // A whole value, and 8 characters of one with nothing around them, both count.
    expect(leaks("pbiplint-fixture-key-0002-notreal", secrets)).toContain(
      "pbiplint-fixture-key-0002-notreal",
    );
    expect(leaks("…key-0002…", secrets)).toEqual(["key-0002"]);
    expect(leaks("…0002-not…", secrets)).toEqual(["0002-not"]);
    // The prefix and suffix every value shares are not a leak of any one value.
    expect(leaks("pbiplint-fixture- and -notreal", secrets)).toEqual([]);
  });
  it("reports them, so the outputs below carry their findings", () => {
    expect(
      result.findings.filter((f) => f.ruleId === "HARDCODED_SECRET_IN_QUERY").length,
    ).toBeGreaterThanOrEqual(5);
  });
  it("keeps every part of every value out of the result, but for the model it was read from", () => {
    // The result carries the model and project it read, for callers that go on to use them; they
    // hold the M as written, and no output prints them. Everything else is what outputs are made of.
    const { model: _model, project: _project, ...printed } = result;
    expect(leaks(JSON.stringify(printed), secrets)).toEqual([]);
  });
  it.each([
    ["text", formatText],
    ["JSON", formatJson],
    ["Markdown", formatMarkdown],
    ["SARIF", formatSarif],
  ] as const)("keeps every part of every value out of the %s format", (_name, format) => {
    expect(leaks(format(result, { toolVersion: "0.0.0" }), secrets)).toEqual([]);
  });
});
