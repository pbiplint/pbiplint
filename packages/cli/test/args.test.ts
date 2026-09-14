import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "../src/args.js";

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
    expect(parseArgs(["--version"]).command).toBe("version");
  });
  it("rejects bad input with a UsageError", () => {
    expect(() => parseArgs(["./m", "--format", "xml"])).toThrow(UsageError);
    expect(() => parseArgs(["./m", "--fail-on", "sometimes"])).toThrow(/--fail-on/);
    expect(() => parseArgs(["./m", "--bogus"])).toThrow(/Unknown option --bogus/);
    expect(() => parseArgs(["a", "b"])).toThrow(/one path/);
    expect(() => parseArgs(["./m", "--sample"])).toThrow(/either/);
  });
});
