import { describe, expect, it } from "vitest";
import { parseJsonc } from "../src/custom-rules/jsonc.js";
import { LIMITS } from "../src/custom-rules/limits.js";

describe("LIMITS", () => {
  it("holds the limits the plan sets", () => {
    expect(LIMITS).toEqual({
      fileBytes: 1_048_576,
      rulesPerFile: 2_000,
      expressionChars: 20_000,
      nesting: 100,
      patternChars: 4_000,
      patternStates: 10_000,
      stepsPerRule: 20_000_000,
    });
  });
});

describe("parseJsonc", () => {
  it("reads plain JSON", () => {
    expect(parseJsonc('[{"a": 1}]')).toEqual({ value: [{ a: 1 }] });
  });

  it("skips a byte order mark", () => {
    expect(parseJsonc('\uFEFF{"rules": []}')).toEqual({ value: { rules: [] } });
  });

  it("skips line and block comments outside strings", () => {
    const text = [
      "// rules for the sales model",
      "[",
      '  /* the first rule */ { "ID": "R1" }, // after the rule',
      "  /* a block",
      "     over two lines */",
      '  { "ID": "R2" }',
      "] // the end",
    ].join("\n");
    expect(parseJsonc(text)).toEqual({ value: [{ ID: "R1" }, { ID: "R2" }] });
  });

  it("keeps comment markers inside strings", () => {
    expect(parseJsonc('{"url": "https://example.com/a", "note": "/* not a comment */"}')).toEqual({
      value: { url: "https://example.com/a", note: "/* not a comment */" },
    });
  });

  it("keeps an escaped quote inside a string from ending it", () => {
    expect(parseJsonc('["say \\"hi\\" // still text"] // gone')).toEqual({
      value: ['say "hi" // still text'],
    });
  });

  it("reads a line comment that ends the file", () => {
    expect(parseJsonc("[1] // no newline after")).toEqual({ value: [1] });
  });

  it("refuses an unterminated block comment", () => {
    const result = parseJsonc("[1] /* never closed");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/comment/);
  });

  it("refuses text that is not JSON, naming where without quoting it", () => {
    const result = parseJsonc('[\n  {"Expression": "Name.StartsWith(\\"secret\\")",}\n]');
    expect(result).toHaveProperty("error");
    const { error } = result as { error: string };
    expect(error).toMatch(/not valid JSON/);
    expect(error).not.toContain("secret");
  });

  it("refuses a file over the size limit, naming the limit", () => {
    const text = `["${"x".repeat(LIMITS.fileBytes)}"]`;
    const result = parseJsonc(text);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("1,048,576");
  });

  it("counts the size in UTF-8 bytes, not characters", () => {
    // Each é is two bytes: just over half the limit in characters is over it in bytes.
    const text = `["${"é".repeat(LIMITS.fileBytes / 2)}"]`;
    expect(parseJsonc(text)).toHaveProperty("error");
    const under = `["${"é".repeat(LIMITS.fileBytes / 2 - 10)}"]`;
    expect(parseJsonc(under)).toHaveProperty("value");
  });
});
