import { describe, expect, it } from "vitest";
import { HELP, parseArgs, UsageError } from "../src/args.js";

describe("parseArgs", () => {
  it("defaults to lint with text output", () => {
    expect(parseArgs(["./model"])).toEqual({
      command: "lint",
      path: "./model",
      format: "text",
      sample: false,
    });
  });
  it("reads options in any order", () => {
    expect(
      parseArgs([
        "--format",
        "sarif",
        "./m",
        "--fail-on",
        "warning",
        "--config",
        "c.json",
        "--output",
        "out.sarif",
      ]),
    ).toEqual({
      command: "lint",
      path: "./m",
      format: "sarif",
      failOn: "warning",
      config: "c.json",
      output: "out.sarif",
      sample: false,
    });
    expect(parseArgs(["--format=json", "./m"]).format).toBe("json");
  });
  it("supports the sample, rules, help, and version commands", () => {
    expect(parseArgs(["--sample"])).toMatchObject({ command: "lint", sample: true });
    expect(parseArgs(["rules"]).command).toBe("rules");
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs([]).command).toBe("help");
    expect(() => parseArgs(["--format", "json"])).toThrow(/Give a path or --sample/);
    expect(() => parseArgs(["--rule", "X"])).toThrow(/Give a path or --sample/);
    expect(parseArgs(["--version"]).command).toBe("version");
  });
  it("rejects bad input with a UsageError", () => {
    expect(() => parseArgs(["./m", "--format", "xml"])).toThrow(UsageError);
    expect(() => parseArgs(["./m", "--fail-on", "sometimes"])).toThrow(/--fail-on/);
    expect(() => parseArgs(["./m", "--bogus"])).toThrow(/Unknown option --bogus/);
    expect(() => parseArgs(["a", "b"])).toThrow(/one path/);
    expect(() => parseArgs(["./m", "--sample"])).toThrow(/either/);
  });
  it("takes explain and one rule id, with --format text or json only", () => {
    expect(parseArgs(["explain", "HIDE_FOREIGN_KEYS"])).toEqual({
      command: "explain",
      ruleId: "HIDE_FOREIGN_KEYS",
      format: "text",
      sample: false,
    });
    expect(parseArgs(["--format", "json", "explain", "x"])).toMatchObject({
      command: "explain",
      format: "json",
    });
    expect(() => parseArgs(["explain"])).toThrow(/explain needs a rule id/);
    expect(() => parseArgs(["explain", "a", "b"])).toThrow(/explain takes one rule id/);
    for (const f of ["markdown", "sarif"])
      expect(() => parseArgs(["explain", "x", "--format", f])).toThrow(/text or json/);
    for (const extra of [["--sample"], ["--fail-on", "info"], ["--config", "c.json"], ["-o", "o"]])
      expect(() => parseArgs(["explain", "x", ...extra])).toThrow(/explain takes only --format/);
  });
  it("takes --quiet and repeated --rule, and keeps --quiet to text (#178)", () => {
    expect(parseArgs(["./m", "-q", "--rule", "A", "--rule=b"])).toMatchObject({
      command: "lint",
      quiet: true,
      rules: ["A", "b"],
    });
    expect(parseArgs(["./m", "--quiet", "--format", "text"]).quiet).toBe(true);
    expect(HELP).toMatch(/^--quiet .*\(text only\)$/m);
    expect(HELP).toMatch(/^--rule <RULE_ID> .*\(repeatable\)/m);
    for (const f of ["json", "sarif", "markdown"])
      expect(() => parseArgs(["./m", "--quiet", "--format", f])).toThrow(/--quiet is text only/);
    expect(() => parseArgs(["./m", "--rule"])).toThrow(/--rule needs a value/);
    for (const extra of [["--quiet"], ["--rule", "A"]])
      expect(() => parseArgs(["explain", "x", ...extra])).toThrow(/explain takes only --format/);
  });
  it("lints a folder named explain given as ./explain", () => {
    expect(parseArgs(["./explain"])).toMatchObject({ command: "lint", path: "./explain" });
  });
});
