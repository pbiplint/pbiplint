import { describe, expect, it } from "vitest";
import {
  fakeSecrets,
  leaks,
  PARSE_SECRETS_FIXTURE,
  SECRETS_FIXTURE,
} from "../../../tests/support/fake-secrets.js";
import { plantedLeakRule } from "../../../tests/support/planted-rule.js";
import { lint } from "../src/engine/lint.js";
import { formatJson, formatMarkdown, formatSarif, formatText } from "../src/format/index.js";
import { defaultRules } from "../src/rules/index.js";
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

describe("the secret guard, on lines PARSE_ISSUE quotes (v3 spec, sections 7 and 11.3)", async () => {
  const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
  const parsed = await lint(readModelFiles(PARSE_SECRETS_FIXTURE));
  it("reads the fixture's every value, and quotes every line with its literals and comments hidden", () => {
    expect(planted.map((v) => v.split("-")[2])).toEqual(["key", "key", "pwd", "token"]);
    expect(parsed.findings.filter((f) => f.ruleId === "PARSE_ISSUE").map((f) => f.detail)).toEqual([
      "space indentation (TMDL requires tabs): measure 'Legacy Query' = \"…",
      "space indentation (TMDL requires tabs): …",
      'space indentation (TMDL requires tabs): …"',
      "space indentation (TMDL requires tabs): measure 'Service Token' = \"…\"",
      expect.stringMatching(
        /^M could not be parsed: .*: Source = Web\.Contents\("…", \[Headers = \[#"x-api-key" = ApiKey\]\]\)\), \/\/…$/,
      ),
      expect.stringMatching(
        /^M could not be parsed: .*: Source = Web\.Contents\("…", \[Headers = \[#"x-api-key" = "…"\]\]\)\),$/,
      ),
    ]);
  });
  it.each([
    ["text", formatText],
    ["JSON", formatJson],
    ["Markdown", formatMarkdown],
    ["SARIF", formatSarif],
  ] as const)("keeps every part of every value out of the %s format", (_name, format) => {
    expect(leaks(format(parsed, { toolVersion: "0.0.0" }), planted)).toEqual([]);
  });
});

describe("the secret guard, on a rule that could not finish (v3 spec, section 11.3)", async () => {
  // PLANTED_LEAK throws with each query's M as its message, and then with all of it, so every
  // made-up credential is in a thrown message; none may reach the result or a format.
  const crashed = await lint(readModelFiles(SECRETS_FIXTURE), {
    rules: [...defaultRules, plantedLeakRule()],
  });
  it("records the planted rule's errors, one per query and one for the whole throw", () => {
    expect(
      crashed.summary.ruleErrors.filter((e) => e.id === "PLANTED_LEAK").length,
    ).toBeGreaterThan(1);
  });
  it("keeps every part of every value out of the result, but for the model it was read from", () => {
    const { model: _m, project: _p, ...printed } = crashed;
    expect(leaks(JSON.stringify(printed), secrets)).toEqual([]);
  });
  it.each([
    ["text", formatText],
    ["JSON", formatJson],
    ["Markdown", formatMarkdown],
    ["SARIF", formatSarif],
  ] as const)("keeps every part of every value out of the %s format", (_name, format) => {
    expect(leaks(format(crashed, { toolVersion: "0.0.0" }), secrets)).toEqual([]);
  });
});
