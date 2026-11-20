import { describe, expect, it } from "vitest";
import * as entry from "@pbiplint/core/custom-rules";
import { LIMITS } from "../src/custom-rules/limits.js";
import { teSeverity } from "../src/custom-rules/rules.js";
import {
  checkTeExpression,
  TE_CONVERSIONS,
  TE_EMPTY_VALUES,
} from "../src/custom-rules/te/evaluate.js";
import { lex } from "../src/custom-rules/te/lexer.js";
import { runTeRules } from "../src/custom-rules/te/index.js";
import { LIBRARY, REGEX_OPTIONS, REGEX_OPTIONS_RUN } from "../src/custom-rules/te/library.js";
import { parseTeExpression, TE_LAMBDA_METHODS, TE_TYPES } from "../src/custom-rules/te/parser.js";
import {
  TE_NEAREST_SCOPES,
  TE_REPORT_SCOPES,
  TE_RULE_FIELDS,
} from "../src/custom-rules/te/read.js";
import { teReference, typeLabel, type TeReference } from "../src/custom-rules/te/reference.js";
import { REGEX_REFUSED, REGEX_RUNS } from "../src/custom-rules/te/regex.js";
import {
  NUMBER_SUFFIXES,
  NUMBER_TYPE_NAMES,
  TE_KEYWORDS,
  TE_LITERALS,
  TE_OPERATORS,
} from "../src/custom-rules/te/syntax.js";
import { TOKEN_MEMBERS, TOKEN_TYPES } from "../src/custom-rules/te/tokens.js";
import {
  ENUMS,
  PROPERTIES,
  SCOPE_TYPES,
  STATISTICS_PREFIX,
  TE_SCOPES,
  TOM_TYPES,
  UNKNOWN_PROPERTIES,
  type TomType,
} from "../src/custom-rules/te/view.js";
import { isStatisticsAnnotation } from "../src/custom-rules/te/library.js";
import { buildModel } from "../src/model/build.js";
import { parseModelDir } from "./helpers.js";

const repo = new URL("../../../", import.meta.url).pathname;
const MODEL = buildModel(parseModelDir(`${repo}tests/fixtures/custom-rules.SemanticModel`));
const EM_DASH = String.fromCharCode(0x2014);
const REF: TeReference = teReference();

/** The check's reason for a one-line rule on its scopes, or undefined; fails on a parse error. */
function check(expression: string, scopes: readonly string[]): string | undefined {
  const parsed = parseTeExpression(expression);
  if ("error" in parsed) throw new Error(`${expression}: ${parsed.error}`);
  return checkTeExpression(parsed.expr, scopes);
}
const passes = (expression: string, scopes: readonly string[]) =>
  expect(check(expression, scopes), `${expression} on ${scopes.join(", ")}`).toBeUndefined();

/**
 * How a rule reaches an object type: a scope whose objects are only that type, or, for the parts
 * reached only through a property, a scope and the path to a value of the type.
 */
const ROUTES: Partial<Record<TomType, [scope: string, path: string]>> = {
  CalculationGroup: ["CalculationGroup", "CalculationGroup."],
  AlternateOf: ["DataColumn", "AlternateOf."],
  Dependency: ["Measure", "DependsOn.First()."],
  ObjectReference: ["Measure", "DependsOn.First().Value.First()."],
};
function reach(type: TomType): [scope: string, path: string] {
  const own = TE_SCOPES.find((s) => SCOPE_TYPES[s].length === 1 && SCOPE_TYPES[s][0] === type);
  if (own) return [own, ""];
  const route = ROUTES[type];
  if (!route) throw new Error(`no route to ${type}; add one to ROUTES`);
  return route;
}

/** A value each kind of receiver is called on, with the scope it is written on. */
const RECEIVERS: Record<string, [scope: string, value: string]> = {
  String: ["Model", '"a"'],
  Char: ["Model", "'a'"],
  Number: ["Model", "1"],
  Boolean: ["Model", "true"],
  Enum: ["Model", "StringComparison.Ordinal"],
  Collection: ["Model", "Tables"],
  Object: ["Measure", "it"],
};
const receiver = (on: string): [string, string] => {
  const r = RECEIVERS[on];
  if (!r) throw new Error(`no receiver for ${on}; add one to RECEIVERS`);
  return r;
};

/** One example argument for each parameter type. */
const ARGUMENTS: Record<string, string> = {
  String: '"a"',
  Char: "'a'",
  Int32: "1",
  Number: "1",
  Boolean: "true",
  Object: "1",
  T: "it",
  StringComparison: "StringComparison.Ordinal",
  RegexOptions: "RegexOptions.IgnoreCase",
  Predicate: "true",
  Selector: "1",
  "Collection<String>": '"a,b".Split(",")',
};
const args = (params: readonly { type: string }[] | undefined): string =>
  (params ?? [])
    .map((p) => {
      const a = ARGUMENTS[p.type];
      if (a === undefined) throw new Error(`no example argument for ${p.type}; add one`);
      return a;
    })
    .join(", ");

/** How to write each operator in a one-line rule. */
function operatorRule(op: string, spelling: string, precedence: number): string {
  if (precedence >= 2 && precedence <= 7) return `(1 ${spelling} 1) == null`;
  if (precedence === 8) return `(${spelling} 1) == null`;
  const top: Record<string, string> = {
    conditional: "(true ? 1 : 2) == 1",
    member: "Name.Length == 1",
    index: "Name[0] == null",
    call: "Name.ToString() == null",
    separator: 'Name.IndexOf("a", 0) == 0',
    it: "$.Name == null",
  };
  const rule = top[op];
  if (rule === undefined) throw new Error(`no rule for the operator ${op}`);
  return rule;
}

/** How to write each keyword in a one-line rule on the model. */
const KEYWORD_RULES: Record<string, string> = {
  true: "true",
  false: "false == false",
  null: "null == null",
  it: "it == it",
  outerIt: "Tables.Any(outerIt == outerIt)",
  current: "current == it",
  iif: "iif(true, true, false)",
  not: "not false",
  and: "true and true",
  or: "true or false",
  mod: "(3 mod 2) == 1",
};

/** A notRun entry made into a rule file of one rule. */
function notRunRule(e: TeReference["notRun"][number]): Record<string, unknown> {
  const base = { ID: "NOT_RUN", Name: "Not run", Scope: "Model", Expression: "true" };
  switch (e.kind) {
    case "property":
      return { ...base, Scope: "Table", Expression: `${e.name} == null` };
    case "annotation":
      return { ...base, Scope: "Table", Expression: `GetAnnotation("${e.name}") == null` };
    case "scope":
      return { ...base, Scope: e.name };
    case "option":
      return { ...base, Expression: `RegEx.IsMatch("a", "a", ${e.name})` };
    case "field":
      return { ...base, [e.name]: "IsHidden = true" };
    case "syntax": {
      if (e.name === "x => ...") return { ...base, Expression: "Tables.Any(x => x.IsHidden)" };
      // `.GroupBy(...)` is a method on a collection; `String(...)` a conversion.
      const name = e.name.replace(/\(\.\.\.\)$/, "");
      if (name.startsWith(".")) return { ...base, Expression: `Tables${name}(true) == null` };
      expect(TE_TYPES.map((t) => t.name)).toContain(name);
      return { ...base, Expression: `${name}(1) == null` };
    }
  }
}

/** A reason without what changes with the rule: the position and the object type. */
const general = (reason: string) =>
  reason.replace(/,? at character \d+/, "").replace(/, on an? \w+$/, "");

describe("teReference: walking the tables", () => {
  const names = <T extends { name: string }>(xs: readonly T[]) => xs.map((x) => x.name);

  it("lists the rule's fields and how each severity reads", () => {
    expect(REF.fields).toEqual(TE_RULE_FIELDS.map((f) => ({ ...f })));
    expect(REF.severities).toEqual([
      { written: "below 0", severity: "info" },
      { written: 0, severity: "info" },
      { written: 1, severity: "info" },
      { written: 2, severity: "warning" },
      { written: 3, severity: "error" },
      { written: "4 or more", severity: "error" },
      { written: null, severity: "info" },
    ]);
    expect(teSeverity(undefined)).toBe(1);
    expect([-100, -1, 4, 5, 100].map((n) => teSeverity(n))).toEqual([1, 1, 3, 3, 3]);
  });

  it("lists every scope with its object types", () => {
    expect(REF.scopes).toEqual(TE_SCOPES.map((s) => ({ name: s, types: [...SCOPE_TYPES[s]] })));
  });

  it("lists every object type with its scopes and every property, and nothing more", () => {
    expect(names(REF.types)).toEqual([...TOM_TYPES]);
    for (const t of REF.types) {
      const type = t.name as TomType;
      expect(t.scopes).toEqual(TE_SCOPES.filter((s) => SCOPE_TYPES[s].includes(type)));
      expect(names(t.properties)).toEqual(Object.keys(PROPERTIES[type]));
      for (const p of t.properties) {
        const spec = PROPERTIES[type][p.name]!;
        expect(p.type).toBe(typeLabel(spec.type));
        const of = spec.type.kind === "nullable" ? spec.type.of : spec.type;
        const members = of.kind === "collection" ? of.members : undefined;
        if (members) expect(names(p.members ?? [])).toEqual(Object.keys(members));
        else expect(p.members).toBeUndefined();
      }
    }
  });

  it("lists every method, value property, static function and static value, and nothing more", () => {
    const flat = <T>(r: Record<string, readonly T[] | Record<string, T>>) =>
      Object.entries(r).flatMap(([on, xs]) =>
        Array.isArray(xs)
          ? (xs as readonly { name: string }[]).map(
              (x) => `${on}.${x.name}/${(x as unknown as { params: unknown[] }).params.length}`,
            )
          : Object.keys(xs).map((name) => `${on}.${name}`),
      );
    const listed = (xs: readonly { on: string; name: string; params?: readonly unknown[] }[]) =>
      xs.map((x) => (x.params ? `${x.on}.${x.name}/${x.params.length}` : `${x.on}.${x.name}`));
    expect(listed(REF.methods)).toEqual(flat(LIBRARY.methods));
    expect(listed(REF.statics)).toEqual(flat(LIBRARY.statics));
    expect(listed(REF.valueProperties)).toEqual(flat(LIBRARY.properties));
    expect(listed(REF.staticValues)).toEqual(flat(LIBRARY.staticValues));
    for (const x of [...REF.methods, ...REF.statics, ...REF.valueProperties, ...REF.staticValues])
      expect(x.description.length, `${x.on}.${x.name}`).toBeGreaterThan(10);
  });

  it("lists conversions, enums, syntax, tokens, regular expressions and limits from their tables", () => {
    expect(REF.conversions).toEqual(
      TE_CONVERSIONS.map((c) => ({ ...c, spellings: [...c.spellings] })),
    );
    expect(names(REF.enums)).toEqual(Object.keys(LIBRARY.enums));
    for (const e of REF.enums) {
      expect(e.values).toEqual([...LIBRARY.enums[e.name]!.type.values]);
      expect(e.description).toBe(LIBRARY.enums[e.name]!.description);
      if (e.name === "RegexOptions") expect(e.runs).toEqual([...REGEX_OPTIONS_RUN]);
      else expect(e.runs).toBeUndefined();
    }
    expect(REF.syntax.operators).toEqual(
      TE_OPERATORS.map((o) => ({ ...o, spellings: [...o.spellings] })),
    );
    expect(REF.syntax.keywords).toEqual(TE_KEYWORDS.map((k) => ({ ...k })));
    expect(REF.syntax.literals).toEqual(TE_LITERALS.map((l) => ({ ...l })));
    expect(REF.syntax.emptyValues).toBe(TE_EMPTY_VALUES);
    expect(REF.tokens.members).toEqual(TOKEN_MEMBERS.map((m) => ({ ...m })));
    expect(REF.tokens.types).toEqual([...TOKEN_TYPES]);
    expect(REF.regex.runs).toEqual(REGEX_RUNS.map((r) => ({ ...r })));
    expect(REF.regex.refused).toEqual(Object.values(REGEX_REFUSED).map((r) => ({ ...r })));
    expect(REF.limits).toEqual(
      Object.entries(LIMITS).map(([name, value]) => expect.objectContaining({ name, value })),
    );
  });

  it("lists what is not run: each known gap, refused scope, refused syntax, option and ignored field", () => {
    const methods = new Set(
      Object.values(LIBRARY.methods)
        .flat()
        .map((m) => m.name.toLowerCase()),
    );
    const want = [
      ...Object.keys(UNKNOWN_PROPERTIES)
        .filter((n) => !isStatisticsAnnotation(n))
        .map((n) => `property ${n}`),
      ...[
        ...Object.keys(UNKNOWN_PROPERTIES).filter(isStatisticsAnnotation),
        `${STATISTICS_PREFIX}*`,
      ].map((n) => `annotation ${n}`),
      ...[...TE_REPORT_SCOPES, ...Object.keys(TE_NEAREST_SCOPES)].map((n) => `scope ${n}`),
      "syntax x => ...",
      // Math, Convert, Regex and StringComparison are not values, so a conversion to one is no
      // advice worth listing; the evaluator still refuses it.
      ...TE_TYPES.filter(
        (t) =>
          !TE_CONVERSIONS.some((c) => c.type === t.name) &&
          !["Math", "Convert", "Regex", "StringComparison"].includes(t.name),
      ).map((t) => `syntax ${t.name}(...)`),
      ...TE_LAMBDA_METHODS.filter((m) => !methods.has(m.toLowerCase())).map(
        (m) => `syntax .${m}(...)`,
      ),
      ...REGEX_OPTIONS.values
        .filter((v) => !REGEX_OPTIONS_RUN.includes(v))
        .map((v) => `option RegexOptions.${v}`),
      ...TE_RULE_FIELDS.filter((f) => f.use === "ignored").map((f) => `field ${f.name}`),
    ];
    expect(REF.notRun.map((e) => `${e.kind} ${e.name}`).sort()).toEqual(want.sort());
  });

  it("is JSON-safe, the same on every call, and holds no em dash", () => {
    const json = JSON.stringify(teReference());
    expect(JSON.parse(json)).toEqual(REF);
    expect(teReference()).toEqual(REF);
    expect(json).not.toContain(EM_DASH);
  });

  it("is exported from the custom rules entry", () => {
    expect(entry.teReference).toBe(teReference);
    expect(entry.typeLabel).toBe(typeLabel);
  });
});

describe("teReference: literals, held to the lexer", () => {
  /** The type the lexer gives a literal written alone, as the reference names it. */
  function lexedType(written: string): string {
    const tokens = lex(written);
    expect(tokens, written).toHaveLength(2);
    const t = tokens[0]!;
    switch (t.type) {
      case "string":
        return "String";
      case "char":
        return "Char";
      case "number":
        return NUMBER_TYPE_NAMES[t.numberKind];
      case "ident":
        expect(t.escaped, written).toBe(true);
        return "name";
      default:
        throw new Error(`${written} lexed as ${t.type}`);
    }
  }

  it("gives each example the type the lexer gives it", () => {
    for (const l of REF.syntax.literals) expect(lexedType(l.written), l.written).toBe(l.type);
  });

  it("passes the check for every value example, and reads @it as a property, not the keyword", () => {
    for (const l of REF.syntax.literals)
      if (l.type !== "name") passes(`(${l.written}) == null`, ["Model"]);
    const escaped = REF.syntax.literals.find((l) => l.type === "name")!.written;
    expect(check(`${escaped} == null`, ["Model"])).toMatch(/\bit\b/);
    passes("it == null", ["Model"]);
  });

  it("lists every number suffix the lexer reads, and no other, in either case", () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const read = [...letters, ...letters.flatMap((a) => letters.map((b) => a + b))].filter((s) =>
      ["10", "1.5"].some((n) => {
        try {
          lex(`${n}${s}`);
          return true;
        } catch {
          return false;
        }
      }),
    );
    expect(read.sort()).toEqual(Object.keys(NUMBER_SUFFIXES).sort());
    for (const [suffix, kind] of Object.entries(NUMBER_SUFFIXES)) {
      const listed = REF.syntax.literals.find((l) => l.meaning.startsWith(`The suffix ${suffix} `));
      expect(listed?.type, suffix).toBe(NUMBER_TYPE_NAMES[kind]);
      expect(lexedType(listed!.written.toLowerCase())).toBe(NUMBER_TYPE_NAMES[kind]);
    }
  });

  it("writes a quote in a string or a character by doubling it, with no backslash escapes", () => {
    const value = (written: string) => {
      const t = lex(written)[0]!;
      if (t.type !== "string" && t.type !== "char") throw new Error(written);
      return t.value;
    };
    expect(value(`"say ""hi"""`)).toBe(`say "hi"`);
    expect(value(String.raw`"\d"`)).toBe(String.raw`\d`);
    expect(value('"a\\"')).toBe("a\\");
    expect(value(`''''`)).toBe(`'`);
    const strings = REF.syntax.literals.filter((l) => l.type === "String").map((l) => l.meaning);
    expect(strings.join(" ")).toMatch(/doubled.*no backslash escapes/);
  });

  it("says what an empty value does, as the evaluator runs it", () => {
    const run = (expression: string) => {
      const result = runTeRules(
        JSON.stringify([{ ID: "EMPTY", Scope: "Table", Expression: expression }]),
        MODEL,
      );
      if ("error" in result) throw new Error(result.error);
      return result.results[0]!.outcome;
    };
    expect(REF.syntax.emptyValues).toContain("gives no finding for that object");
    expect(REF.syntax.emptyValues).toContain("passing an empty value to a function");
    const empty = run("Expression == null");
    if (empty.kind !== "findings") throw new Error("== null did not run");
    expect(empty.objects.length).toBeGreaterThan(0);
    expect(run(`Expression.Length > 0 or Expression.Contains("a") == false`)).toMatchObject({
      kind: "findings",
      objects: [],
    });
    expect(run(`RegEx.IsMatch(Expression, "a")`).kind).toBe("could-not-run");
  });
});

describe("teReference: everything it lists runs", () => {
  it("passes the check for every scope", () => {
    for (const s of REF.scopes) passes("true", [s.name]);
  });

  it("passes the check for every property of every type, and every collection member", () => {
    for (const t of REF.types) {
      const [scope, path] = reach(t.name as TomType);
      for (const p of t.properties) {
        passes(`${path}${p.name} == null`, [scope]);
        for (const m of p.members ?? []) passes(`${path}${p.name}.${m.name} == null`, [scope]);
      }
    }
  });

  it("passes the check for every method, value property, static function and static value", () => {
    for (const m of REF.methods) {
      const [scope, value] = receiver(m.on);
      passes(`(${value}.${m.name}(${args(m.params)})) == null`, [scope]);
    }
    for (const p of REF.valueProperties) {
      const [scope, value] = receiver(p.on);
      passes(`${value}.${p.name} == null`, [scope]);
    }
    for (const f of REF.statics)
      passes(`(${f.on}.${f.name}(${args(f.params)})) == null`, ["Model"]);
    for (const v of REF.staticValues) passes(`${v.on}.${v.name} == null`, ["Model"]);
  });

  it("passes the check for every conversion spelling and every enum value", () => {
    for (const c of REF.conversions)
      for (const s of c.spellings) passes(`${s}(1) == null`, ["Model"]);
    for (const e of REF.enums) {
      if (e.name === "StringComparison" || e.name === "RegexOptions") {
        for (const v of e.values) passes(`${e.name}.${v} == null`, ["Model"]);
        continue;
      }
      // A model enum's values are written through a property of that enum, as a quoted name.
      const where = TOM_TYPES.flatMap((type) =>
        Object.entries(PROPERTIES[type])
          .filter(([, spec]) => {
            const t = spec.type.kind === "nullable" ? spec.type.of : spec.type;
            return t.kind === "enum" && t.name === e.name;
          })
          .map(([prop]) => [type, prop] as const),
      )[0];
      if (!where) throw new Error(`no property gives ${e.name}`);
      const [scope, path] = reach(where[0]);
      for (const v of e.values) passes(`${path}${where[1]} == "${v}"`, [scope]);
    }
  });

  it("passes the check for every operator spelling and every keyword", () => {
    for (const o of REF.syntax.operators)
      for (const s of o.spellings)
        if (s !== ":" && s !== "]" && s !== ")")
          passes(operatorRule(o.op, s, o.precedence), ["Model"]);
    for (const k of REF.syntax.keywords) {
      const rule = KEYWORD_RULES[k.name];
      if (rule === undefined) throw new Error(`no rule for the keyword ${k.name}`);
      passes(rule, ["Model"]);
    }
  });

  it("passes the check for every token member and token type, and every pattern that runs", () => {
    for (const m of REF.tokens.members) passes(`Tokenize().Any(${m.name} == null)`, ["Measure"]);
    // A type named as a keyword or a type name (`NOT`, `TRUE`, `CONVERT`) reads as that, in Tabular Editor too; the
    // Type member's description says to compare the text instead.
    const keywords = new Set([
      ...REF.syntax.keywords.map((k) => k.name.toLowerCase()),
      ...TE_TYPES.flatMap((x) => x.spellings.map((s) => s.toLowerCase())),
    ]);
    expect(REF.tokens.members.find((m) => m.name === "Type")?.description).toMatch(/keyword/);
    for (const t of REF.tokens.types)
      if (keywords.has(t.toLowerCase())) {
        const parsed = parseTeExpression(`Type == ${t}`);
        const asName =
          "expr" in parsed && parsed.expr.kind === "binary" && parsed.expr.right.kind === "ident";
        expect(asName, t).toBe(false);
        passes(`Tokenize().Any(Text.ToUpper() == "${t}")`, ["Measure"]);
      } else passes(`Tokenize().Any(Type == ${t})`, ["Measure"]);
    for (const r of REF.regex.runs)
      passes(`RegEx.IsMatch(Name, "${r.example.replaceAll('"', '""')}")`, ["Model"]);
  });
});

describe("teReference: what it does not list is refused", () => {
  it("refuses the lambda methods the parser knows and the evaluator does not run", () => {
    const methods = new Set(REF.methods.map((m) => m.name.toLowerCase()));
    const missing = TE_LAMBDA_METHODS.filter((m) => !methods.has(m.toLowerCase()));
    expect(missing.length).toBeGreaterThan(3);
    for (const m of missing)
      expect(check(`Tables.${m}(true) == null`, ["Model"]), m).toBe(
        `collection has no method \`${m}\``,
      );
  });

  it("refuses string methods and String functions it does not list", () => {
    for (const m of ["PadLeft(3)", "Normalize()", 'Join(",")', 'Format("a")', 'Insert(0, "a")'])
      expect(check(`"a".${m} == null`, ["Model"]), m).toMatch(/^String has no method/);
    for (const f of ['Split("a")', 'PadLeft("a", 3)', 'Normalize("a")', 'Format("a", 1)'])
      expect(check(`String.${f} == null`, ["Model"]), f).toMatch(
        /is not one of the functions pbiplint runs$/,
      );
  });

  it("refuses a property another type has and this one does not", () => {
    for (const t of REF.types) {
      const [scope, path] = reach(t.name as TomType);
      const own = new Set(t.properties.map((p) => p.name.toLowerCase()));
      const other = REF.types
        .flatMap((x) => x.properties.map((p) => p.name))
        .find((n) => !own.has(n.toLowerCase()));
      if (other === undefined) continue;
      expect(check(`${path}${other} == null`, [scope]), `${other} on ${t.name}`).toBeDefined();
    }
  });

  it("refuses a scope outside the list", () => {
    const result = runTeRules(
      JSON.stringify([{ ID: "ODD", Scope: "Dashboard", Expression: "true" }]),
      MODEL,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.results).toEqual([]);
    expect(result.problems[0]!.reason).toMatch(/does not define: Dashboard/);
  });
});

describe("teReference: each entry not run gives its reason through runTeRules", () => {
  for (const e of REF.notRun) {
    it(`${e.kind} ${e.name}`, () => {
      const result = runTeRules(JSON.stringify([notRunRule(e)]), MODEL);
      if ("error" in result) throw new Error(result.error);
      if (e.kind === "scope") {
        expect(result.results).toEqual([]);
        expect(result.problems.map((p) => p.reason)).toEqual([e.reason]);
        return;
      }
      expect(result.problems).toEqual([]);
      const outcome = result.results[0]!.outcome;
      if (e.kind === "field") {
        // An ignored field changes nothing: the rule runs as it would without it.
        expect(outcome.kind).toBe("findings");
        return;
      }
      if (outcome.kind !== "could-not-run") throw new Error(`${e.name} ran`);
      expect(general(outcome.reason)).toBe(e.reason);
    });
  }
});

describe("typeLabel", () => {
  it("names each type as the reference prints it", () => {
    expect(typeLabel({ kind: "string" })).toBe("String");
    expect(typeLabel({ kind: "boolean" })).toBe("Boolean");
    expect(typeLabel({ kind: "int" })).toBe("Int32");
    expect(typeLabel({ kind: "long" })).toBe("Int64");
    expect(typeLabel({ kind: "double" })).toBe("Double");
    expect(typeLabel({ kind: "decimal" })).toBe("Decimal");
    expect(typeLabel(ENUMS.DataType)).toBe("DataType");
    expect(typeLabel({ kind: "object", of: ["Table"] })).toBe("Table");
    expect(typeLabel({ kind: "object", of: ["Table", "CalculatedTable"] })).toBe(
      "Table | CalculatedTable",
    );
    expect(typeLabel({ kind: "object", of: "any" })).toBe("Object");
    expect(typeLabel({ kind: "collection", of: { kind: "object", of: ["Measure"] } })).toBe(
      "Collection<Measure>",
    );
    expect(
      typeLabel({ kind: "map", value: { kind: "string" }, onMissingKey: { value: null } }),
    ).toBe("Indexer<String>");
    expect(typeLabel({ kind: "nullable", of: { kind: "string" } })).toBe("String?");
    expect(
      typeLabel({ kind: "nullable", of: { kind: "object", of: ["Table", "CalculatedTable"] } }),
    ).toBe("(Table | CalculatedTable)?");
  });
});
