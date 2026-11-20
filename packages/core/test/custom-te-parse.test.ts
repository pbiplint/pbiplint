import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJsonc } from "../src/custom-rules/jsonc.js";
import { LIMITS } from "../src/custom-rules/limits.js";
import type { TeExpr, TeTypeRef } from "../src/custom-rules/te/ast.js";
import { parseTeExpression } from "../src/custom-rules/te/parser.js";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";

const repo = new URL("../../../", import.meta.url).pathname;
const probesDir = `${repo}tests/rules/te-probes/`;
const capture = JSON.parse(
  readFileSync(`${repo}tests/expectations/custom-rules/probes/custom-rules.json`, "utf8"),
) as { results: Record<string, { ruleErrors?: Record<string, string> }> };

/** Parses or fails the test with the parser's message. */
const tree = (text: string): TeExpr => {
  const r = parseTeExpression(text);
  if ("error" in r) throw new Error(`did not parse: ${r.error}`);
  return r.expr;
};
const error = (text: string): string => {
  const r = parseTeExpression(text);
  if (!("error" in r)) throw new Error(`parsed: ${show(r.expr)}`);
  return r.error;
};

/** A compact prefix form of a tree, so a test can state a shape in one line. */
function show(e: TeExpr | TeTypeRef | null): string {
  if (e === null) return "_";
  switch (e.kind) {
    case "literal":
      if (e.type === "string") return JSON.stringify(e.value);
      if (e.type === "char") return `'${e.value}'`;
      if (e.type === "number") return `${e.text}:${e.numberKind}`;
      return String(e.value);
    case "ident":
      return e.name;
    case "scope":
      return e.which;
    case "type":
      return `<${e.name}>`;
    case "member":
      return `${show(e.target)}.${e.name}`;
    case "call":
      return `${show(e.target)}.${e.name}(${e.args.map(show).join(", ")})`;
    case "lambdaBody":
      return `{${show(e.body)}}`;
    case "index":
      return `${show(e.target)}[${e.args.map(show).join(", ")}]`;
    case "convert":
      return `${show(e.type)}(${e.args.map(show).join(", ")})`;
    case "unary":
      return `(${e.op} ${show(e.operand)})`;
    case "binary":
      return `(${e.op} ${show(e.left)} ${show(e.right)})`;
    case "conditional":
      return `(${e.form} ${show(e.test)} ${show(e.then)} ${show(e.else)})`;
    case "paren":
      return show(e.expr);
  }
}
const shape = (text: string) => show(tree(text));

describe("precedence", () => {
  it("and binds tighter than or", () => {
    expect(shape("a or b and c")).toBe("(or a (and b c))");
    expect(shape("a and b or c")).toBe("(or (and a b) c)");
  });
  it("not binds tighter than or (the probe's answer)", () => {
    expect(shape("not true or true")).toBe("(or (not true) true)");
  });
  it("keeps equality and ordering at one level, as Dynamic LINQ does, under additive and multiplicative", () => {
    expect(shape("a = b < c")).toBe("(lt (eq a b) c)");
    expect(shape("a < b <> c")).toBe("(ne (lt a b) c)");
    expect(shape("a < b + c")).toBe("(lt a (add b c))");
    expect(shape("a + b * c")).toBe("(add a (mul b c))");
    expect(shape("-a * b")).toBe("(mul (negate a) b)");
    expect(shape("a - b - c")).toBe("(sub (sub a b) c)");
  });
  it("keeps the conditional operator lowest and right to left", () => {
    expect(shape("a or b ? c : d ? e : f")).toBe("(?: (or a b) c (?: d e f))");
    expect(shape("a ?? b or c")).toBe("(coalesce a (or b c))");
  });
  it("keeps parentheses as a node and overrides precedence", () => {
    const e = tree("(a or b) and c");
    expect(show(e)).toBe("(and (or a b) c)");
    expect(e.kind === "binary" && e.left.kind).toBe("paren");
  });
});

describe("operator spellings", () => {
  it.each([
    ["a or b", "or"],
    ["a || b", "or"],
    ["a OR b", "or"],
    ["a and b", "and"],
    ["a && b", "and"],
    ["a And b", "and"],
    ["a = b", "eq"],
    ["a == b", "eq"],
    ["a != b", "ne"],
    ["a <> b", "ne"],
    ["a < b", "lt"],
    ["a > b", "gt"],
    ["a <= b", "le"],
    ["a >= b", "ge"],
    ["a + b", "add"],
    ["a - b", "sub"],
    ["a & b", "concat"],
    ["a * b", "mul"],
    ["a / b", "div"],
    ["a % b", "mod"],
    ["a mod b", "mod"],
    ["a MOD b", "mod"],
    ["a ?? b", "coalesce"],
  ])("%s", (text, op) => {
    const e = tree(text);
    expect(e.kind === "binary" && e.op).toBe(op);
  });
  it("keeps the spelling as written for messages", () => {
    const e = tree("a <> b");
    expect(e.kind === "binary" && e.spelling).toBe("<>");
  });
  it.each([
    ["not a", "not"],
    ["NOT a", "not"],
    ["!a", "not"],
    ["! a", "not"],
    ["-a", "negate"],
  ])("unary %s", (text, op) => {
    const e = tree(text);
    expect(e.kind === "unary" && e.op).toBe(op);
  });
  it("reads the probe that uses every spelling at once", () => {
    expect(shape("1 <> 2 and 1 != 2 && !false || false")).toBe(
      "(or (and (and (ne 1:int 2:int) (ne 1:int 2:int)) (not false)) false)",
    );
  });
});

describe("literals", () => {
  it.each([
    ["7", "7:int"],
    ["2147483647", "2147483647:int"],
    ["2147483648", "2147483648:uint"],
    ["4294967296", "4294967296:long"],
    ["9223372036854775808", "9223372036854775808:ulong"],
    ["7L", "7:long"],
    ["7l", "7:long"],
    ["7U", "7:uint"],
    ["7UL", "7:ulong"],
    ["7LU", "7:ulong"],
    ["0.3", "0.3:double"],
    ["1e10", "1e10:double"],
    ["1.5E-3", "1.5E-3:double"],
    ["2.5D", "2.5:double"],
    ["2.5F", "2.5:float"],
    ["2.5M", "2.5:decimal"],
    ["2.5m", "2.5:decimal"],
    ["3M", "3:decimal"],
  ])("number %s", (text, want) => {
    expect(shape(text)).toBe(want);
  });
  it("gives each number its value and its digits as written", () => {
    const e = tree("12345678901L");
    expect(e).toMatchObject({
      kind: "literal",
      type: "number",
      value: 12345678901,
      text: "12345678901",
    });
  });
  it("refuses an integer past UInt64 and a suffix that does not fit", () => {
    expect(error("18446744073709551616")).toMatch(/too large.*character 1/);
    expect(error("2.5L")).toMatch(/character 1/);
    expect(error("7Q")).toMatch(/character 2/);
  });
  it("reads an integer followed by a member as the integer, then the member", () => {
    expect(shape("1.ToString()")).toBe("1:int.ToString()");
  });
  it("reads booleans and null in any case", () => {
    expect(shape("true")).toBe("true");
    expect(shape("TRUE")).toBe("true");
    expect(shape("False")).toBe("false");
    expect(shape("NULL")).toBe("null");
  });
  it("reads a double-quoted string", () => {
    expect(tree('"Sales"')).toMatchObject({ kind: "literal", type: "string", value: "Sales" });
  });
  it("reads a doubled quote as one quote", () => {
    expect(tree('"a""b"')).toMatchObject({ value: 'a"b' });
    expect(tree('"Name=""APPROVED"""')).toMatchObject({ value: 'Name="APPROVED"' });
  });
  it("has no backslash escapes", () => {
    expect(tree('"a\\\\b"')).toMatchObject({ value: "a\\\\b" });
    expect(tree('"a\\nb"')).toMatchObject({ value: "a\\nb" });
    expect(tree('"\\]\\s*"')).toMatchObject({ value: "\\]\\s*" });
    expect(tree('"\\\'*"')).toMatchObject({ value: "\\'*" });
  });
  it("ends a string at a backslash then quote, so the rest is left over", () => {
    expect(error('"a\\"b".Length == 3')).toMatch(/character/);
  });
  it("refuses a string with no closing quote, naming where it starts", () => {
    expect(error('Name == "abc')).toMatch(/not closed.*character 9/);
  });
  it("reads a single-quoted literal as a char of exactly one character", () => {
    expect(tree("' '")).toMatchObject({ kind: "literal", type: "char", value: " " });
    expect(tree("''''")).toMatchObject({ type: "char", value: "'" });
    expect(error("'ab'.Length == 2")).toMatch(/exactly one character.*character 1/);
    expect(error("''")).toMatch(/exactly one character/);
  });
  it("keeps source offsets on every node", () => {
    const e = tree('Name == "x"');
    expect(e).toMatchObject({ start: 0, end: 11 });
    expect(e.kind === "binary" && [e.left.start, e.left.end, e.right.start, e.right.end]).toEqual([
      0, 4, 8, 11,
    ]);
  });
});

describe("names", () => {
  it("reads it, outerIt and current in any case, and $ as it", () => {
    expect(shape("it")).toBe("it");
    expect(shape("It.Name")).toBe("it.Name");
    expect(shape("$.Name")).toBe("it.Name");
    expect(shape("outerIt.Name")).toBe("outerIt.Name");
    expect(shape("outerit.Table.Name")).toBe("outerIt.Table.Name");
    expect(shape("OuterIt.Name")).toBe("outerIt.Name");
    expect(shape("current.Name == Name")).toBe("(eq current.Name Name)");
  });
  it("keeps an identifier's case as written", () => {
    expect(tree("isHidden")).toMatchObject({ kind: "ident", name: "isHidden" });
  });
  it("reads @ before a keyword as a plain name", () => {
    expect(tree("@true")).toMatchObject({ kind: "ident", name: "true" });
    expect(tree("@")).toMatchObject({ kind: "ident", name: "@" });
  });
  it("reads an enum member as a member of the enum's name", () => {
    expect(shape("DataType == DataType.Int64")).toBe("(eq DataType DataType.Int64)");
    expect(shape("CrossFilteringBehavior.BothDirections")).toBe(
      "CrossFilteringBehavior.BothDirections",
    );
    expect(shape("DataType.ToString()")).toBe("DataType.ToString()");
  });
  it("refuses a bare .NET type name, as Dynamic LINQ does", () => {
    expect(error("Tables.Any(Columns.Any(DataType == Int64))")).toMatch(
      /'\.' or '\(' after the type name 'Int64' at character 36/,
    );
  });
});

describe("calls and members", () => {
  it("reads a static call on a type name in any case", () => {
    expect(shape("string.IsNullOrWhitespace(Name)")).toBe("<String>.IsNullOrWhitespace(Name)");
    expect(shape('RegEx.IsMatch(Expression, "x")')).toBe('<Regex>.IsMatch(Expression, "x")');
    expect(shape('Regex.IsMatch(Expression, "x")')).toBe('<Regex>.IsMatch(Expression, "x")');
    expect(shape("char.IsWhiteSpace(it)")).toBe("<Char>.IsWhiteSpace(it)");
    expect(shape('Convert.ToInt64(GetAnnotation("x"))')).toBe(
      '<Convert>.ToInt64(_.GetAnnotation("x"))',
    );
    expect(shape("Math.Max(1, 2.5)")).toBe("<Math>.Max(1:int, 2.5:double)");
    expect(shape("StringComparison.OrdinalIgnoreCase")).toBe(
      "<StringComparison>.OrdinalIgnoreCase",
    );
    expect(shape("Int32.MaxValue")).toBe("<Int32>.MaxValue");
  });
  it("keeps the type name as written beside its .NET name", () => {
    const e = tree("string.IsNullOrEmpty(Name)");
    expect(e.kind === "call" && e.target).toMatchObject({
      kind: "type",
      name: "String",
      written: "string",
    });
  });
  it("reads a type name followed by parentheses as a conversion", () => {
    expect(shape("Name.IndexOf(char(9)) > -1")).toBe(
      "(gt Name.IndexOf(<Char>(9:int)) (negate 1:int))",
    );
  });
  it("reads a call with no receiver as a call on it", () => {
    expect(shape("Tokenize().Any(Type = SINGLE_LINE_COMMENT)")).toBe(
      "_.Tokenize().Any({(eq Type SINGLE_LINE_COMMENT)})",
    );
  });
  it("reads Count both as a property and as a method", () => {
    expect(shape("Tables.Count > 0")).toBe("(gt Tables.Count 0:int)");
    expect(shape("Tables.Count() > 0")).toBe("(gt Tables.Count() 0:int)");
  });
  it("reads indexers", () => {
    expect(shape("Partitions[0].Name <> Name")).toBe("(ne Partitions[0:int].Name Name)");
    expect(shape("Model.Tables.Any(InPerspective[current.Name]) == false")).toBe(
      "(eq Model.Tables.Any({InPerspective[current.Name]}) false)",
    );
  });
  it("marks a collection method's argument as a lambda body, ignoring case", () => {
    const e = tree("Columns.Any(IsHidden)");
    expect(e.kind === "call" && e.args[0]?.kind).toBe("lambdaBody");
    expect(shape("Columns.any(IsHidden)")).toBe("Columns.any({IsHidden})");
    for (const m of ["All", "Where", "Count", "Select", "First", "Sum", "Max", "Min", "OrderBy"]) {
      expect(shape(`Columns.${m}(x)`)).toBe(`Columns.${m}({x})`);
    }
  });
  it("leaves other methods' arguments as values", () => {
    expect(shape('Name.Contains("x")')).toBe('Name.Contains("x")');
    expect(shape('Name.IndexOf("Date", "OrdinalIgnoreCase")')).toBe(
      'Name.IndexOf("Date", "OrdinalIgnoreCase")',
    );
    expect(shape("Math.Max(a, b)")).toBe("<Math>.Max(a, b)");
  });
  it("nests lambda bodies, with outerIt inside", () => {
    expect(shape("Tables.Any(Columns.Any(outerIt.Columns.Count() > 0))")).toBe(
      "Tables.Any({Columns.Any({(gt outerIt.Columns.Count() 0:int)})})",
    );
  });
  it("reads iif as a conditional and wants three arguments", () => {
    expect(shape("iif(true, 1, 2) == 1")).toBe("(eq (iif true 1:int 2:int) 1:int)");
    expect(shape("IIF(a, b, c)")).toBe("(iif a b c)");
    expect(error("iif(a, b)")).toMatch(/three/);
  });
  it("refuses a named lambda parameter at the arrow", () => {
    expect(error("Columns.Any(c => c.IsHidden)")).toMatch(/character 15/);
  });
});

describe("errors", () => {
  it("names the position and what was expected, quoting at most one token", () => {
    expect(error("Name ==")).toBe(
      "expected an expression at character 8, found the end of the expression",
    );
    expect(error("(a or b")).toBe("expected ')' at character 8, found the end of the expression");
    expect(error("Tokenize().Any(Type = NOT)")).toMatch(
      /expected an expression at character 26, found '\)'/,
    );
    expect(error("a b")).toBe(
      "expected an operator or the end of the expression at character 3, found 'b'",
    );
    expect(error("Name.")).toMatch(/expected a member name at character 6/);
    expect(error("a ? b")).toMatch(/expected ':' at character 6/);
    expect(error("")).toBe(
      "expected an expression at character 1, found the end of the expression",
    );
  });
  it("refuses a character the language has no use for", () => {
    expect(error("Name \\ x")).toBe("unexpected character '\\' at character 6");
    expect(error("a # b")).toMatch(/'#' at character 3/);
  });
  it("never quotes a string's contents or a long name in full", () => {
    const secret = "x".repeat(200);
    expect(error(`a "${secret}"`)).not.toContain(secret);
    expect(error(`a ${secret}`).length).toBeLessThan(120);
  });
  it("refuses an expression over the length limit", () => {
    const long = "a or ".repeat(LIMITS.expressionChars / 5) + "a";
    expect(error(long)).toMatch(/20,000 characters/);
  });
  it("refuses nesting over the limit cleanly, even 10,000 deep", () => {
    const ok = "(".repeat(LIMITS.nesting - 1) + "a" + ")".repeat(LIMITS.nesting - 1);
    expect(shape(ok)).toBe("a");
    // 10,000 open parentheses (closing them all would pass the length limit first).
    expect(error("(".repeat(10_000) + "a")).toMatch(
      /nests deeper than 100 levels at character 101/,
    );
    expect(error("(".repeat(9_999) + "a" + ")".repeat(9_999))).toMatch(
      /nests deeper than 100 levels/,
    );
    expect(error("not ".repeat(4_000) + "a")).toMatch(/nests deeper than 100 levels/);
    expect(error("f(".repeat(5_000) + ")".repeat(5_000))).toMatch(/nests deeper than 100 levels/);
    expect(error("-".repeat(5_000) + "a")).toMatch(/nests deeper than 100 levels/);
  });
});

describe("the corpus", () => {
  it("parses every expression in Microsoft's ruleset", () => {
    const failed = BPA_RULES.flatMap((r) => {
      const p = parseTeExpression(r.expression);
      return "error" in p ? [`${r.id}: ${p.error}`] : [];
    });
    expect(failed).toEqual([]);
    expect(BPA_RULES.length).toBeGreaterThan(50);
  });

  /** Tabular Editor's messages that come from parsing, before any type is known. */
  const PARSE_MESSAGES = [
    "'.' or '(' expected",
    "Expression of type 'Boolean' expected",
    "Character literal must contain exactly one character",
    "Expression expected",
  ];
  const files = readdirSync(probesDir).filter((f) => f.endsWith(".json"));

  it.each(files)("parses or refuses each probe in %s as Tabular Editor did", (file) => {
    const read = parseJsonc(readFileSync(`${probesDir}${file}`, "utf8"));
    if (!("value" in read)) throw new Error(read.error);
    const v = read.value as unknown;
    const rules = (Array.isArray(v) ? v : (v as { rules: unknown[] }).rules) as Record<
      string,
      unknown
    >[];
    const errors = capture.results[file]?.ruleErrors ?? {};
    const want: string[] = [];
    const got: string[] = [];
    for (const r of rules) {
      const key = (k: string) => Object.keys(r).find((x) => x.toLowerCase() === k);
      const id = String(r[key("id")!]);
      const expression = String(r[key("expression")!]);
      const message = errors[id];
      if (message !== undefined && PARSE_MESSAGES.includes(message)) want.push(id);
      if ("error" in parseTeExpression(expression)) got.push(id);
    }
    expect(got).toEqual(want);
  });

  it("refuses exactly the four semantics probes Tabular Editor could not parse", () => {
    const errors = capture.results["semantics.json"]?.ruleErrors ?? {};
    const parseFailures = Object.keys(errors).filter((id) => PARSE_MESSAGES.includes(errors[id]!));
    expect(parseFailures.sort()).toEqual([
      "PROBE_ENUM_BARE",
      "PROBE_STRING_ESCAPED_QUOTE",
      "PROBE_STRING_SINGLE_QUOTED",
      "PROBE_TOKEN_NOT",
    ]);
  });
});
