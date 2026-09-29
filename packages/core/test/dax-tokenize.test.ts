import { describe, expect, it } from "vitest";
import { daxVariables, tokenizeDax, variableAt } from "../src/dax/tokenize.js";

const kinds = (dax: string): string[] => tokenizeDax(dax).map((t) => `${t.kind}:${t.text}`);

describe("tokenizeDax", () => {
  it("reads each kind of token", () => {
    expect(
      kinds(`CALCULATE([Total], 'Date'[Year] = 2025, dt"2025-06-30", "a""b", .5, 1.5e3)`),
    ).toEqual([
      "identifier:CALCULATE",
      "punctuation:(",
      "column:Total",
      "punctuation:,",
      "table:Date",
      "column:Year",
      "operator:=",
      "number:2025",
      "punctuation:,",
      "date:2025-06-30",
      "punctuation:,",
      'string:a"b',
      "punctuation:,",
      "number:.5",
      "punctuation:,",
      "number:1.5e3",
      "punctuation:)",
    ]);
  });

  it("drops comments of all three forms", () => {
    expect(kinds("1 // 2020\n+ 2 -- 2021\n/* 2022\n */ + 3")).toEqual([
      "number:1",
      "operator:+",
      "number:2",
      "operator:+",
      "number:3",
    ]);
  });

  it("undoes a doubled quote in a table name and a doubled bracket in a column name", () => {
    expect(kinds("'Bob''s'[a]]b]")).toEqual(["table:Bob's", "column:a]b"]);
  });

  it("reads dt as a typed date's prefix only where no letter or digit comes before it", () => {
    expect(kinds('DT"2025-01-01" + Adt"x" + 2dt"y"')).toEqual([
      "date:2025-01-01",
      "operator:+",
      "identifier:Adt",
      "string:x",
      "operator:+",
      "number:2",
      "identifier:dt",
      "string:y",
    ]);
  });

  it("reads dotted and non-Latin identifiers", () => {
    expect(kinds("PERCENTILE.INC(Año, _x1)")).toEqual([
      "identifier:PERCENTILE.INC",
      "punctuation:(",
      "identifier:Año",
      "punctuation:,",
      "identifier:_x1",
      "punctuation:)",
    ]);
  });

  it("reads each operator, the longest first", () => {
    const ops = ["==", "<>", "<=", ">=", "&&", "||", "=", "<", ">", "+", "-", "*", "/", "^", "&"];
    expect(
      kinds("a == b <> c <= d >= e && f || g = h < i > j + k - l * m / n ^ o & p").filter((k) =>
        k.startsWith("operator:"),
      ),
    ).toEqual(ops.map((o) => `operator:${o}`));
  });

  it("gives each token its offsets into the expression", () => {
    const year = tokenizeDax("x = 2025")[2]!;
    expect([year.start, year.end]).toEqual([4, 8]);
    const name = tokenizeDax(`  'Sales'[Year]`)[0]!;
    expect([name.start, name.end]).toEqual([2, 9]);
  });

  it("matches brackets and records each token's depth, bracket, argument, and call", () => {
    // 0 DATE 1 ( 2 2025 3 , 4 { 5 1 6 , 7 2 8 } 9 , 10 MAX 11 ( 12 x 13 ) 14 )
    const t = tokenizeDax("DATE(2025, {1, 2}, MAX(x))");
    expect(t[1]).toMatchObject({ call: "DATE", close: 14, depth: 0 });
    expect(t[2]).toMatchObject({ parent: 1, arg: 0, depth: 1 });
    expect(t[4]).toMatchObject({ parent: 1, arg: 1, close: 8, depth: 1 });
    expect(t[4]!.call).toBeUndefined();
    expect(t[7]).toMatchObject({ parent: 4, arg: 1, depth: 2 });
    expect(t[8]).toMatchObject({ open: 4, parent: 1, arg: 1, depth: 1 });
    expect(t[11]).toMatchObject({ call: "MAX", parent: 1, arg: 2, close: 13, depth: 1 });
    expect(t[12]).toMatchObject({ parent: 11, arg: 0, depth: 2 });
    expect(t[14]).toMatchObject({ open: 1, depth: 0 });
    expect(t[14]!.parent).toBeUndefined();
  });

  it("never throws on text left open or brackets that do not match", () => {
    for (const dax of ['"open', "'open", "[open", "/* open", "a)", "((", "{)", 'dt"2025', "😀"])
      expect(() => tokenizeDax(dax), dax).not.toThrow();
    expect(kinds('"open')).toEqual(["string:open"]);
    expect(kinds("[open")).toEqual(["column:open"]);
    const stray = tokenizeDax("a)")[1]!;
    expect(stray).toMatchObject({ kind: "punctuation", text: ")", depth: 0 });
    expect(stray.open).toBeUndefined();
    expect(tokenizeDax("((")[0]!.close).toBeUndefined();
  });
});

describe("daxVariables", () => {
  const source = (dax: string) => {
    const tokens = tokenizeDax(dax);
    return daxVariables(tokens).map((v) => [
      v.name,
      tokens
        .slice(v.from, v.to)
        .map((t) => t.text)
        .join(" "),
    ]);
  };

  it("reads each definition up to the next VAR or RETURN at its level", () => {
    expect(source("VAR a = DATE(2025, 1, 1) VAR NextYear = a + 1 RETURN NextYear")).toEqual([
      ["a", "DATE ( 2025 , 1 , 1 )"],
      ["NextYear", "a + 1"],
    ]);
  });

  it("ends a definition inside a call at the call's close", () => {
    expect(source("CALCULATE(VAR y = 2025 RETURN y) + 1")).toEqual([["y", "2025"]]);
  });

  it("keeps a nested block's variables inside the outer definition", () => {
    expect(source("VAR z = CALCULATE(VAR y = 2025 RETURN y) RETURN z")).toEqual([
      ["z", "CALCULATE ( VAR y = 2025 RETURN y )"],
      ["y", "2025"],
    ]);
  });

  it("resolves a name to the nearest definition before it whose block it is still in", () => {
    const dax = "VAR y = 2024 VAR z = CALCULATE([x], VAR y = 2025 RETURN y) RETURN y + Y";
    const tokens = tokenizeDax(dax);
    const vars = daxVariables(tokens);
    const uses = tokens.flatMap((t, k) =>
      t.kind === "identifier" && t.text.toUpperCase() === "Y" && tokens[k + 1]?.text !== "="
        ? [k]
        : [],
    );
    expect(uses.map((k) => tokens[variableAt(vars, tokens[k]!.text, k)!.from]!.text)).toEqual([
      "2025",
      "2024",
      "2024",
    ]);
    expect(variableAt(vars, "missing", tokens.length - 1)).toBeUndefined();
  });

  it("does not resolve a name inside its own definition to itself", () => {
    const tokens = tokenizeDax("VAR a = a RETURN a");
    const vars = daxVariables(tokens);
    expect(variableAt(vars, "a", 3)).toBeUndefined();
    expect(variableAt(vars, "a", 5)?.at).toBe(0);
  });
});
