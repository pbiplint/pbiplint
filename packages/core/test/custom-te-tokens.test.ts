import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKEN_TYPES, teTokens, tokenTypeCode } from "../src/custom-rules/te/tokens.js";

const repo = new URL("../../../", import.meta.url).pathname;
const types = (dax: string): string[] => teTokens(dax).map((t) => t.Type);
const pairs = (dax: string): string[] => teTokens(dax).map((t) => `${t.Type}:${t.Text}`);

describe("teTokens", () => {
  it("keeps whitespace as tokens between the tokens pbiplint's tokenizer reads", () => {
    expect(pairs("[Total Amount] / 2")).toEqual([
      "COLUMN_OR_MEASURE:[Total Amount]",
      "WHITESPACES: ",
      "DIV:/",
      "WHITESPACES: ",
      "INTEGER_LITERAL:2",
    ]);
  });

  it("gives Next as the next token that is not whitespace or a comment, and null after the last", () => {
    const tokens = teTokens("[Total Amount] / 2 ");
    const div = tokens.find((t) => t.Type === "DIV")!;
    expect(div.Next?.Type).toBe("INTEGER_LITERAL");
    expect(tokens.at(-1)!.Type).toBe("WHITESPACES");
    expect(tokens.at(-1)!.Next).toBeNull();
    expect(tokens.find((t) => t.Type === "INTEGER_LITERAL")!.Next).toBeNull();
    expect(tokens[0]!.Next).toBe(div);
  });

  it("turns each of the three comment forms into a token", () => {
    expect(pairs("/* a / b */ [Total Amount]")).toEqual([
      "DELIMITED_COMMENT:/* a / b */",
      "WHITESPACES: ",
      "COLUMN_OR_MEASURE:[Total Amount]",
    ]);
    expect(pairs("// amount / quantity\n[Total Amount]")).toEqual([
      "SINGLE_LINE_COMMENT:// amount / quantity",
      "WHITESPACES:\n",
      "COLUMN_OR_MEASURE:[Total Amount]",
    ]);
    expect(types("1 -- note\n+ 2")).toEqual([
      "INTEGER_LITERAL",
      "WHITESPACES",
      "SINGLE_LINE_COMMENT",
      "WHITESPACES",
      "PLUS",
      "WHITESPACES",
      "INTEGER_LITERAL",
    ]);
  });

  it("gives a string literal's text without its quotes, a doubled quote undone", () => {
    expect(pairs('"per unit / per order"')).toEqual(["STRING_LITERAL:per unit / per order"]);
    expect(pairs('"a""b"')).toEqual(['STRING_LITERAL:a"b']);
  });

  it("tells a quoted table from an unquoted name, and reads dates and numbers", () => {
    expect(pairs("SUM(Orders[Amount]) + COUNTROWS('Order Lines')")).toEqual([
      "SUM:SUM",
      "OPEN_PARENS:(",
      "TABLE_OR_VARIABLE:Orders",
      "COLUMN_OR_MEASURE:[Amount]",
      "CLOSE_PARENS:)",
      "WHITESPACES: ",
      "PLUS:+",
      "WHITESPACES: ",
      "COUNTROWS:COUNTROWS",
      "OPEN_PARENS:(",
      "TABLE:'Order Lines'",
      "CLOSE_PARENS:)",
    ]);
    expect(types('0.1 1e3 .5 12 dt"2025-06-30"').filter((t) => t !== "WHITESPACES")).toEqual([
      "REAL_LITERAL",
      "REAL_LITERAL",
      "REAL_LITERAL",
      "INTEGER_LITERAL",
      "DATE_LITERAL",
    ]);
  });

  it("gives keywords and function names their own types, in any case", () => {
    const dax = "VAR x = divide(1, 2) RETURN IF(x IN {1}, Calculate(BLANK()), x)";
    expect(types(dax).filter((t) => t !== "WHITESPACES")).toEqual([
      "VAR",
      "TABLE_OR_VARIABLE",
      "EQ",
      "DIVIDE",
      "OPEN_PARENS",
      "INTEGER_LITERAL",
      "COMMA",
      "INTEGER_LITERAL",
      "CLOSE_PARENS",
      "RETURN",
      "IF",
      "OPEN_PARENS",
      "TABLE_OR_VARIABLE",
      "IN",
      "OPEN_CURLY",
      "INTEGER_LITERAL",
      "CLOSE_CURLY",
      "COMMA",
      "CALCULATE",
      "OPEN_PARENS",
      "BLANK",
      "OPEN_PARENS",
      "CLOSE_PARENS",
      "CLOSE_PARENS",
      "COMMA",
      "TABLE_OR_VARIABLE",
      "CLOSE_PARENS",
    ]);
  });

  it("names every operator", () => {
    expect(
      types("1+2-3*4/5^6&7<8>9<=1>=2<>3&&4||5=6==7").filter((t) => t !== "INTEGER_LITERAL"),
    ).toEqual([
      "PLUS",
      "MINUS",
      "STAR",
      "DIV",
      "CARET",
      "AMP",
      "LT",
      "GT",
      "OP_LE",
      "OP_GE",
      "OP_NE",
      "OP_AND",
      "OP_OR",
      "EQ",
      "EQ",
    ]);
    expect(types("(x : y) => x")).toEqual([
      "OPEN_PARENS",
      "TABLE_OR_VARIABLE",
      "WHITESPACES",
      "COLON",
      "WHITESPACES",
      "TABLE_OR_VARIABLE",
      "CLOSE_PARENS",
      "WHITESPACES",
      "LAMBDA",
      "WHITESPACES",
      "TABLE_OR_VARIABLE",
    ]);
  });

  it("gives nothing for an empty expression", () => {
    expect(teTokens("")).toEqual([]);
    expect(types("  ")).toEqual(["WHITESPACES"]);
  });
});

describe("TOKEN_TYPES", () => {
  interface Capture {
    results: Record<string, { ruleErrors?: Record<string, string>; quiet?: string[] }>;
  }
  const capture = JSON.parse(
    readFileSync(`${repo}tests/expectations/custom-rules/probes/custom-rules.json`, "utf8"),
  ) as Capture;
  const probes = JSON.parse(
    readFileSync(`${repo}tests/rules/te-probes/semantics.json`, "utf8"),
  ) as { ID: string; Expression: string }[];
  const semantics = capture.results["semantics.json"]!;
  /** The names a `Tokenize().Any(Type = NAME)` probe asked about. */
  const asked = probes.flatMap((p) => {
    const m = /^Tokenize\(\)\.Any\(Type = ([A-Z_]+)\)$/.exec(p.Expression);
    return m ? [{ id: p.ID, name: m[1]! }] : [];
  });

  it("holds every name Tabular Editor CLI 0.8.1.1 knows, and none it refused", () => {
    expect(asked.length).toBeGreaterThan(50);
    for (const { id, name } of asked) {
      const refused = semantics.ruleErrors?.[id] !== undefined;
      // TRUE and NOT clash with the rule language's own words, so no rule can name them.
      if (name === "TRUE" || name === "NOT") continue;
      expect(TOKEN_TYPES.includes(name), name).toBe(!refused);
    }
  });

  it("gives each name a code, matched without regard to case", () => {
    expect(tokenTypeCode("DIV")).toBe(TOKEN_TYPES.indexOf("DIV"));
    expect(tokenTypeCode("div")).toBe(TOKEN_TYPES.indexOf("DIV"));
    expect(tokenTypeCode("ASSIGNMENT")).toBeUndefined();
    expect(new Set(TOKEN_TYPES).size).toBe(TOKEN_TYPES.length);
  });
});
