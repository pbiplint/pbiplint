import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/engine/config.js";
import { lint, type LintFile } from "../src/engine/lint.js";
import { runRules } from "../src/engine/run.js";
import { buildIndexes } from "../src/index/build.js";
import type { MessageId } from "../src/messages/en.js";
import {
  findingDetail,
  formatMessage,
  msg,
  templateArgs,
  type Catalog,
  type Message,
  type MessageParam,
} from "../src/messages/format.js";
import { eachQuery } from "../src/rules/m-helpers.js";
import { RULE_COULD_NOT_FINISH } from "../src/rules/rule-could-not-finish.js";
import type { Finding, Rule, RuleFinding } from "../src/rules/types.js";

// Test-only templates under made-up IDs, so these tests do not depend on the English catalog.
const catalog = {
  pair: "{a} and {b}",
  fields: "{n, plural, one {# field bound} other {# fields bound}}",
  fieldsOrNothing: "{n, plural, =0 {nothing} one {# field bound} other {# fields bound}}",
  plFields: "{n, plural, one {one} few {few #} many {many #} other {other #}}",
  object: "{k, select, page {page} other {bookmark}}",
  outer: "see {what}",
  plain: "{a}",
  pound: "Q#1 {a}",
} as unknown as Catalog;

const render = (id: string, params: Record<string, MessageParam> = {}, locale?: string) =>
  formatMessage(msg(id as MessageId, params), catalog, locale);

describe("formatMessage", () => {
  it("fills plain parameters, a number as its digits", () => {
    expect(render("pair", { a: "x", b: 2 })).toBe("x and 2");
  });

  it("picks a plural branch and writes # as the number", () => {
    expect(render("fields", { n: 1 })).toBe("1 field bound");
    expect(render("fields", { n: 0 })).toBe("0 fields bound");
    expect(render("fields", { n: 12 })).toBe("12 fields bound");
    expect(render("fieldsOrNothing", { n: 0 })).toBe("nothing");
    expect(render("fieldsOrNothing", { n: 1 })).toBe("1 field bound");
  });

  it("lets the locale's plural rules choose the category", () => {
    expect(render("plFields", { n: 1 }, "pl")).toBe("one");
    expect(render("plFields", { n: 2 }, "pl")).toBe("few 2");
    expect(render("plFields", { n: 5 }, "pl")).toBe("many 5");
  });

  it("picks a select branch, other when no key matches", () => {
    expect(render("object", { k: "page" })).toBe("page");
    expect(render("object", { k: "x" })).toBe("bookmark");
  });

  it("renders a nested message through the same catalog and locale", () => {
    const inner = msg("plFields" as MessageId, { n: 5 });
    expect(render("outer", { what: inner }, "pl")).toBe("see many 5");
  });

  it("writes a parameter as given, never reading it as a template", () => {
    expect(render("plain", { a: "Sales {EU} #2 'x'" })).toBe("Sales {EU} #2 'x'");
  });

  it("keeps a # outside a plural as itself", () => {
    expect(render("pound", { a: "x" })).toBe("Q#1 x");
  });

  it("writes a missing parameter as its placeholder and ignores an extra one", () => {
    expect(render("pair", { a: "x" })).toBe("x and {b}");
    expect(render("plain", { a: "x", z: "y" })).toBe("x");
  });

  it("falls back to the English template for an ID the catalog lacks", () => {
    expect(formatMessage(msg("context.table", { table: "Sales" }), {} as Catalog)).toBe(
      "table Sales",
    );
  });
});

describe("templateArgs", () => {
  it("lists plain, plural, and select arguments, including those inside branches", () => {
    const args = templateArgs(
      "{a} {n, plural, one {# {b}} other {{k, select, x {X {c}} other {Y}}}}",
    );
    expect(Object.fromEntries(args)).toEqual({
      a: { kind: "plain" },
      n: { kind: "plural" },
      b: { kind: "plain" },
      k: { kind: "select", keys: ["x", "other"] },
      c: { kind: "plain" },
    });
  });

  it.each(["{a", "a}", "{n, plural, one {x}}", "{n, frobnicate, x {y}}"])(
    "refuses %s",
    (template) => {
      expect(() => templateArgs(template)).toThrow(Error);
    },
  );
});

describe("runRules", () => {
  const returning = (f: RuleFinding): Rule => ({
    id: "TEST_RULE",
    name: "Test rule",
    category: "Maintenance",
    severity: 2,
    scope: ["Model"],
    layer: "model",
    needs: [],
    description: "Made up.",
    references: [],
    status: "builtin",
    check: () => [f],
  });
  const run = (f: RuleFinding) =>
    runRules({}, buildIndexes({}), [returning(f)], resolveConfig()).findings;

  it("renders a finding's message into its detail and keeps the ID and parameters", () => {
    const [f] = run({
      objectType: "Model",
      objectName: "Model",
      message: msg("context.table", { table: "'Sales'" }),
    });
    expect(f).toEqual({
      ruleId: "TEST_RULE",
      layer: "model",
      objectType: "Model",
      objectName: "Model",
      detail: "table 'Sales'",
      messageId: "context.table",
      params: { table: "'Sales'" },
    });
  });

  it("keeps a plain detail as it is, with no message ID or parameters", () => {
    const [f] = run({ objectType: "Model", objectName: "Model", detail: "x" });
    expect(f!.detail).toBe("x");
    expect(Object.keys(f!)).not.toContain("messageId");
    expect(Object.keys(f!)).not.toContain("params");
  });
});

describe("findingDetail", () => {
  it("renders the message when the finding has one, in the catalog given", () => {
    const f = { detail: "stale", messageId: "context.table" as const, params: { table: "'S'" } };
    expect(findingDetail(f)).toBe("table 'S'");
    expect(findingDetail(f, { "context.table": "Tabelle {table}" } as Catalog, "de")).toBe(
      "Tabelle 'S'",
    );
  });

  it("returns the detail when the finding has no message", () => {
    expect(findingDetail({ detail: "x" })).toBe("x");
    expect(findingDetail({})).toBeUndefined();
  });
});

describe("the shared messages (#98)", () => {
  const parseIssues = async (files: LintFile[]) =>
    (await lint(files)).findings.filter((f) => f.ruleId === "PARSE_ISSUE");
  const reasonId = (f: Finding) => (f.params?.reason as Message | undefined)?.id;

  it("gives a TMDL parse issue its reason as a nested message, rendering today's detail", async () => {
    const [f] = await parseIssues([{ path: "definition/tables/T.tmdl", text: "table T\n    x\n" }]);
    expect(f!.messageId).toBe("PARSE_ISSUE");
    expect(reasonId(f!)).toBe("parse.tmdl.spaceIndentation");
    expect(f!.detail).toBe("space indentation (TMDL requires tabs): x");
  });

  it("gives a PBIR JSON parse issue its reason as a nested message, the engine's text a parameter", async () => {
    const [f] = await parseIssues([{ path: "definition/pages/p/page.json", text: "{\n  ]\n" }]);
    expect(f!.messageId).toBe("PARSE_ISSUE");
    expect(reasonId(f!)).toBe("parse.pbir.notValidJson");
    expect(f!.detail).toMatch(/^not valid JSON \(.+\): \]$/);
    expect(f!.detail).toBe(formatMessage(msg(f!.messageId!, f!.params)));
  });

  it("gives M that does not parse its reason as a nested message", async () => {
    const [f] = await parseIssues([
      {
        path: "definition/tables/T.tmdl",
        text: "table T\n\tpartition T = m\n\t\tmode: import\n\t\tsource = 1 2\n",
      },
    ]);
    expect(f!.messageId).toBe("PARSE_ISSUE");
    expect(reasonId(f!)).toBe("parse.m.notParsed");
    expect(f!.detail).toBe(
      "M could not be parsed: Finished parsing but more tokens remain: source = 1 2",
    );
  });

  const throwing = (id: string, check: Rule["check"], layer: Rule["layer"] = "model"): Rule => ({
    id,
    name: "Test rule",
    category: "Maintenance",
    severity: 2,
    scope: [],
    layer,
    needs: ["model"],
    description: "",
    references: [],
    status: "ported",
    check,
  });
  const failures = async (rule: Rule) =>
    (
      await lint(
        [
          {
            path: "definition/tables/Sales.tmdl",
            text: "table Sales\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = 1\n",
          },
        ],
        { rules: [rule, RULE_COULD_NOT_FINISH] },
      )
    ).findings;

  it("names the model as a nested message when a whole rule throws", async () => {
    const [f] = await failures(
      throwing("WHOLE", () => {
        throw new RangeError("Maximum call stack size exceeded");
      }),
    );
    expect(f!.messageId).toBe("RULE_COULD_NOT_FINISH");
    expect((f!.params!.where as Message).id).toBe("ruleError.theModel");
    expect((f!.params!.kind as Message).id).toBe("ruleError.outOfStack");
    expect(f!.detail).toBe("WHOLE could not finish on the model: RangeError (out of stack space)");
  });

  it("names the query as a nested message when a Power Query rule throws on one", async () => {
    const [f] = await failures(
      throwing(
        "PER_QUERY",
        (_p, ctx) =>
          eachQuery(ctx, ctx.indexes.m.queries, () => {
            throw new TypeError("a message");
          }),
        "powerquery",
      ),
    );
    expect((f!.params!.where as Message).id).toBe("query.name");
    expect((f!.params!.kind as Message).id).toBe("ruleError.errorClass");
    expect(f!.detail).toBe("PER_QUERY could not finish on query 'Sales': TypeError");
  });

  it("gives a table permission's finding its role as a message", async () => {
    const r = await lint([
      {
        path: "definition/tables/T.tmdl",
        text: "table T\n\tcolumn C\n\t\tdataType: int64\n\tpartition T = m\n\t\tmode: import\n\t\tsource = 1\n",
      },
      {
        path: "definition/roles/R.tmdl",
        text: "role R\n\tmodelPermission: read\n\ttablePermission T = [C] = 1\n",
      },
    ]);
    const f = r.findings.find(
      (x) => x.ruleId === "DAX_COLUMNS_FULLY_QUALIFIED" && x.objectType === "TablePermission",
    );
    expect(f).toMatchObject({ detail: "role R", messageId: "context.role", params: { role: "R" } });
  });
});
