import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/custom-rules/limits.js";
import {
  LimitReached,
  compilePattern,
  isMatch,
  type CompiledPattern,
} from "../src/custom-rules/te/regex.js";

const r = String.raw;

/** Compiles or fails the test with the reason. */
const re = (pattern: string): CompiledPattern => {
  const c = compilePattern(pattern);
  if (!("regex" in c)) throw new Error(`did not compile: ${JSON.stringify(c)}`);
  return c.regex;
};
const m = (pattern: string, input: string): boolean =>
  isMatch(re(pattern), input, { left: LIMITS.stepsPerRule });
const unsupported = (pattern: string): string => {
  const c = compilePattern(pattern);
  if (!("unsupported" in c)) throw new Error(`not unsupported: ${JSON.stringify(c)}`);
  return c.unsupported;
};
const invalid = (pattern: string): string => {
  const c = compilePattern(pattern);
  if (!("invalid" in c)) throw new Error(`not invalid: ${JSON.stringify(c)}`);
  return c.invalid;
};

describe("supported constructs", () => {
  it("searches for a literal anywhere in the input", () => {
    expect(m("abc", "xxabcxx")).toBe(true);
    expect(m("abc", "ab c")).toBe(false);
    expect(m("", "")).toBe(true);
    expect(m("a b", "a b")).toBe(true);
  });

  it("matches any character but a newline with a dot", () => {
    expect(m("a.c", "abc")).toBe(true);
    expect(m("a.c", "a\nc")).toBe(false);
    expect(m("a.c", "a\rc")).toBe(true);
  });

  it("reads classes, ranges, negation and escapes inside a class", () => {
    expect(m("[a-c]", "b")).toBe(true);
    expect(m("[a-c]", "d")).toBe(false);
    expect(m("[^a-c]", "d")).toBe(true);
    expect(m("^[^a-c]$", "b")).toBe(false);
    expect(m(r`[\]]`, "]")).toBe(true);
    expect(m(r`[^\]]`, "]")).toBe(false);
    expect(m(r`[\d]`, "7")).toBe(true);
    expect(m(r`[\(]`, "(")).toBe(true);
    expect(m("[]a]", "]")).toBe(true);
    expect(m("[a-]", "-")).toBe(true);
    expect(m(r`[\d-z]`, "-")).toBe(true);
    expect(m(r`[\d-z]`, "m")).toBe(false);
    expect(m(r`[\x41-\x43]`, "B")).toBe(true);
    expect(m(r`[\u00e9]`, "é")).toBe(true);
    expect(m(r`[\b]`, "\b")).toBe(true);
  });

  it("gives \\d, \\w and \\s their Unicode meanings, and their negations", () => {
    expect(m(r`\d`, "\u0663")).toBe(true);
    expect(m(r`\d`, "x")).toBe(false);
    expect(m(r`\D`, "x")).toBe(true);
    expect(m(r`\D`, "5")).toBe(false);
    expect(m(r`\w`, "é")).toBe(true);
    expect(m(r`\w`, "_")).toBe(true);
    expect(m(r`\w`, "\u0301")).toBe(true);
    expect(m(r`\w`, "-")).toBe(false);
    expect(m(r`\W`, "-")).toBe(true);
    expect(m(r`\W`, "é")).toBe(false);
    expect(m(r`\s`, "\u00a0")).toBe(true);
    expect(m(r`\s`, "\u0085")).toBe(true);
    expect(m(r`\s`, "\u000b")).toBe(true);
    expect(m(r`\s`, "x")).toBe(false);
    expect(m(r`\S`, "x")).toBe(true);
    expect(m(r`\S`, " ")).toBe(false);
  });

  it("finds word boundaries with .NET's word class", () => {
    expect(m(r`\bcat\b`, "a cat sat")).toBe(true);
    expect(m(r`\bcat\b`, "concatenate")).toBe(false);
    expect(m(r`\bcat\b`, "écat")).toBe(false);
    expect(m(r`\Bcat`, "concatenate")).toBe(true);
    expect(m(r`\Bcat`, "cat")).toBe(false);
  });

  it("anchors ^ to the start and $ to the end or before a final newline", () => {
    expect(m("^a", "ab")).toBe(true);
    expect(m("^a", "ba")).toBe(false);
    expect(m("a$", "ba")).toBe(true);
    expect(m("a$", "a\n")).toBe(true);
    expect(m("a$", "a\nb")).toBe(false);
    expect(m("a$", "a\n\n")).toBe(false);
    expect(m(r`\Aa`, "ab")).toBe(true);
    expect(m(r`a\z`, "a\n")).toBe(false);
    expect(m(r`a\z`, "a")).toBe(true);
    expect(m(r`a\Z`, "a\n")).toBe(true);
  });

  it("treats every kind of group as grouping", () => {
    expect(m("(ab)+c", "ababc")).toBe(true);
    expect(m("^(?:ab)+$", "aba")).toBe(false);
    expect(m("(?<n>ab)c", "abc")).toBe(true);
    expect(m("(?'n'ab)c", "abc")).toBe(true);
    expect(m("a(?#a comment)b", "ab")).toBe(true);
    expect(m("a(?#a comment)*b", "aaab")).toBe(true);
    expect(m("a(?)b", "ab")).toBe(true);
  });

  it("reads alternation", () => {
    expect(m("cat|dog", "hotdog")).toBe(true);
    expect(m("^(cat|dog)$", "cow")).toBe(false);
    expect(m("a(|b)c", "ac")).toBe(true);
  });

  it("repeats greedy or lazy with the same answer", () => {
    expect(m("^a{3}$", "aa")).toBe(false);
    expect(m("^a{3}$", "aaa")).toBe(true);
    expect(m("^a{2,}$", "aaaaa")).toBe(true);
    expect(m("^a{2,}$", "a")).toBe(false);
    expect(m("^a{2,3}$", "aaaa")).toBe(false);
    expect(m("^a{0,1}b", "b")).toBe(true);
    expect(m("^a*?b", "aab")).toBe(true);
    expect(m("^a+?b$", "b")).toBe(false);
    expect(m("^a??b$", "ab")).toBe(true);
    expect(m("^a{1,2}?b$", "aab")).toBe(true);
  });

  it("reads a brace that is not a quantifier as a literal", () => {
    expect(m("a{", "a{")).toBe(true);
    expect(m("x{,2}", "x{,2}")).toBe(true);
    expect(m("x{a}", "x{a}")).toBe(true);
    expect(m("a}", "a}")).toBe(true);
  });

  it("applies (?i) from its place to the end of its group", () => {
    expect(m("(?i)abc", "xABC")).toBe(true);
    expect(m("x(?i)divide", "XDIVIDE")).toBe(false);
    expect(m("x(?i)divide", "xDIVIDE")).toBe(true);
    expect(m("(a(?i)b)c", "aBc")).toBe(true);
    expect(m("(a(?i)b)c", "aBC")).toBe(false);
    expect(m("(?:a(?i)b|c)", "C")).toBe(true);
    expect(m("(?i:b)c", "Bc")).toBe(true);
    expect(m("(?i:b)c", "BC")).toBe(false);
    expect(m("(?i)a(?-i)b", "Ab")).toBe(true);
    expect(m("(?i)a(?-i)b", "AB")).toBe(false);
    expect(m("(?i-i)a", "A")).toBe(false);
  });

  it("compares by simple case folding of both sides", () => {
    expect(m("(?i)é", "É")).toBe(true);
    expect(m("(?i)É", "é")).toBe(true);
    expect(m("é", "É")).toBe(false);
    expect(m("(?i)[a-z]", "Q")).toBe(true);
    expect(m("(?i)[^a]", "A")).toBe(false);
    expect(m("(?i)[à-ÿ]", "É")).toBe(true);
    expect(m("(?i)i", "\u0131")).toBe(false);
  });

  it("checks lookarounds of one character or one class in place", () => {
    expect(m("(?<![A-Za-z0-9])TO", "xTO")).toBe(false);
    expect(m("(?<![A-Za-z0-9])TO", " TO")).toBe(true);
    expect(m("(?<![A-Za-z0-9])TO", "TO")).toBe(true);
    expect(m("(?<=x)a", "xa")).toBe(true);
    expect(m("(?<=x)a", "ya")).toBe(false);
    expect(m("a(?=b)", "ab")).toBe(true);
    expect(m("a(?=b)", "ac")).toBe(false);
    expect(m("a(?!b)", "ab")).toBe(false);
    expect(m("a(?!b)", "a")).toBe(true);
    expect(m(".+?(?=])", "x]")).toBe(true);
    expect(m("a(?=b|c)", "ac")).toBe(true);
    expect(m(r`a(?=\d)`, "a1")).toBe(true);
    expect(m("a(?=)", "a")).toBe(true);
    expect(m("a(?!)", "a")).toBe(false);
    expect(m("(?i)a(?=b)", "AB")).toBe(true);
  });

  it("reads character escapes", () => {
    expect(m(r`\x41`, "A")).toBe(true);
    expect(m(r`A`, "A")).toBe(true);
    expect(m(r`\t\n`, "\t\n")).toBe(true);
    expect(m(r`\e`, "\u001b")).toBe(true);
    expect(m(r`\cA`, "\u0001")).toBe(true);
    expect(m(r`\0`, "\u0000")).toBe(true);
    expect(m(r`\101`, "xA")).toBe(true);
    expect(m(r`(a)\12`, "a\n")).toBe(true);
    expect(m(r`\.\/\'`, "./'")).toBe(true);
    expect(m(r`\\b`, r`\b`)).toBe(true);
  });

  it("tests Unicode general categories", () => {
    expect(m(r`\p{Lu}`, "A")).toBe(true);
    expect(m(r`\p{Lu}`, "a")).toBe(false);
    expect(m(r`\P{L}`, "1")).toBe(true);
    expect(m(r`[\p{Pd}]`, "-")).toBe(true);
    expect(m(r`(?i)\p{L}`, "a")).toBe(true);
  });
});

describe("refused constructs", () => {
  it("names each construct it does not run", () => {
    expect(unsupported(r`(a)\1`)).toMatch(/backreference/);
    expect(unsupported(r`(?<n>a)\k<n>`)).toMatch(/backreference/);
    expect(unsupported(r`(?<n>a)\'n'`)).toMatch(/backreference/);
    expect(unsupported("(?<=ab)c")).toMatch(/`\(\?<=\.\.\.\)` wider than one character/);
    expect(unsupported("(?<!ab)c")).toMatch(/`\(\?<!\.\.\.\)`/);
    expect(unsupported("c(?=ab)")).toMatch(/`\(\?=\.\.\.\)`/);
    expect(unsupported("c(?!a+)")).toMatch(/`\(\?!\.\.\.\)`/);
    expect(unsupported("(?(a)b|c)")).toMatch(/conditional/);
    expect(unsupported("(?>a)")).toMatch(/atomic/);
    expect(unsupported("(?<b>x)(?<a-b>c)")).toMatch(/balancing/);
    expect(unsupported(r`\Ga`)).toMatch(/\\G/);
    expect(unsupported("(?m)^a")).toMatch(/\(\?m\)/);
    expect(unsupported("(?s).")).toMatch(/\(\?s\)/);
    expect(unsupported("(?x)a b")).toMatch(/\(\?x\)/);
    expect(unsupported("(?n)(a)")).toMatch(/\(\?n\)/);
    expect(unsupported(r`\p{IsGreek}`)).toMatch(/\\p\{IsGreek\}/);
    expect(unsupported(r`(?i)\p{Lu}`)).toMatch(/\\p\{Lu\}.*\(\?i\)/);
    expect(unsupported("[a-z-[aeiou]]")).toMatch(/subtraction/);
    expect(unsupported("[[:alpha:]]")).toMatch(/\[:name:\]/);
  });

  it("refuses a pattern longer than the limit", () => {
    expect(unsupported("a".repeat(LIMITS.patternChars + 1))).toMatch(/4,000 characters/);
    expect("regex" in compilePattern("a".repeat(LIMITS.patternChars))).toBe(true);
  });

  it("refuses a pattern that compiles to more states than the limit", () => {
    expect(unsupported("(a{1000}){100}")).toMatch(/10,000 states/);
    expect(unsupported("a{2147483647}")).toMatch(/10,000 states/);
    expect("regex" in compilePattern("a{1,500}")).toBe(true);
  });

  it("compiles a repeat of an empty match at once, as the empty match it is", () => {
    const patterns = [
      ["(?:){100000000}", ""],
      ["(?:(?:){2147483647}){2147483647}", ""],
      ["(?=){100000000}", ""],
      ["(?:){1,2147483647}", ""],
      ["(?:)*", ""],
      ["a(?:){100000000}b", "ab"],
      ["a(?=){2147483647}", "a"],
    ];
    for (const [pattern, plain] of patterns) {
      const started = Date.now();
      const compiled = compilePattern(pattern!);
      expect(Date.now() - started, pattern).toBeLessThan(50);
      expect("regex" in compiled, pattern).toBe(true);
      for (const input of ["", "a", "ab", "xaby"])
        expect(m(pattern!, input), `${pattern} on ${input}`).toBe(m(plain!, input));
    }
  });

  it("refuses groups nested deeper than the limit", () => {
    const deep = "(".repeat(LIMITS.nesting + 1) + "a" + ")".repeat(LIMITS.nesting + 1);
    expect(unsupported(deep)).toMatch(/nested/);
  });

  it("reports a pattern .NET refuses as invalid, even beside an unsupported construct", () => {
    expect(invalid("(?>a)(")).toMatch(/never closed/);
  });
});

describe("invalid patterns", () => {
  it.each([
    ["(", /never closed/],
    ["a)", /`\)` with no `\(`/],
    ["[a", /never closed/],
    ["[z-a]", /reverse order/],
    [r`[a-\d]`, /range/],
    ["*a", /nothing to repeat/],
    ["a|+", /nothing to repeat/],
    ["(?i)*", /nothing to repeat/],
    ["{2}", /nothing to repeat/],
    ["a**", /quantifier after a quantifier/],
    ["a*+", /quantifier after a quantifier/],
    ["a{2}{3}", /quantifier after a quantifier/],
    ["a{3,2}", /larger than its maximum/],
    [r`\q`, /\\q/],
    [r`\_`, /\\_/],
    [r`[\A]`, /\\A/],
    ["a\\", /ends with/],
    [r`\x4`, /hex/],
    [r`\u12`, /hex/],
    [r`\p{Foo}`, /Foo/],
    [r`\p`, /\\p/],
    ["(?q)", /grouping/],
    [r`\1`, /group/],
    [r`\k<x>`, /group/],
    ["(?#abc", /comment/],
    ["(?<>a)", /group name/],
    [r`\c1`, /control/],
    [r`\'Sales'`, /group name/],
  ])("%s", (pattern, reason) => {
    expect(invalid(pattern)).toMatch(reason);
  });
});

/** Every distinct pattern string the survey's rules pass to RegEx.IsMatch, as data. */
const SURVEY = [
  r`(?i)(?<![A-Za-z0-9])TO\s*DO(?![A-Za-z0-9])`,
  r`(?i)(TODO|TBC|TBD|!!)`,
  r`(?i)AVERAGE\s*\(\s*\'*`,
  r`(?i)CALCULATETABLE\s*\([^,]*,\s*(?i)FILTER\s*\(\s*\'*[A-Za-z0-9 _]+\'*,\s*\'*[A-Za-z0-9 _]+\'*\[[A-Za-z0-9 _]+\]`,
  r`(?i)CALCULATE\s*\(\s*[^,]+,\s*(?i)FILTER\s*\(\s*\'*[A-Za-z0-9 _]+'*\s*,\s*\'*[A-Za-z0-9 _]+\'*\[[A-Za-z0-9 _]+\]`,
  r`(?i)CALCULATE\s*\(\s*[^,]+,\s*(?i)FILTER\s*\(\s*\'*[A-Za-z0-9 _]+\'*\s*,\s*\[[^\]]+\]`,
  r`(?i)EVALUATEANDLOG\s*\(`,
  r`(?i)USERELATIONSHIP\s*\(\s*.+?(?=])\]\s*,\s*'*`,
  r`(?i)USERNAME\(`,
  r`(?i)\\b(TODO|FIXME|HACK|XXX|PLACEHOLDER)\\b`,
  r`DATEADD\s*\(`,
  r`ID$`,
  r`[0-9]+\s*[-+]\s*(?i)DIVIDE\s*\(`,
  r`[0-9]+\s*[-+]\s*[\(]*\s*(?i)SUM\s*\(\s*\'*[A-Za-z0-9 _]+\'*\s*\[[A-Za-z0-9 _]+\]\s*\)\s*\/`,
  r`[A-Z]([A-Z0-9]*[a-z][a-z0-9]*[A-Z]|[a-z0-9]*[A-Z][A-Z0-9]*[a-z])[A-Za-z0-9]*`,
  r`\)\s*\/(?!\/)(?!\*)`,
  r`\]\s*\/(?!\/)(?!\*)`,
  r`\d{4}-\d{2}-\d{2}`,
  r`^[a-z]`,
  // The literal pieces of the rule that builds its pattern from model names, and a built example.
  r`(?i)COUNTBLANK\s*\(\s*\'*`,
  r`\'*\s*\[`,
  r`(?i)SUM\s*\(\s*\'*Sales\'*\[Amount\]\s*\)`,
];

describe("the survey's patterns", () => {
  it.each(SURVEY)("%s compiles", (pattern) => {
    expect("regex" in compilePattern(pattern)).toBe(true);
  });

  it("reports the unclosed group as not compiling", () => {
    expect(invalid(r`(?i)USERELATIONSHIP\s*\(\s*(\'*`)).toMatch(/never closed/);
  });

  it("finds what the rules are written for", () => {
    const [todo, todoList, , , filterCol, filterMeasure, log, userel, username, todoEscaped] =
      SURVEY;
    expect(m(todo!, "// To do: fix")).toBe(true);
    expect(m(todo!, "TODOS")).toBe(false);
    expect(m(todo!, "PHOTODOC")).toBe(false);
    expect(m(todoList!, "-- tbd later")).toBe(true);
    expect(m(todoList!, "SUM([Amount])")).toBe(false);
    expect(m(filterCol!, "CALCULATE([Sales], FILTER('Sales', 'Sales'[Amount] > 0))")).toBe(true);
    expect(m(filterMeasure!, "CALCULATE([Sales], FILTER(Sales, [Amount] > 0))")).toBe(true);
    expect(m(filterMeasure!, "CALCULATE([Sales], 'Sales'[Amount] > 0)")).toBe(false);
    expect(m(log!, "evaluateandlog ( [x] )")).toBe(true);
    expect(m(userel!, "USERELATIONSHIP('Sales'[Date], 'Date'[Date])")).toBe(true);
    expect(m(username!, "username()")).toBe(true);
    expect(m(todoEscaped!, r`x \bTODO\b y`)).toBe(true);
    expect(m(todoEscaped!, "TODO")).toBe(false);

    const division = SURVEY[15]!;
    const bracketDivision = SURVEY[16]!;
    const sumDivision = SURVEY[13]!;
    expect(m(division, "SUM('Sales'[Amount]) / 2")).toBe(true);
    expect(m(division, "SUM('Sales'[Amount]) // a comment")).toBe(false);
    expect(m(division, "SUM('Sales'[Amount]) /* a comment */")).toBe(false);
    expect(m(bracketDivision, "'Sales'[Amount] / 2")).toBe(true);
    expect(m(bracketDivision, "'Sales'[Amount] * 2")).toBe(false);
    expect(m(sumDivision, "1 + SUM('Sales'[Amount]) / 2")).toBe(true);
    expect(m(sumDivision, "1 + sum ( Sales[Amount] ) / 2")).toBe(true);
    expect(m(SURVEY[12]!, "10 - divide(1, 2)")).toBe(true);

    const camel = SURVEY[14]!;
    expect(m(camel, "SalesAmount")).toBe(true);
    expect(m(camel, "Sales")).toBe(false);
    expect(m(camel, "sales_amount")).toBe(false);
    expect(m(camel, "SALES")).toBe(false);

    expect(m(SURVEY[11]!, "CustomerID")).toBe(true);
    expect(m(SURVEY[11]!, "IDENT")).toBe(false);
    expect(m(SURVEY[17]!, "As of 2026-11-06")).toBe(true);
    expect(m(SURVEY[17]!, "2026-1-06")).toBe(false);
    expect(m(SURVEY[18]!, "sales")).toBe(true);
    expect(m(SURVEY[18]!, "Sales")).toBe(false);
    expect(m(SURVEY[10]!, "DATEADD ('Date'[Date], -1, YEAR)")).toBe(true);
    expect(m(SURVEY[21]!, "sum( 'Sales'[Amount] )")).toBe(true);
    expect(m(SURVEY[21]!, "SUM('Sales'[Cost])")).toBe(false);
  });

  it("compiles or reports a pattern built from a name such as Sales (EU), never throwing", () => {
    for (const name of [
      "Sales (EU)",
      "Sales (EU",
      "Sales EU)",
      "Sales [EU",
      r`Sales \EU`,
      "a{2}*",
    ]) {
      const pattern = r`(?i)SUM\s*\(\s*\'*` + name + r`\'*\s*\[Amount\]\s*\)`;
      const c = compilePattern(pattern);
      expect("regex" in c || "invalid" in c || "unsupported" in c).toBe(true);
    }
    expect("regex" in compilePattern(r`\'*Sales (EU)\'*`)).toBe(true);
    expect("invalid" in compilePattern(r`\'*Sales (EU\'*`)).toBe(true);
    expect("invalid" in compilePattern(r`\'*Sales EU)\'*`)).toBe(true);
  });
});

describe("what Tabular Editor CLI 0.8.1.1 answered", () => {
  it("applies a mid-pattern (?i) from there on, not before", () => {
    expect(m("x(?i)divide", "XDIVIDE")).toBe(false);
  });
  it("matches $ before a final newline but not an inner one", () => {
    expect(m("a$", "a\n")).toBe(true);
    expect(m("a$", "a\nb")).toBe(false);
  });
  it("does not match a newline with a dot, nor ^ after a newline; \\s matches one", () => {
    expect(m(".", "\n")).toBe(false);
    expect(m("^b", "a\nb")).toBe(false);
    expect(m(r`a\sb`, "a\nb")).toBe(true);
  });
  it("matches \\d and \\w on characters outside ASCII", () => {
    expect(m(r`^\d$`, "\u0663")).toBe(true);
    expect(m(r`^\w$`, "é")).toBe(true);
  });
  it("runs a one-character lookbehind", () => {
    expect(m("(?<=a)b", "ab")).toBe(true);
  });
});

describe("the step budget", () => {
  it.each(["(a*)*b", "(a|a)*b", "(a+)+b", "(a|aa)*c"])(
    "%s against 50,000 a's finishes within the budget, in well under a second",
    (pattern) => {
      const budget = { left: LIMITS.stepsPerRule };
      const started = performance.now();
      let answer: boolean | "limit";
      try {
        answer = isMatch(re(pattern), "a".repeat(50_000), budget);
      } catch (e) {
        if (!(e instanceof LimitReached)) throw e;
        answer = "limit";
      }
      const took = performance.now() - started;
      expect(answer).toBe(false);
      expect(budget.left).toBeGreaterThanOrEqual(0);
      expect(took).toBeLessThan(1000);
    },
  );

  it("spends the budget and throws LimitReached when it is spent", () => {
    const budget = { left: 1_000_000 };
    isMatch(re("a*b"), "aaab", budget);
    expect(budget.left).toBeLessThan(1_000_000);
    expect(() => isMatch(re("a*b"), "a".repeat(1000), { left: 100 })).toThrow(LimitReached);
  });

  it("caches a compiled pattern by its text", () => {
    expect(compilePattern("cache(me)")).toBe(compilePattern("cache(me)"));
  });
});
