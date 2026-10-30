import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/engine/config.js";
import { lint, type LintFile } from "../src/engine/lint.js";
import { runRules } from "../src/engine/run.js";
import { buildIndexes } from "../src/index/build.js";
import { EN, type MessageId } from "../src/messages/en.js";
import {
  capped,
  findingDetail,
  formatMessage,
  msg,
  templateArgs,
  type Catalog,
  type Message,
  type MessageParam,
} from "../src/messages/format.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { eachQuery } from "../src/rules/m-helpers.js";
import {
  ACTION_WITHOUT_DESTINATION,
  BROKEN_ACTION_TARGET,
  BROKEN_BOOKMARK_REFERENCE,
} from "../src/rules/pbiplint/actions.js";
import { REPORT_LEVEL_MEASURES } from "../src/rules/pbiplint/measures.js";
import {
  FILTERS_PANE_STATE,
  LANDING_PAGE_NOT_SET,
  OPENING_PAGE_INVALID,
} from "../src/rules/pbiplint/opening.js";
import { HARDCODED_YEAR_IN_FILTER } from "../src/rules/pbiplint/filters.js";
import { DEFAULT_PAGE_NAME } from "../src/rules/pbiplint/pages.js";
import {
  BROKEN_FIELD_REFERENCE,
  NOT_REACHED_FROM_REPORT,
} from "../src/rules/pbiplint/references.js";
import { UDF_NOT_CALLED } from "../src/rules/pbiplint/functions.js";
import { HARDCODED_PERIOD_IN_DAX } from "../src/rules/pbiplint/periods.js";
import {
  DEFAULT_STEP_NAMES,
  DYNAMIC_DATA_SOURCE,
  EXCEL_USE_HEADERS,
  EXTENSION_FILTER_CASE,
  FIXED_DATE_IN_ROW_FILTER,
  HARDCODED_SECRET_IN_QUERY,
  HARDCODED_SERVER_NAME,
  INCREMENTAL_REFRESH_RANGE_BOUNDS,
  KEEP_FIRST_ROWS_LEFT_IN,
  LEGACY_EXCEL_FILE,
  LOCAL_DRIVE_PATH,
  ODBC_WHERE_CONNECTOR_EXISTS,
  PRIVACY_LEVELS_IGNORED,
  SCRIPT_IN_QUERY,
  SORT_NOT_HELD_FOR_REMOVE_DUPLICATES,
} from "../src/rules/pbiplint/power-query.js";
import { TAB_ORDER_FOLLOWS_LAYOUT } from "../src/rules/pbiplint/tab-order.js";
import { NAME_WITHOUT_TRANSLATION } from "../src/rules/pbiplint/translations.js";
import {
  HIDDEN_VISUAL_WITH_FIELDS,
  SLICER_SEARCH_SAVED,
  SLICER_SELECTION_SAVED,
  VISUAL_OUTSIDE_PAGE,
  VISUAL_WITHOUT_FIELDS,
} from "../src/rules/pbiplint/visuals.js";
import { RULE_COULD_NOT_FINISH } from "../src/rules/rule-could-not-finish.js";
import type { Finding, Rule, RuleFinding } from "../src/rules/types.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { mFindings, modelFrom, rendered } from "./helpers.js";
import { bound, column, j, lit, measure, page, reportFindings, visual } from "./report-helpers.js";

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
  list: "{names, list}",
  unitList: "{names, list, unit}",
  date: "{d, date}",
  broken: "{a",
  countOrSelect: "{n, plural, other {#}} {k, select, other {x}}",
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

describe("list and date parameters", () => {
  const listed = (items: readonly (string | Message)[], locale?: string) =>
    formatMessage(msg("list" as MessageId, { names: items }), { ...EN, ...catalog }, locale);

  // The cases of englishList, the list writer the list kind replaced, as it wrote them.
  it.each([
    [["2025"], "2025"],
    [["2024", "2025"], "2024 and 2025"],
    [["2024", "2025", "2026"], "2024, 2025, and 2026"],
    [["2024", "2025", "2026", "2027"], "2024, 2025, 2026, and 1 more"],
    [
      ["January 1, 2024", "June 30, 2024", "December 31, 2024"],
      "January 1, 2024; June 30, 2024; and December 31, 2024",
    ],
    [["2020", "2021", "2022", "2023", "2024", "2025"], "2020, 2021, 2022, and 3 more"],
    [["Sales, EU", "B", "C", "D"], "Sales, EU; B; C; and 1 more"],
  ])("renders %j with capped() as %j", (items, expected) => {
    expect(listed(capped(items))).toBe(expected);
  });

  // The unit style, which names every item and joins them with no conjunction.
  it("renders a unit list with no conjunction, and keeps its commas when an item holds one", () => {
    const unit = (items: readonly (string | Message)[], locale?: string) =>
      render("unitList", { names: items }, locale);
    expect(unit(["[A]"])).toBe("[A]");
    expect(unit(["[A]", "[B]"])).toBe("[A], [B]");
    expect(unit(["[A]", "[B]", "[C]"])).toBe("[A], [B], [C]");
    expect(unit(["[A]", "[B, EU]", "[C]"])).toBe("[A], [B, EU], [C]");
    expect(unit(["[A]", msg("plain" as MessageId, { a: "[B]" })])).toBe("[A], [B]");
    expect(unit(["a", "b", "c"], "xx-invalid-")).toBe("a, b, c");
  });

  // The listOf style of translations.ts and reachability.ts, which names every item.
  it("renders a list uncapped as listOf does", () => {
    expect(listed(["fr-FR"])).toBe("fr-FR");
    expect(listed(["de-DE", "fr-FR"])).toBe("de-DE and fr-FR");
    expect(listed(["fr-FR", "de-DE", "es-ES"])).toBe("fr-FR, de-DE, and es-ES");
    expect(listed(["fr-FR", "de-DE", "es-ES", "it-IT"])).toBe("fr-FR, de-DE, es-ES, and it-IT");
    expect(
      listed([
        'level "Year" of hierarchy "Calendar Hierarchy"',
        'level "FY" of hierarchy "Fiscal"',
        'level "Year" of hierarchy "Annual"',
      ]),
    ).toBe(
      'level "Year" of hierarchy "Calendar Hierarchy", level "FY" of hierarchy "Fiscal", and level "Year" of hierarchy "Annual"',
    );
  });

  it("uses semicolons in English when an item holds a comma, and Intl's punctuation elsewhere", () => {
    expect(listed(["Sales, EU", "B", "C"])).toBe("Sales, EU; B; and C");
    expect(listed(["Sales, EU", "B"])).toBe("Sales, EU and B");
    expect(listed(["Sales, EU", "B", "C"], "en-GB")).toBe("Sales, EU; B and C");
    expect(listed(["Sales, EU", "B", "C"], "EN-us")).toBe("Sales, EU; B; and C");
    expect(listed(["Sales, EU", "B", "C"], "de")).toBe("Sales, EU, B und C");
  });

  it("renders message items, as quoted names and the count of the rest", () => {
    const names = ["A", "B", "C", "D", "E"].map((name) => msg("quoted", { name }));
    expect(listed(capped(names))).toBe('"A", "B", "C", and 2 more');
    expect(listed(capped(names.slice(0, 3)))).toBe('"A", "B", and "C"');
    expect(capped(names, 5)).toEqual(names);
  });

  it("writes an ISO day in the locale's long form, in UTC so no day shifts", () => {
    const day = (date: string, locale?: string) =>
      formatMessage(msg("date.long", { date }), EN, locale);
    expect(day("2025-01-01")).toBe("January 1, 2025");
    expect(day("2025-12-31")).toBe("December 31, 2025");
    expect(day("2024-02-29")).toBe("February 29, 2024");
    expect(day("2025-01-05")).toBe("January 5, 2025");
    expect(day("2025-12-31", "de")).toBe("31. Dezember 2025");
    const days = ["2024-01-01", "2024-06-30", "2024-12-31"].map((date) =>
      msg("date.long", { date }),
    );
    expect(listed(capped(days))).toBe("January 1, 2024; June 30, 2024; and December 31, 2024");
  });

  it("writes a value that is not a day as given", () => {
    expect(render("date", { d: "not a day" })).toBe("not a day");
  });

  it("falls back to English for a locale Intl refuses, without throwing", () => {
    expect(listed(["a", "b", "c"], "xx-invalid-")).toBe("a, b, and c");
    expect(render("fields", { n: 1 }, "xx-invalid-")).toBe("1 field bound");
    expect(formatMessage(msg("date.long", { date: "2025-01-05" }), EN, "xx-invalid-")).toBe(
      "January 5, 2025",
    );
  });
});

describe("formatMessage on a slip in a catalog", () => {
  it("writes a template that does not parse as it stands, the second time too", () => {
    expect(render("broken", { a: "x" })).toBe("{a");
    expect(render("broken", { a: "x" })).toBe("{a");
  });

  it("writes a missing plural, select, or list parameter as its placeholder", () => {
    expect(render("countOrSelect")).toBe("{n} {k}");
    expect(render("list")).toBe("{names}");
  });
});

describe("templateArgs", () => {
  it("reports list and date arguments", () => {
    expect(Object.fromEntries(templateArgs("{names, list} on {d, date}"))).toEqual({
      names: { kind: "list" },
      d: { kind: "date" },
    });
    expect(Object.fromEntries(templateArgs("{names, list, unit}"))).toEqual({
      names: { kind: "list", style: "unit" },
    });
    expect(() => templateArgs("{names, list, short}")).toThrow(/unknown list style "short"/);
  });

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

  it("merges the keys of a select used twice", () => {
    const args = templateArgs("{k, select, a {A} other {O}} {k, select, b {B} other {O}}");
    expect(args.get("k")).toEqual({ kind: "select", keys: ["a", "other", "b"] });
  });

  it("refuses one name used as both a plural and a select", () => {
    expect(() => templateArgs("{n, plural, other {#}} {n, select, a {A} other {O}}")).toThrow(
      /"n" is both a plural and a select/,
    );
  });

  it("refuses one name used as lists of two styles, and allows a list of one style twice", () => {
    expect(() => templateArgs("{names, list} or {names, list, unit}")).toThrow(
      /"names" is both a list and a unit list/,
    );
    expect(() => templateArgs("{names, list, unit} or {names, list}")).toThrow(
      /"names" is both a unit list and a list/,
    );
    expect(Object.fromEntries(templateArgs("{names, list, unit} or {names, list, unit}"))).toEqual({
      names: { kind: "list", style: "unit" },
    });
    expect(Object.fromEntries(templateArgs("{names, list} or {names}"))).toEqual({
      names: { kind: "list" },
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

  it("returns the detail when no catalog knows the message, as from a newer pbiplint", () => {
    const f = { detail: "as written", messageId: "rule.fromTheFuture" as MessageId, params: {} };
    expect(findingDetail(f)).toBe("as written");
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

describe("the report rules' messages (#98)", () => {
  it("gives ENSURE_ALTTEXT and REDUCE_PAGES findings their message IDs", async () => {
    const files: LintFile[] = [
      { path: "definition/report.json", text: JSON.stringify({}) },
      ...Array.from({ length: 11 }, (_, i) => ({
        path: `definition/pages/p${i}/page.json`,
        text: JSON.stringify({ name: `p${i}`, displayName: `Page ${i}`, height: 720, width: 1280 }),
      })),
      {
        path: "definition/pages/p0/visuals/v/visual.json",
        text: JSON.stringify({
          name: "v",
          position: { x: 0, y: 0, z: 0, height: 100, width: 100 },
          visual: { visualType: "cardVisual" },
        }),
      },
    ];
    const { findings } = await lint(files);
    const byRule = (id: string) => findings.find((f) => f.ruleId === id);
    expect(byRule("ENSURE_ALTTEXT")).toMatchObject({
      detail: "no alt text",
      messageId: "ENSURE_ALTTEXT",
      params: {},
    });
    expect(byRule("REDUCE_PAGES")).toMatchObject({
      detail: "11 pages, more than 10",
      messageId: "REDUCE_PAGES",
      params: { count: 11, max: 10 },
    });
  });
});

describe("the action, opening, and page rules' messages (#98)", () => {
  /** Each finding of a rule as its message ID and the English it renders. */
  const said = (rule: Rule, files: LintFile[], tmdl?: string, options = {}) =>
    reportFindings(rule, files, tmdl, options).map((f) => [f.messageId, f.detail]);
  const link = (props: Record<string, unknown>) => ({
    visualContainerObjects: { visualLink: [{ properties: { show: lit("true"), ...props } }] },
  });
  const button = (name: string, props: Record<string, unknown>) =>
    visual("p", name, "actionButton", {}, link(props));
  const bookmark = (explorationState: Record<string, unknown>, options = {}) => ({
    path: "definition/bookmarks/b.bookmark.json",
    text: j({ name: "b", displayName: "B", options, explorationState }),
  });

  it("gives BROKEN_ACTION_TARGET and ACTION_WITHOUT_DESTINATION one message each", () => {
    const files = [
      page("p"),
      button("a", { type: lit("'PageNavigation'"), navigationSection: lit("'gone'") }),
      button("b", { type: lit("'Bookmark'"), bookmark: lit("'gone'") }),
      button("c", { type: lit("'Drillthrough'"), drillthroughSection: lit("'gone'") }),
      button("d", { type: lit("'pagenavigation'") }),
      button("e", { type: lit("'Bookmark'") }),
      button("f", { type: lit("'Drillthrough'") }),
    ];
    expect(said(BROKEN_ACTION_TARGET, files)).toEqual([
      [
        "BROKEN_ACTION_TARGET",
        'Page navigation action points at page "gone", which does not exist',
      ],
      ["BROKEN_ACTION_TARGET", 'Bookmark action points at bookmark "gone", which does not exist'],
      ["BROKEN_ACTION_TARGET", 'Drillthrough action points at page "gone", which does not exist'],
    ]);
    expect(said(ACTION_WITHOUT_DESTINATION, files)).toEqual([
      ["ACTION_WITHOUT_DESTINATION", "Page navigation action has no destination"],
      ["ACTION_WITHOUT_DESTINATION", "Bookmark action has no destination"],
      ["ACTION_WITHOUT_DESTINATION", "Drillthrough action has no destination"],
    ]);
    // The select key is the type in lower camel, whatever case the file writes it in.
    const keys = (rule: Rule) => reportFindings(rule, files).map((f) => f.params!.action);
    expect(keys(BROKEN_ACTION_TARGET)).toEqual(["pageNavigation", "bookmark", "drillthrough"]);
    expect(keys(ACTION_WITHOUT_DESTINATION)).toEqual([
      "pageNavigation",
      "bookmark",
      "drillthrough",
    ]);
  });

  it("gives each of BROKEN_BOOKMARK_REFERENCE's findings its own message", () => {
    const broken = bookmark({
      activeSection: "gone",
      sections: { p: { visualContainers: { missing: {} } }, other: {} },
    });
    expect(said(BROKEN_BOOKMARK_REFERENCE, [page("p"), broken])).toEqual([
      ["BROKEN_BOOKMARK_REFERENCE.activePage", 'active page "gone" does not exist'],
      ["BROKEN_BOOKMARK_REFERENCE.capturedPage", 'captured page "other" does not exist'],
      [
        "BROKEN_BOOKMARK_REFERENCE.capturedVisual",
        'captured visual "missing" is not on page "Page p"',
      ],
    ]);
  });

  it("names a bookmark's stale target visuals as a capped list of quoted names", () => {
    const stale = (targetVisualNames: string[]) =>
      reportFindings(BROKEN_BOOKMARK_REFERENCE, [
        page("p"),
        bookmark(
          { activeSection: "p", sections: { p: { visualContainers: {} } } },
          { applyOnlyToTargetVisuals: true, targetVisualNames },
        ),
      ]);
    const [one] = stale(["A"]);
    expect(one).toMatchObject({
      messageId: "BROKEN_BOOKMARK_REFERENCE.targetVisuals",
      detail: 'target visual "A" is not on page "Page p"',
      params: { count: 1, visuals: [msg("quoted", { name: "A" })], page: "Page p" },
    });
    expect(stale(["A", "B"])[0]!.detail).toBe(
      'target visuals "A" and "B" are not on page "Page p"',
    );
    const [five] = stale(["A", "B", "C", "D", "E"]);
    expect(five!.detail).toBe('target visuals "A", "B", "C", and 2 more are not on page "Page p"');
    expect((five!.params!.visuals as Message[]).map((m) => m.id)).toEqual([
      "quoted",
      "quoted",
      "quoted",
      "list.more",
    ]);
  });

  it("gives the opening rules a message for each thing they say", () => {
    const pages = (header: Record<string, unknown>) => [
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p", "h"], ...header }) },
      page("p"),
      page("h", { visibility: "HiddenInViewMode" }),
    ];
    expect(said(LANDING_PAGE_NOT_SET, pages({}))).toEqual([
      ["LANDING_PAGE_NOT_SET.opensOn", 'opens on "Page p", the first page'],
    ]);
    expect(said(LANDING_PAGE_NOT_SET, pages({ activePageName: "p" }))).toEqual([
      ["LANDING_PAGE_NOT_SET.opensOn", 'opens on "Page p", the page open when it was saved'],
    ]);
    expect(said(LANDING_PAGE_NOT_SET, pages({ activePageName: "gone" }))).toEqual([
      [
        "LANDING_PAGE_NOT_SET.activeMissing",
        'no landing page set; the active page "gone" does not exist',
      ],
    ]);
    expect(said(OPENING_PAGE_INVALID, pages({ landingPageName: "gone" }))).toEqual([
      ["OPENING_PAGE_INVALID.missing", 'landing page "gone" does not exist'],
    ]);
    expect(said(OPENING_PAGE_INVALID, pages({ activePageName: "gone" }))).toEqual([
      ["OPENING_PAGE_INVALID.missing", 'active page "gone" does not exist'],
    ]);
    expect(said(OPENING_PAGE_INVALID, pages({ activePageName: "h" }))).toEqual([
      ["OPENING_PAGE_INVALID.hidden", 'active page "Page h" is hidden from readers'],
    ]);
  });

  it("gives FILTERS_PANE_STATE one message, its states and policy as selects", () => {
    const pane = (properties: Record<string, unknown>, expect: string) =>
      reportFindings(
        FILTERS_PANE_STATE,
        [
          {
            path: "definition/report.json",
            text: j({ objects: { outspacePane: [{ properties }] } }),
          },
        ],
        undefined,
        { expect },
      ).map((f) => [f.messageId, f.detail, f.params]);
    expect(pane({}, "closed")).toEqual([
      [
        "FILTERS_PANE_STATE",
        "not recorded, read as open; the policy expects closed",
        { source: "assumed", state: "open", expect: "closed" },
      ],
    ]);
    expect(pane({ expanded: lit("true") }, "closed")).toEqual([
      [
        "FILTERS_PANE_STATE",
        "saved open; the policy expects closed",
        { source: "saved", state: "open", expect: "closed" },
      ],
    ]);
    expect(pane({ expanded: lit("false") }, "open")).toEqual([
      [
        "FILTERS_PANE_STATE",
        "saved closed; the policy expects open",
        { source: "saved", state: "closed", expect: "open" },
      ],
    ]);
    expect(pane({ visible: lit("false") }, "open")).toEqual([
      [
        "FILTERS_PANE_STATE",
        "saved hidden from readers; the policy expects open",
        { source: "saved", state: "hidden", expect: "open" },
      ],
    ]);
  });

  it("gives DEFAULT_PAGE_NAME and REPORT_LEVEL_MEASURES one message each", () => {
    const files = [
      page("a", { displayName: "Page 2" }),
      page("b", { displayName: 'Duplikat von "Overview"' }),
      page("c", { displayName: "Overview (copy)" }),
    ];
    expect(said(DEFAULT_PAGE_NAME, files)).toEqual([
      ["DEFAULT_PAGE_NAME", '"Page 2" is the name Power BI Desktop gives a new page'],
      [
        "DEFAULT_PAGE_NAME",
        '"Duplikat von "Overview"" is the name Power BI Desktop gives a duplicated page',
      ],
      ["DEFAULT_PAGE_NAME", '"Overview (copy)" is named as a copy'],
    ]);
    const measures = {
      path: "definition/reportExtensions.json",
      text: j({ entities: [{ name: "Sales", measures: [{ name: "M", expression: "1" }] }] }),
    };
    expect(said(REPORT_LEVEL_MEASURES, [measures], "table Sales\n")).toEqual([
      ["REPORT_LEVEL_MEASURES", 'defined in the report on table "Sales"'],
    ]);
  });
});

describe("the visual, tab order, and year filter rules' messages (#98)", () => {
  /** Each finding of a rule as its message ID, the English it renders, and its parameters. */
  const said = (rule: Rule, files: LintFile[], options = {}) =>
    reportFindings(rule, files, undefined, options).map((f) => [f.messageId, f.detail, f.params]);
  const amount = { Column: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Amount" } };
  const fields = (n: number) => ({
    query: {
      queryState: { Values: { projections: Array.from({ length: n }, () => ({ field: amount })) } },
    },
  });
  const group = (name: string, displayName: string, container: Record<string, unknown> = {}) => ({
    path: `definition/pages/p/visuals/${name}/visual.json`,
    text: j({
      name,
      position: { x: 0, y: 0, z: 0, height: 300, width: 400, tabOrder: 0 },
      visualGroup: { displayName, groupMode: "ScaleMode" },
      ...container,
    }),
  });

  it("gives HIDDEN_VISUAL_WITH_FIELDS a plural over the fields, the hiding group a second message", () => {
    const files = [
      page("p"),
      visual("p", "one", "card", { isHidden: true }, fields(1)),
      visual("p", "two", "card", { isHidden: true }, fields(2)),
      group("g", "Filters", { isHidden: true }),
      visual("p", "child", "card", { parentGroupName: "g" }, fields(3)),
    ];
    expect(said(HIDDEN_VISUAL_WITH_FIELDS, files)).toEqual([
      [
        "HIDDEN_VISUAL_WITH_FIELDS.groupHidden",
        '3 fields bound, hidden with Group "Filters"',
        { count: 3, group: 'Group "Filters"' },
      ],
      ["HIDDEN_VISUAL_WITH_FIELDS.visualHidden", "1 field bound", { count: 1 }],
      ["HIDDEN_VISUAL_WITH_FIELDS.visualHidden", "2 fields bound", { count: 2 }],
    ]);
  });

  it("gives VISUAL_OUTSIDE_PAGE a message for each set of edges, with only their overhangs", () => {
    const at = (name: string, x: number, y: number, width: number, height: number) =>
      visual("p", name, "cardVisual", { position: { x, y, z: 0, width, height, tabOrder: 0 } });
    const files = [
      page("p"),
      at("right", 1200, 0, 100, 50),
      at("bottom", 0, 621, 100, 100),
      at("both", 1250, 700, 100, 50),
    ];
    expect(said(VISUAL_OUTSIDE_PAGE, files)).toEqual([
      [
        "VISUAL_OUTSIDE_PAGE.both",
        "70 px past the right edge, 30 px past the bottom edge",
        { right: 70, bottom: 30 },
      ],
      ["VISUAL_OUTSIDE_PAGE.bottom", "1 px past the bottom edge", { bottom: 1 }],
      ["VISUAL_OUTSIDE_PAGE.right", "20 px past the right edge", { right: 20 }],
    ]);
  });

  it("gives VISUAL_WITHOUT_FIELDS, SLICER_SELECTION_SAVED, and SLICER_SEARCH_SAVED their messages", () => {
    const city = { Column: { Expression: { SourceRef: { Source: "s" } }, Property: "City" } };
    const where = (condition: unknown) => ({
      filter: {
        Version: 2,
        From: [{ Name: "s", Entity: "Store", Type: 0 }],
        Where: [{ Condition: condition }],
      },
    });
    const search = (value: string) =>
      where({ Contains: { Left: city, Right: { Literal: { Value: value } } } });
    const slicer = (name: string, properties: Record<string, unknown>) =>
      visual("p", name, "slicer", {}, { ...fields(1), objects: { general: [{ properties }] } });
    const files = [
      page("p"),
      visual("p", "empty", "card"),
      slicer("picked", {
        filter: where({ In: { Expressions: [city], Values: [[lit("'Leeds'").expr]] } }),
      }),
      slicer("termed", { selfFilter: search("'spring'") }),
      slicer("unread", { selfFilter: search("12L") }),
    ];
    expect(said(VISUAL_WITHOUT_FIELDS, files)).toEqual([
      ["VISUAL_WITHOUT_FIELDS", "no fields bound", {}],
    ]);
    expect(said(SLICER_SELECTION_SAVED, files)).toEqual([
      ["SLICER_SELECTION_SAVED", "opens with this selection applied", {}],
    ]);
    expect(said(SLICER_SEARCH_SAVED, files)).toEqual([
      ["SLICER_SEARCH_SAVED.term", 'opens with the search term "spring" saved', { term: "spring" }],
      ["SLICER_SEARCH_SAVED.termUnread", "opens with a search term saved", {}],
    ]);
  });

  it("gives TAB_ORDER_FOLLOWS_LAYOUT two messages, a group's nested in a third", () => {
    const at = (name: string, x: number, y: number, tabOrder: number, container = {}) =>
      visual("p", name, "cardVisual", {
        position: { x, y, z: 0, width: 100, height: 50, tabOrder },
        ...container,
      });
    const layout = { expect: "layout" };
    // No group: the rule's own message alone.
    expect(
      said(TAB_ORDER_FOLLOWS_LAYOUT, [page("p"), at("a", 0, 0, 1), at("b", 0, 200, 0)], layout),
    ).toEqual([
      [
        "TAB_ORDER_FOLLOWS_LAYOUT.startsAt",
        "tab order starts at cardVisual (b) but the layout reads cardVisual (a) first",
        { tabVisual: "cardVisual (b)", layoutVisual: "cardVisual (a)" },
      ],
    ]);
    const visits = [page("p"), at("a", 0, 0, 0), at("b", 200, 0, 2), at("c", 400, 0, 1)];
    expect(said(TAB_ORDER_FOLLOWS_LAYOUT, visits, layout)).toEqual([
      [
        "TAB_ORDER_FOLLOWS_LAYOUT.visits",
        "tab order visits cardVisual (c) where the layout reads cardVisual (b)",
        { tabVisual: "cardVisual (c)", layoutVisual: "cardVisual (b)" },
      ],
    ]);
    const grouped = [
      page("p"),
      group("g", "Filters"),
      at("s1", 0, 0, 1, { parentGroupName: "g" }),
      at("s2", 0, 60, 0, { parentGroupName: "g" }),
    ];
    expect(said(TAB_ORDER_FOLLOWS_LAYOUT, grouped, layout)).toEqual([
      [
        "TAB_ORDER_FOLLOWS_LAYOUT.inGroup",
        'in Group "Filters", tab order starts at cardVisual (s2) but the layout reads cardVisual (s1) first',
        {
          group: 'Group "Filters"',
          disagreement: msg("TAB_ORDER_FOLLOWS_LAYOUT.startsAt", {
            tabVisual: "cardVisual (s2)",
            layoutVisual: "cardVisual (s1)",
          }),
        },
      ],
    ]);
  });

  describe("HARDCODED_YEAR_IN_FILTER", () => {
    const col = { Column: { Expression: { SourceRef: { Source: "d" } }, Property: "Year" } };
    const literal = (value: string) => ({ Literal: { Value: value } });
    const year = (kind: number, value: string) => ({
      Comparison: { ComparisonKind: kind, Left: col, Right: literal(value) },
    });
    const field = { Column: { Expression: { SourceRef: { Entity: "Date" } }, Property: "Year" } };
    const onPage = (condition: unknown, named: boolean) =>
      page("p", {
        filterConfig: {
          filters: [
            {
              name: "f1",
              ...(named ? { field } : {}),
              type: "Categorical",
              filter: {
                Version: 2,
                From: [{ Name: "d", Entity: "Date", Type: 0 }],
                Where: [{ Condition: condition }],
              },
              howCreated: "User",
            },
          ],
        },
      });
    const kept = (...years: string[]) => ({
      In: { Expressions: [col], Values: years.map((y) => [literal(y)]) },
    });
    const yearsOf = (condition: unknown, named = false) =>
      said(HARDCODED_YEAR_IN_FILTER, [onPage(condition, named)]);

    it("names fixed years as a capped list with a plural", () => {
      expect(yearsOf(kept("2024L"))).toEqual([
        ["HARDCODED_YEAR_IN_FILTER.fixedYears", "fixed year 2024", { count: 1, years: ["2024"] }],
      ]);
      expect(yearsOf(kept("2024L", "2025L"))[0]!.slice(0, 2)).toEqual([
        "HARDCODED_YEAR_IN_FILTER.fixedYears",
        "fixed years 2024 and 2025",
      ]);
      expect(yearsOf(kept("2021L", "2022L", "2023L", "2024L", "2025L"))).toEqual([
        [
          "HARDCODED_YEAR_IN_FILTER.fixedYears",
          "fixed years 2021, 2022, 2023, and 2 more",
          { count: 5, years: ["2021", "2022", "2023", msg("list.more", { count: 2 })] },
        ],
      ]);
      // Advanced filtering's "is" keeps one year too.
      expect(yearsOf(year(0, "2025L"))[0]![1]).toBe("fixed year 2025");
    });

    it("names years up to one, and a range, each in a message of its own", () => {
      expect(yearsOf(year(3, "2026L"))).toEqual([
        ["HARDCODED_YEAR_IN_FILTER.yearsUpTo", "years up to 2025", { year: 2025 }],
      ]);
      const range = { And: { Left: year(2, "2018L"), Right: year(4, "2025L") } };
      expect(yearsOf(range)).toEqual([
        ["HARDCODED_YEAR_IN_FILTER.yearRange", "years 2018 to 2025", { from: 2018, to: 2025 }],
      ]);
    });

    it("nests what a filter keeps in a message naming its field, and stands alone without one", () => {
      expect(yearsOf(kept("2024L"), true)).toEqual([
        [
          "HARDCODED_YEAR_IN_FILTER.onField",
          "fixed year 2024 on 'Date'[Year]",
          {
            kept: msg("HARDCODED_YEAR_IN_FILTER.fixedYears", { count: 1, years: ["2024"] }),
            field: "'Date'[Year]",
          },
        ],
      ]);
    });
  });
});

describe("the field reference and reachability messages (#98)", () => {
  const tmdl = `table Sales
	column Amount
		dataType: decimal
	measure 'Total Sales' = SUM('Sales'[Amount])

table Product
	column Name
		dataType: string
`;
  const hierarchyLevel = (entity: string, hierarchy: string, level: string) => ({
    HierarchyLevel: {
      Expression: {
        Hierarchy: { Expression: { SourceRef: { Entity: entity } }, Hierarchy: hierarchy },
      },
      Level: level,
    },
  });
  /** Each finding as its message ID, the English it renders, and its nested reason's ID. */
  const said = (rule: Rule, files: LintFile[], model?: string) =>
    reportFindings(rule, files, model).map((f) => [
      f.messageId,
      f.detail,
      (f.params?.reason as Message | undefined)?.id,
    ]);

  it("gives BROKEN_FIELD_REFERENCE one message, its reason nested under an ID per reason", () => {
    const files = [
      page("p"),
      bound("p", "v", "tableEx", [
        column("Nowhere", "X"),
        column("Sales", "Nope"),
        measure("Sales", "Profit"),
        column("Sales", "Total Sales"),
        measure("Product", "Total Sales"),
        hierarchyLevel("Sales", "Calendar", "Year"),
      ]),
    ];
    expect(said(BROKEN_FIELD_REFERENCE, files, tmdl)).toEqual([
      [
        "BROKEN_FIELD_REFERENCE",
        `'Nowhere'[X]: no table named "Nowhere"`,
        "BROKEN_FIELD_REFERENCE.noTable",
      ],
      [
        "BROKEN_FIELD_REFERENCE",
        `'Sales'[Nope]: no column named "Nope" on "Sales"`,
        "BROKEN_FIELD_REFERENCE.noColumn",
      ],
      [
        "BROKEN_FIELD_REFERENCE",
        `[Profit]: no measure named "Profit" on "Sales"`,
        "BROKEN_FIELD_REFERENCE.noMeasure",
      ],
      [
        "BROKEN_FIELD_REFERENCE",
        `'Sales'[Total Sales]: "Total Sales" is a measure on "Sales", not a column`,
        "BROKEN_FIELD_REFERENCE.measureNotColumn",
      ],
      [
        "BROKEN_FIELD_REFERENCE",
        `[Total Sales]: [Total Sales] is on "Sales", not "Product"`,
        "BROKEN_FIELD_REFERENCE.measureElsewhere",
      ],
      [
        "BROKEN_FIELD_REFERENCE",
        `'Sales'[Calendar].[Year]: no hierarchy named "Calendar" on "Sales"`,
        "BROKEN_FIELD_REFERENCE.noHierarchy",
      ],
    ]);
    expect(said(BROKEN_FIELD_REFERENCE, files)).toEqual(
      Array.from({ length: 6 }, () => [
        "BROKEN_FIELD_REFERENCE",
        expect.stringMatching(/: no model in the input$/),
        "BROKEN_FIELD_REFERENCE.noModel",
      ]),
    );
  });

  it("keeps `table` the table the reference names when the measure sits on another", () => {
    const files = [page("p"), bound("p", "v", "tableEx", [measure("Product", "Total Sales")])];
    const [f] = reportFindings(BROKEN_FIELD_REFERENCE, files, tmdl);
    expect(f!.params!.reason).toEqual(
      msg("BROKEN_FIELD_REFERENCE.measureElsewhere", {
        measure: "Total Sales",
        measureTable: "Sales",
        table: "Product",
      }),
    );
    expect(f!.detail).toBe(`[Total Sales]: [Total Sales] is on "Sales", not "Product"`);
  });

  it("keeps one finding per object and field, now that the detail is a message", () => {
    // The same missing column in the visual's role and again in its own filter.
    const files = [
      page("p"),
      bound("p", "v", "tableEx", [column("Sales", "Nope")], {
        filterConfig: {
          filters: [{ name: "f", field: column("Sales", "Nope"), type: "Categorical" }],
        },
      }),
    ];
    expect(said(BROKEN_FIELD_REFERENCE, files, tmdl)).toEqual([
      [
        "BROKEN_FIELD_REFERENCE",
        `'Sales'[Nope]: no column named "Nope" on "Sales"`,
        "BROKEN_FIELD_REFERENCE.noColumn",
      ],
    ]);
  });

  describe("NOT_REACHED_FROM_REPORT", () => {
    const NONE = "nothing in the report reaches it, and no measure or column references it";
    const dates = (levels: string) => `table Sales
	column Amount
		dataType: decimal
	measure 'Total Sales' = SUM('Sales'[Amount])
	measure 'Sales LY' = CALCULATE([Total Sales])
	measure 'Sales YoY %' = [Total Sales] - [Sales LY]

table Date
	column Date
		dataType: dateTime
	column Year
		dataType: int64
${levels}`;
    const files = [page("p"), bound("p", "v", "cardVisual", [measure("Sales", "Total Sales")])];
    /** Each finding as its object, message ID, English, and the ID of the reason it nests. */
    const reached = (model: string) =>
      reportFindings(NOT_REACHED_FROM_REPORT, files, model).map((f) => [
        f.objectName,
        f.messageId,
        f.detail,
        (f.params?.reason as Message | undefined)?.id,
      ]);

    it("names the referrers as a unit list, comma-joined as before, a comma in a name kept", () => {
      const [base] = reportFindings(
        NOT_REACHED_FROM_REPORT,
        files,
        `table Sales
	column Amount
		dataType: decimal
	measure 'Total Sales' = SUM('Sales'[Amount])
	measure Base = 1
	measure A = [Base]
	measure 'B, EU' = [Base] * 2
	measure C = [Base] * 3
`,
      );
      expect([base!.objectName, base!.detail, base!.params]).toEqual([
        "[Base]",
        "referenced only by [A], [B, EU], [C], which nothing reaches either",
        { referrers: ["[A]", "[B, EU]", "[C]"] },
      ]);
    });

    it("gives each reason its own message, and nests it under the levels that use a column", () => {
      expect(
        reached(
          dates(`
	hierarchy Calendar
		level Year
			column: Year
`),
        ),
      ).toEqual([
        [
          "[Sales LY]",
          "NOT_REACHED_FROM_REPORT.referencedOnly",
          "referenced only by [Sales YoY %], which nothing reaches either",
          undefined,
        ],
        ["[Sales YoY %]", "NOT_REACHED_FROM_REPORT.nothingReaches", NONE, undefined],
        ["'Date'[Date]", "NOT_REACHED_FROM_REPORT.nothingReaches", NONE, undefined],
        [
          "'Date'[Year]",
          "NOT_REACHED_FROM_REPORT.levels",
          `${NONE}; level "Year" of hierarchy "Calendar" uses it`,
          "NOT_REACHED_FROM_REPORT.nothingReaches",
        ],
      ]);
    });

    it("takes a plural over the levels, each a message that quotes its names", () => {
      const [year] = reportFindings(
        NOT_REACHED_FROM_REPORT,
        files,
        dates(`
	hierarchy Calendar
		level Year
			column: Year

	hierarchy Fiscal
		level FY
			column: Year
`),
      ).filter((f) => f.objectName === "'Date'[Year]");
      expect(year!.detail).toBe(
        `${NONE}; level "Year" of hierarchy "Calendar" and level "FY" of hierarchy "Fiscal" use it`,
      );
      expect(year!.params).toEqual({
        reason: msg("NOT_REACHED_FROM_REPORT.nothingReaches"),
        levels: [
          msg("NOT_REACHED_FROM_REPORT.level", { level: "Year", hierarchy: "Calendar" }),
          msg("NOT_REACHED_FROM_REPORT.level", { level: "FY", hierarchy: "Fiscal" }),
        ],
        count: 2,
      });
    });

    it("joins three levels with semicolons when one holds a comma, on purpose (spec section 4)", () => {
      const [year] = reportFindings(
        NOT_REACHED_FROM_REPORT,
        files,
        dates(`
	hierarchy Calendar
		level Year
			column: Year

	hierarchy 'Fiscal, Retail'
		level FY
			column: Year

	hierarchy Annual
		level Year
			column: Year
`),
      ).filter((f) => f.objectName === "'Date'[Year]");
      // Before, the list's own commas: `"Calendar", level "FY" of hierarchy "Fiscal, Retail", and`.
      expect(year!.detail).toBe(
        `${NONE}; level "Year" of hierarchy "Calendar"; level "FY" of hierarchy "Fiscal, Retail"; and level "Year" of hierarchy "Annual" use it`,
      );
    });
  });
});

describe("the period, translation, and function rules' messages (#98)", () => {
  /** Each finding of a model rule, rendered as `runRules` renders it: ID, English, parameters. */
  const said = (rule: Rule, model: Model) =>
    rule
      .check({ model }, { indexes: buildIndexes({ model }), options: {} })
      .map(rendered)
      .map((f) => [f.messageId, f.detail, f.params]);
  const day = (date: string) => msg("date.long", { date });

  describe("HARDCODED_PERIOD_IN_DAX", () => {
    /** A Sales table with one measure, `Stale`, whose DAX is `dax`. */
    const stale = (dax: string) =>
      modelFrom(
        `table Sales\n\tcolumn 'Order Date'\n\t\tdataType: dateTime\n\tmeasure Stale = ${dax}\n`,
      );
    const fixedIn = (dax: string) => said(HARDCODED_PERIOD_IN_DAX, stale(dax));
    const on = (...days: string[]) =>
      `CALCULATE([Total], ${days.map((d) => `'Sales'[Order Date] <> ${d}`).join(", ")})`;
    /** A calculated table whose CALENDAR calls end on the days given. */
    const ends = (...days: string[]) =>
      modelFrom(
        `table Date\n\tcolumn Date\n\t\tdataType: dateTime\n\tpartition Date = calculated\n\t\tsource = UNION(${days.map((d) => `CALENDAR(DATE(2000, 1, 1), ${d})`).join(", ")})\n`,
      );

    it("names one date, two joined with and, and three with semicolons, each a date.long item", () => {
      expect(fixedIn(on("DATE(2024, 1, 1)"))).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.fixed",
          "fixed date January 1, 2024",
          { kind: "date", count: 1, periods: [day("2024-01-01")] },
        ],
      ]);
      expect(fixedIn(on("DATE(2024, 1, 1)", "DATE(2025, 3, 3)"))[0]![1]).toBe(
        "fixed dates January 1, 2024 and March 3, 2025",
      );
      expect(fixedIn(on("DATE(2024, 1, 1)", "DATE(2025, 3, 3)", "DATE(2025, 5, 5)"))).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.fixed",
          "fixed dates January 1, 2024; March 3, 2025; and May 5, 2025",
          {
            kind: "date",
            count: 3,
            periods: [day("2024-01-01"), day("2025-03-03"), day("2025-05-05")],
          },
        ],
      ]);
    });

    it("caps five years at three and the count of the rest, and names a mix as periods", () => {
      expect(
        fixedIn(`CALCULATE([Total], 'Sales'[Year] IN {2021, 2022, 2023, 2024, 2025})`),
      ).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.fixed",
          "fixed years 2021, 2022, 2023, and 2 more",
          {
            kind: "year",
            count: 5,
            periods: ["2021", "2022", "2023", msg("list.more", { count: 2 })],
          },
        ],
      ]);
      expect(
        fixedIn(`CALCULATE([Total], 'Sales'[Year] = 2025, 'Sales'[Year] = 2025)`)[0]!.slice(1),
      ).toEqual(["fixed year 2025", { kind: "year", count: 1, periods: ["2025"] }]);
      expect(
        fixedIn(
          `CALCULATE([Total], 'Sales'[Year] = 2025, 'Sales'[Order Date] <= DATE(2024, 12, 31))`,
        ),
      ).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.fixed",
          "fixed periods 2025 and December 31, 2024",
          { kind: "mixed", count: 2, periods: ["2025", day("2024-12-31")] },
        ],
      ]);
    });

    it("names a date table's end, or ends, in one template with a plural, an ambiguous day quoted", () => {
      expect(said(HARDCODED_PERIOD_IN_DAX, ends("DATE(2026, 12, 31)"))).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.endsOn",
          "ends on a fixed date, December 31, 2026",
          { count: 1, dates: [day("2026-12-31")] },
        ],
      ]);
      expect(
        said(HARDCODED_PERIOD_IN_DAX, ends("DATE(2025, 12, 31)", "DATE(2026, 12, 31)")),
      ).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.endsOn",
          "ends on fixed dates December 31, 2025 and December 31, 2026",
          { count: 2, dates: [day("2025-12-31"), day("2026-12-31")] },
        ],
      ]);
      expect(said(HARDCODED_PERIOD_IN_DAX, ends(`"01/02/2026"`))).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.endsOn",
          `ends on a fixed date, "01/02/2026"`,
          { count: 1, dates: [msg("quoted", { name: "01/02/2026" })] },
        ],
      ]);
    });

    it("writes a three-digit year as an ISO day padded to four digits, and in English as written", () => {
      expect(said(HARDCODED_PERIOD_IN_DAX, ends("DATE(999, 12, 31)"))).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.endsOn",
          "ends on a fixed date, December 31, 999",
          { count: 1, dates: [day("0999-12-31")] },
        ],
      ]);
      expect(said(HARDCODED_PERIOD_IN_DAX, ends("DATE(100, 1, 1)"))[0]![1]).toBe(
        "ends on a fixed date, January 1, 100",
      );
    });

    it("nests its own message in one naming the context, and stands alone without one", () => {
      const model = modelFrom(
        "table 'Time Calc'\n\tcalculationGroup\n\t\tcalculationItem 'This Year' = CALCULATE(SELECTEDMEASURE(), 'Date'[Year] = 2025)\n\tcolumn Name\n\t\tdataType: string\n",
      );
      const fixed = msg("HARDCODED_PERIOD_IN_DAX.fixed", {
        kind: "year",
        count: 1,
        periods: ["2025"],
      });
      expect(said(HARDCODED_PERIOD_IN_DAX, model)).toEqual([
        [
          "HARDCODED_PERIOD_IN_DAX.inContext",
          "fixed year 2025 in calculation group 'Time Calc'",
          { fixed, context: msg("context.calculationGroup", { table: "'Time Calc'" }) },
        ],
      ]);
      expect(fixedIn(`CALCULATE([Total], 'Sales'[Year] = 2025)`)).toEqual([
        ["HARDCODED_PERIOD_IN_DAX.fixed", "fixed year 2025", fixed.params],
      ]);
    });
  });

  describe("NAME_WITHOUT_TRANSLATION", () => {
    /** A model with a culture of its own, Sales with a hierarchy over a hidden column, and these cultures, which caption nothing. */
    const translated = (...cultures: string[]) =>
      buildModel([
        parseTmdl("definition/model.tmdl", "model Model\n\tculture: en-US\n"),
        parseTmdl(
          "definition/tables/Sales.tmdl",
          "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\t\tisHidden\n\thierarchy Geography\n\t\tlevel Country\n\t\t\tcolumn: Amount\n",
        ),
        ...cultures.map((c) =>
          parseTmdl(
            `definition/cultures/${c}.tmdl`,
            `cultureInfo ${c}\n\ttranslations\n\t\tmodel Model\n`,
          ),
        ),
      ]);
    const noCaption = (...cultures: string[]) =>
      msg("NAME_WITHOUT_TRANSLATION.noCaption", { cultures });

    it("names the cultures as a list, after the context when the object has one", () => {
      expect(said(NAME_WITHOUT_TRANSLATION, translated("fr-FR"))).toEqual([
        ["NAME_WITHOUT_TRANSLATION.noCaption", "no caption in fr-FR", { cultures: ["fr-FR"] }],
        [
          "NAME_WITHOUT_TRANSLATION.inContext",
          "table 'Sales', no caption in fr-FR",
          { context: msg("context.table", { table: "'Sales'" }), captions: noCaption("fr-FR") },
        ],
        [
          "NAME_WITHOUT_TRANSLATION.inContext",
          "hierarchy Geography in 'Sales', no caption in fr-FR",
          {
            context: msg("context.level", { hierarchy: "Geography", table: "'Sales'" }),
            captions: noCaption("fr-FR"),
          },
        ],
      ]);
      const three = said(NAME_WITHOUT_TRANSLATION, translated("fr-FR", "de-DE", "es-ES"));
      expect(three.map((f) => f[1])).toEqual([
        "no caption in de-DE, es-ES, and fr-FR",
        "table 'Sales', no caption in de-DE, es-ES, and fr-FR",
        "hierarchy Geography in 'Sales', no caption in de-DE, es-ES, and fr-FR",
      ]);
    });

    it("stands alone on an object with no context", () => {
      const model = buildModel([
        parseTmdl("definition/model.tmdl", "model Model\n\tculture: en-US\n"),
        parseTmdl("definition/tables/Sales.tmdl", "table Sales\n\tmeasure Total = 1\n"),
        parseTmdl(
          "definition/cultures/fr-FR.tmdl",
          "cultureInfo fr-FR\n\ttranslations\n\t\tmodel Model\n\t\t\ttable Sales\n\t\t\t\tcaption: Ventes\n",
        ),
        parseTmdl(
          "definition/cultures/de-DE.tmdl",
          "cultureInfo de-DE\n\ttranslations\n\t\tmodel Model\n\t\t\ttable Sales\n\t\t\t\tcaption: Verkauf\n",
        ),
      ]);
      expect(said(NAME_WITHOUT_TRANSLATION, model)).toEqual([
        [
          "NAME_WITHOUT_TRANSLATION.noCaption",
          "no caption in de-DE and fr-FR",
          { cultures: ["de-DE", "fr-FR"] },
        ],
      ]);
    });
  });

  describe("UDF_NOT_CALLED", () => {
    const packaged = (name: string, pkg: string) =>
      `function '${name}' = () => 1\n\tlineageTag: ${name}\n\n\tannotation DAXLIB_PackageId = ${pkg}\n\n`;

    it("names an uncalled package with a plural over its functions, and a function of the model's own with no message", () => {
      const model = buildModel([
        parseTmdl("definition/tables/Sales.tmdl", "table Sales\n\tmeasure Total = 1\n"),
        parseTmdl(
          "definition/functions.tmdl",
          packaged("Contoso.Tax.Rate", "Contoso.Tax") +
            packaged("Contoso.Tax.Apply", "Contoso.Tax") +
            packaged("Contoso.Round.Two", "Contoso.Round") +
            "function 'Local.Unused' = () => 2\n",
        ),
      ]);
      expect(said(UDF_NOT_CALLED, model)).toEqual([
        [
          "UDF_NOT_CALLED.package",
          "package Contoso.Tax: none of its 2 functions is called",
          { package: "Contoso.Tax", count: 2 },
        ],
        [
          "UDF_NOT_CALLED.package",
          "package Contoso.Round: its one function is not called",
          { package: "Contoso.Round", count: 1 },
        ],
        [undefined, undefined, undefined],
      ]);
    });
  });
});

describe("the Power Query frame and the Power Query rules' messages (#98)", () => {
  /** A table whose one M partition holds `m`, as Desktop writes a block. */
  const table = (name: string, ...m: string[]): string =>
    `table '${name}'\n\tpartition '${name}' = m\n\t\tmode: import\n\t\tsource =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n\n`;
  /** A query `name` whose one step, `step`, is `expression`. */
  const oneStep = (name: string, step: string, expression: string): string =>
    table(name, "let", `\t${step} = ${expression}`, "in", `\t${step}`);
  /** Each finding of a Power Query rule, rendered as `runRules` renders it: ID, English, parameters. */
  const said = async (rule: Rule, tmdl: string) =>
    (await mFindings(rule, tmdl)).map((f) => [f.messageId, f.detail, f.params]);
  const query = (name: string) => msg("query.name", { query: name });
  /** The frame's parameters with a step: `query 'Sales', step 'Source': …`. */
  const atStep = (q: Message, step: string, finding: Message) => ({ query: q, step, finding });

  describe("the frame", () => {
    it("names the query and the step that holds the node, the rule's message nested", async () => {
      expect(
        await said(LOCAL_DRIVE_PATH, oneStep("Sales", "Source", 'File.Contents("C:\\Sales.csv")')),
      ).toEqual([
        [
          "query.stepFinding",
          "query 'Sales', step 'Source': the path is on a local drive (C:)",
          atStep(query("'Sales'"), "'Source'", msg("LOCAL_DRIVE_PATH", { drive: "C" })),
        ],
      ]);
    });

    it("names the query alone when no step holds the node", async () => {
      expect(
        await said(
          LOCAL_DRIVE_PATH,
          'expression ExportFolder = "d:/Exports/" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n',
        ),
      ).toEqual([
        [
          "query.finding",
          "query 'ExportFolder': the path is on a local drive (D:)",
          { query: query("'ExportFolder'"), finding: msg("LOCAL_DRIVE_PATH", { drive: "D" }) },
        ],
      ]);
    });

    it("names the partition when the table has two M partitions, with a step and without", async () => {
      const tmdl =
        "table Sales\n" +
        '\tpartition Current = m\n\t\tmode: import\n\t\tsource = File.Contents("C:\\Current.csv")\n\n' +
        '\tpartition Archive = m\n\t\tmode: import\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t\tOld = File.Contents("E:\\Old.csv")\n\t\t\t\tin\n\t\t\t\t\tOld\n\n';
      const partition = (p: string) =>
        msg("query.partition", { query: "'Sales'", partition: `'${p}'` });
      expect(await said(LOCAL_DRIVE_PATH, tmdl)).toEqual([
        [
          "query.finding",
          "query 'Sales', partition 'Current': the path is on a local drive (C:)",
          { query: partition("Current"), finding: msg("LOCAL_DRIVE_PATH", { drive: "C" }) },
        ],
        [
          "query.stepFinding",
          "query 'Sales', partition 'Archive', step 'Old': the path is on a local drive (E:)",
          atStep(partition("Archive"), "'Old'", msg("LOCAL_DRIVE_PATH", { drive: "E" })),
        ],
      ]);
    });
  });

  it("gives SCRIPT_IN_QUERY a language select, Python's and R's", async () => {
    const tmdl = table(
      "Scores",
      "let",
      '\tSource = #table({"Score"}, {{1}}),',
      '\tPy = Python.Execute("x", [dataset = Source]),',
      '\tR = R.Execute("x", [dataset = Source])',
      "in",
      "\tR",
    );
    expect(await said(SCRIPT_IN_QUERY, tmdl)).toEqual([
      [
        "query.stepFinding",
        "query 'Scores', step 'Py': Python.Execute refreshes only through a personal gateway on a machine with Python installed",
        atStep(query("'Scores'"), "'Py'", msg("SCRIPT_IN_QUERY", { language: "python" })),
      ],
      [
        "query.stepFinding",
        "query 'Scores', step 'R': R.Execute refreshes only through a personal gateway on a machine with R installed",
        atStep(query("'Scores'"), "'R'", msg("SCRIPT_IN_QUERY", { language: "r" })),
      ],
    ]);
  });

  it("gives EXCEL_USE_HEADERS one message with no parameters", async () => {
    expect(
      await said(
        EXCEL_USE_HEADERS,
        oneStep(
          "Budget",
          "Reader",
          'Excel.Workbook(Web.Contents("https://example.com/B.xlsx"), true)',
        ),
      ),
    ).toEqual([
      [
        "query.stepFinding",
        "query 'Budget', step 'Reader': Excel.Workbook promotes headers in the refreshing machine's culture",
        atStep(query("'Budget'"), "'Reader'", msg("EXCEL_USE_HEADERS")),
      ],
    ]);
  });

  it("gives ODBC_WHERE_CONNECTOR_EXISTS the connection kind and the connector as selects, each article in the catalog", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tRedshift = Odbc.DataSource("Driver={Amazon Redshift (x64)};Server=r.example"),',
      '\tSqlServer = OleDb.DataSource("Provider=MSOLEDBSQL;Data Source=s.example"),',
      '\tOracle = OleDb.DataSource("Provider=OraOLEDB.Oracle;Data Source=o.example"),',
      '\tPostgres = Odbc.DataSource("Driver={PostgreSQL Unicode(x64)};Server=p.example"),',
      '\tMy = Odbc.DataSource("Driver={MySQL ODBC 8.0 Unicode Driver};Server=m.example"),',
      '\tSnow = Odbc.DataSource("Driver={SnowflakeDSIIDriver};Server=s.example")',
      "in",
      "\tSnow",
    );
    const odbc = (step: string, kind: string, connector: string, detail: string) => [
      "query.stepFinding",
      `query 'Orders', step '${step}': ${detail}`,
      atStep(
        query("'Orders'"),
        `'${step}'`,
        msg("ODBC_WHERE_CONNECTOR_EXISTS", { kind, connector }),
      ),
    ];
    expect(await said(ODBC_WHERE_CONNECTOR_EXISTS, tmdl)).toEqual([
      odbc(
        "Redshift",
        "odbc",
        "amazonRedshift",
        "the ODBC connection names the Amazon Redshift driver; Power BI has an Amazon Redshift connector",
      ),
      odbc(
        "SqlServer",
        "oleDb",
        "sqlServer",
        "the OLE DB connection names the SQL Server provider; Power BI has a SQL Server connector",
      ),
      odbc(
        "Oracle",
        "oleDb",
        "oracle",
        "the OLE DB connection names the Oracle provider; Power BI has an Oracle connector",
      ),
      odbc(
        "Postgres",
        "odbc",
        "postgreSql",
        "the ODBC connection names the PostgreSQL driver; Power BI has a PostgreSQL connector",
      ),
      odbc(
        "My",
        "odbc",
        "mySql",
        "the ODBC connection names the MySQL driver; Power BI has a MySQL connector",
      ),
      odbc(
        "Snow",
        "odbc",
        "snowflake",
        "the ODBC connection names the Snowflake driver; Power BI has a Snowflake connector",
      ),
    ]);
  });

  it("gives PRIVACY_LEVELS_IGNORED a model finding's message, with no frame", () => {
    const model = modelFrom(
      "model Model\n\tculture: en-US\n\tdataAccessOptions\n\t\tfastCombine\n",
    );
    expect(
      PRIVACY_LEVELS_IGNORED.check({ model }, { indexes: buildIndexes({ model }), options: {} })
        .map(rendered)
        .map((f) => [f.messageId, f.detail, f.params]),
    ).toEqual([
      [
        "PRIVACY_LEVELS_IGNORED",
        "Ignore the Privacy Levels is on for this file; the service does not honor it",
        {},
      ],
    ]);
  });

  it("gives SORT_NOT_HELD_FOR_REMOVE_DUPLICATES the sort as a nested message, a step's or the one inside", async () => {
    const tmdl = table(
      "Customers",
      "let",
      '\tSource = #table({"Customer ID", "Updated"}, {}),',
      '\tInPlace = Table.Distinct(Table.Sort(Source, {{"Updated", Order.Descending}}), {"Customer ID"}),',
      '\t#"Sorted Rows" = Table.Sort(Source, {{"Updated", Order.Descending}}),',
      '\tKept = Table.Distinct(#"Sorted Rows", {"Customer ID"})',
      "in",
      "\tKept",
    );
    const sort = (s: Message) => msg("SORT_NOT_HELD_FOR_REMOVE_DUPLICATES", { sort: s });
    expect(await said(SORT_NOT_HELD_FOR_REMOVE_DUPLICATES, tmdl)).toEqual([
      [
        "query.stepFinding",
        "query 'Customers', step 'InPlace': nothing holds the order of the Table.Sort inside it, so the sort may not decide which duplicate is kept",
        atStep(
          query("'Customers'"),
          "'InPlace'",
          sort(msg("SORT_NOT_HELD_FOR_REMOVE_DUPLICATES.sortInside")),
        ),
      ],
      [
        "query.stepFinding",
        "query 'Customers', step 'Kept': nothing holds the order of step 'Sorted Rows', so the sort may not decide which duplicate is kept",
        atStep(
          query("'Customers'"),
          "'Kept'",
          sort(msg("SORT_NOT_HELD_FOR_REMOVE_DUPLICATES.sortStep", { step: "'Sorted Rows'" })),
        ),
      ],
    ]);
  });

  it("gives KEEP_FIRST_ROWS_LEFT_IN its count as a plural", async () => {
    expect(
      await said(KEEP_FIRST_ROWS_LEFT_IN, oneStep("Orders", "Top", "Table.FirstN(Source, 1000)")),
    ).toEqual([
      [
        "query.stepFinding",
        "query 'Orders', step 'Top': only the first 1000 rows load",
        atStep(query("'Orders'"), "'Top'", msg("KEEP_FIRST_ROWS_LEFT_IN", { count: 1000 })),
      ],
    ]);
  });

  it("gives INCREMENTAL_REFRESH_RANGE_BOUNDS a message for each way the bounds are wrong", async () => {
    const parameters =
      'expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n' +
      'expression RangeEnd = #datetime(2025, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n';
    const filtered = (condition: string) =>
      parameters + oneStep("Sales", "Filtered", `Table.SelectRows(Source, each ${condition})`);
    const bounds = (variant: "bothInclude" | "neitherIncludes") =>
      atStep(query("'Sales'"), "'Filtered'", msg(`INCREMENTAL_REFRESH_RANGE_BOUNDS.${variant}`));
    expect(
      await said(
        INCREMENTAL_REFRESH_RANGE_BOUNDS,
        filtered("[OrderDate] >= RangeStart and [OrderDate] <= RangeEnd"),
      ),
    ).toEqual([
      [
        "query.stepFinding",
        "query 'Sales', step 'Filtered': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions",
        bounds("bothInclude"),
      ],
    ]);
    expect(
      await said(
        INCREMENTAL_REFRESH_RANGE_BOUNDS,
        filtered("[OrderDate] > RangeStart and [OrderDate] < RangeEnd"),
      ),
    ).toEqual([
      [
        "query.stepFinding",
        "query 'Sales', step 'Filtered': neither RangeStart nor RangeEnd includes the boundary, so a row on it lands in none",
        bounds("neitherIncludes"),
      ],
    ]);
  });

  describe("FIXED_DATE_IN_ROW_FILTER", () => {
    const filtered = (condition: string) =>
      oneStep("Sales", "Filtered", `Table.SelectRows(Source, each ${condition})`);
    const fixed = (use: "endsAt" | "matches", date: string) =>
      atStep(query("'Sales'"), "'Filtered'", msg("FIXED_DATE_IN_ROW_FILTER", { use, date }));

    it("gives the use as a select and the day as a date", async () => {
      expect(await said(FIXED_DATE_IN_ROW_FILTER, filtered("[Day] <= #date(2025, 1, 5)"))).toEqual([
        [
          "query.stepFinding",
          "query 'Sales', step 'Filtered': rows end at a fixed date, January 5, 2025",
          fixed("endsAt", "2025-01-05"),
        ],
      ]);
      expect(
        await said(FIXED_DATE_IN_ROW_FILTER, filtered("[Day] = #datetime(2026, 3, 31, 0, 0, 0)")),
      ).toEqual([
        [
          "query.stepFinding",
          "query 'Sales', step 'Filtered': rows match a fixed date, March 31, 2026",
          fixed("matches", "2026-03-31"),
        ],
      ]);
    });

    it("writes a three-digit year as an ISO day padded to four digits, and in English as written", async () => {
      expect(await said(FIXED_DATE_IN_ROW_FILTER, filtered("[Day] < #date(999, 12, 31)"))).toEqual([
        [
          "query.stepFinding",
          "query 'Sales', step 'Filtered': rows end at a fixed date, December 31, 999",
          fixed("endsAt", "0999-12-31"),
        ],
      ]);
    });

    it("leaves alone a day M refuses: one past its month's end, or a year outside 1 to 9999", async () => {
      for (const date of [
        "#date(2025, 2, 29)",
        "#date(2025, 4, 31)",
        "#date(0, 1, 1)",
        "#date(-1, 1, 1)",
        "#date(10000, 1, 1)",
      ])
        expect(await said(FIXED_DATE_IN_ROW_FILTER, filtered(`[Day] <= ${date}`))).toEqual([]);
      expect(
        (await said(FIXED_DATE_IN_ROW_FILTER, filtered("[Day] <= #date(2024, 2, 29)")))[0]![1],
      ).toBe("query 'Sales', step 'Filtered': rows end at a fixed date, February 29, 2024");
    });
  });

  describe("DEFAULT_STEP_NAMES", () => {
    /** A query whose steps are `names`, each a default name. */
    const steps = (...names: string[]) =>
      table(
        "Sales",
        "let",
        ...names.map((n, i) => `\t#"${n}" = ${i}${i < names.length - 1 ? "," : ""}`),
        "in",
        `\t#"${names.at(-1)}"`,
      );

    it("names the query alone, in query.finding, though the finding sits on the first step", async () => {
      const [f] = await mFindings(DEFAULT_STEP_NAMES, steps("Filtered Rows"));
      expect(f!.location).toEqual({ file: "inline.tmdl", line: 6, column: 6 });
      expect([f!.messageId, f!.detail, f!.params]).toEqual([
        "query.finding",
        "query 'Sales': 1 step keeps its default name, 'Filtered Rows'",
        {
          query: query("'Sales'"),
          finding: msg("DEFAULT_STEP_NAMES.one", { step: "'Filtered Rows'" }),
        },
      ]);
    });

    it("gives several steps their count and the first two names as a list, with such as past two", async () => {
      const several = (count: number) =>
        msg("DEFAULT_STEP_NAMES.several", {
          count,
          steps: ["'Promoted Headers'", "'Changed Type'"],
        });
      expect(await said(DEFAULT_STEP_NAMES, steps("Promoted Headers", "Changed Type"))).toEqual([
        [
          "query.finding",
          "query 'Sales': 2 steps keep default names, 'Promoted Headers' and 'Changed Type'",
          { query: query("'Sales'"), finding: several(2) },
        ],
      ]);
      expect(
        await said(DEFAULT_STEP_NAMES, steps("Promoted Headers", "Changed Type", "Added Custom")),
      ).toEqual([
        [
          "query.finding",
          "query 'Sales': 3 steps keep default names, such as 'Promoted Headers' and 'Changed Type'",
          { query: query("'Sales'"), finding: several(3) },
        ],
      ]);
    });
  });

  it("gives DYNAMIC_DATA_SOURCE the function as written, and what it calls its source and how it is made as selects", async () => {
    const tmdl =
      "expression GetPage = (address as text) => Web.Contents(address)\n\n" +
      table(
        "Orders",
        "let",
        '\tSource = #table(type table [url = text], {{"https://api.example.com"}}),',
        '\tRows = Table.AddColumn(Source, "Body", each Web.Contents([url])),',
        '\tBuilt = File.Contents(Text.Combine({"C:\\Data\\", "orders.csv"})),',
        '\tOdbc = Odbc.DataSource(Text.Combine({"dsn=", "Sales"})),',
        '\tServer = Sql.Database(if true then "a.example" else "b.example", "Warehouse")',
        "in",
        "\tServer",
      );
    const dynamic = (fn: string, source: string, how: string) =>
      msg("DYNAMIC_DATA_SOURCE", { function: fn, source, how });
    expect(await said(DYNAMIC_DATA_SOURCE, tmdl)).toEqual([
      [
        "query.stepFinding",
        "query 'Orders', step 'Rows': Web.Contents's address is read from the rows",
        atStep(query("'Orders'"), "'Rows'", dynamic("Web.Contents", "address", "row")),
      ],
      [
        "query.stepFinding",
        "query 'Orders', step 'Built': File.Contents's path is built by a function call",
        atStep(query("'Orders'"), "'Built'", dynamic("File.Contents", "path", "computed")),
      ],
      [
        "query.stepFinding",
        "query 'Orders', step 'Odbc': Odbc.DataSource's connection string is built by a function call",
        atStep(
          query("'Orders'"),
          "'Odbc'",
          dynamic("Odbc.DataSource", "connectionString", "computed"),
        ),
      ],
      [
        "query.stepFinding",
        "query 'Orders', step 'Server': Sql.Database's server is chosen with if ... then ... else",
        atStep(query("'Orders'"), "'Server'", dynamic("Sql.Database", "server", "chosen")),
      ],
      [
        "query.finding",
        "query 'GetPage': Web.Contents's address is a custom function's parameter",
        { query: query("'GetPage'"), finding: dynamic("Web.Contents", "address", "parameter") },
      ],
    ]);
  });

  describe("HARDCODED_SECRET_IN_QUERY", () => {
    const holds = (where: Message) => msg("HARDCODED_SECRET_IN_QUERY.holds", { where });
    const header = (name: string) =>
      msg("HARDCODED_SECRET_IN_QUERY.header", { header: name, function: "Web.Contents" });

    it("names each of the five places as a nested message, the names in it as the input writes them", async () => {
      const tmdl = table(
        "Api",
        "let",
        '\tHeader = Web.Contents("https://api.example.com/v1", [Headers = [#"X-API-Key" = "pbiplint-fixture-key-0201-notreal"]]),',
        '\tField = Web.Contents("https://api.example.com/v1", [Query = [access_token = "pbiplint-fixture-token-0202-notreal"]]),',
        '\tAddress = Web.Contents("https://api.example.com/v1?Sig=pbiplint-fixture-sig-0203-notreal"),',
        '\tToken = "Bearer pbiplint-fixture-token-0204-notreal",',
        '\tConnection = Odbc.DataSource("Driver={x};Pwd=pbiplint-fixture-pwd-0205-notreal")',
        "in",
        "\tConnection",
      );
      const at = (step: string, where: Message, detail: string) => [
        "query.stepFinding",
        `query 'Api', step '${step}': ${detail} holds a credential written into the query (value not shown)`,
        atStep(query("'Api'"), `'${step}'`, holds(where)),
      ];
      expect(await said(HARDCODED_SECRET_IN_QUERY, tmdl)).toEqual([
        at("Header", header("X-API-Key"), "the X-API-Key header in Web.Contents"),
        at(
          "Field",
          msg("HARDCODED_SECRET_IN_QUERY.queryField", {
            field: "access_token",
            function: "Web.Contents",
          }),
          "the access_token field of the Query record in Web.Contents",
        ),
        at(
          "Connection",
          msg("HARDCODED_SECRET_IN_QUERY.connectionString", { function: "Odbc.DataSource" }),
          "the password in Odbc.DataSource's connection string",
        ),
        at(
          "Address",
          msg("HARDCODED_SECRET_IN_QUERY.addressParameter", { parameter: "sig" }),
          "the sig parameter of the web address",
        ),
        at("Token", msg("HARDCODED_SECRET_IN_QUERY.bearerToken"), "the Bearer token"),
      ]);
    });

    it("says the place reads the credential where a name leads to the text", async () => {
      const tmdl =
        'expression Key = "pbiplint-fixture-key-0206-notreal" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n' +
        oneStep(
          "Api",
          "Source",
          'Web.Contents("https://api.example.com/v1", [Headers = [#"x-api-key" = Key]])',
        );
      expect(await said(HARDCODED_SECRET_IN_QUERY, tmdl)).toEqual([
        [
          "query.finding",
          "query 'Key': the x-api-key header in Web.Contents reads a credential written here (value not shown)",
          {
            query: query("'Key'"),
            finding: msg("HARDCODED_SECRET_IN_QUERY.reads", { where: header("x-api-key") }),
          },
        ],
      ]);
    });
  });

  it("gives HARDCODED_SERVER_NAME the function as written and the count of calls as a plural", async () => {
    const server = (count: number) =>
      msg("HARDCODED_SERVER_NAME", { function: "Sql.Database", count });
    expect(
      await said(
        HARDCODED_SERVER_NAME,
        oneStep("Sales", "Source", 'Sql.Database("s.example", "W")'),
      ),
    ).toEqual([
      [
        "query.stepFinding",
        "query 'Sales', step 'Source': Sql.Database names its server as text; a parameter would hold it",
        atStep(query("'Sales'"), "'Source'", server(1)),
      ],
    ]);
    const two = table(
      "Sales",
      "let",
      '\tA = Sql.Database("s.example", "W"),',
      '\tB = Sql.Database("s.example", "X")',
      "in",
      "\tB",
    );
    expect(await said(HARDCODED_SERVER_NAME, two)).toEqual([
      [
        "query.stepFinding",
        "query 'Sales', step 'A': Sql.Database names its server as text (2 calls in this query); a parameter would hold it",
        atStep(query("'Sales'"), "'A'", server(2)),
      ],
    ]);
  });

  it("gives LEGACY_EXCEL_FILE the extension as a select", async () => {
    const tmdl = table(
      "Budget",
      "let",
      '\tOld = Excel.Workbook(File.Contents("C:\\Data\\Budget.XLS"), null, true),',
      '\tBinary = Excel.Workbook(File.Contents("C:\\Data\\Forecast.xlsb"), null, true)',
      "in",
      "\tBinary",
    );
    expect(await said(LEGACY_EXCEL_FILE, tmdl)).toEqual([
      [
        "query.stepFinding",
        "query 'Budget', step 'Old': the workbook is a legacy .xls file, read through the Access Database Engine",
        atStep(query("'Budget'"), "'Old'", msg("LEGACY_EXCEL_FILE", { kind: "xls" })),
      ],
      [
        "query.stepFinding",
        "query 'Budget', step 'Binary': the workbook is a legacy .xlsb file, read through the Access Database Engine",
        atStep(query("'Budget'"), "'Binary'", msg("LEGACY_EXCEL_FILE", { kind: "xlsb" })),
      ],
    ]);
  });

  it("gives EXTENSION_FILTER_CASE the extension as written and in the other case", async () => {
    const tmdl = oneStep(
      "Files",
      "Csv",
      'Table.SelectRows(Folder.Files("C:\\Data"), each [Extension] = ".Csv")',
    );
    expect(await said(EXTENSION_FILTER_CASE, tmdl)).toEqual([
      [
        "query.stepFinding",
        `query 'Files', step 'Csv': the extension test matches ".Csv" but not ".csv"`,
        atStep(
          query("'Files'"),
          "'Csv'",
          msg("EXTENSION_FILTER_CASE", { extension: ".Csv", otherCase: ".csv" }),
        ),
      ],
    ]);
  });
});

/**
 * How a catalog differs from English: an ID it lacks or adds, a template that does not parse, or
 * one whose parameters differ from English's in name, kind, or select keys. Empty when it matches.
 */
function sameShape(other: Catalog): string[] {
  const problems: string[] = [];
  const shape = (id: string, template: string) => {
    try {
      const args = templateArgs(template);
      return new Map(
        [...args].map(([name, a]) => [
          name,
          a.kind === "select"
            ? `select ${[...a.keys].sort().join(" ")}`
            : a.kind === "list" && a.style
              ? `list ${a.style}`
              : a.kind,
        ]),
      );
    } catch (e) {
      problems.push(`${id}: ${(e as Error).message}`);
      return undefined;
    }
  };
  const ids = new Set([...Object.keys(EN), ...Object.keys(other)]);
  for (const id of [...ids].sort()) {
    const en = (EN as Record<string, string>)[id];
    const theirs = (other as Record<string, string>)[id];
    if (en === undefined) problems.push(`${id}: not an English message ID`);
    else if (theirs === undefined) problems.push(`${id}: missing`);
    if (en === undefined || theirs === undefined) continue;
    const want = shape(id, en);
    const got = shape(id, theirs);
    if (!want || !got) continue;
    for (const name of new Set([...want.keys(), ...got.keys()])) {
      if (!got.has(name)) problems.push(`${id}: {${name}} missing`);
      else if (!want.has(name)) problems.push(`${id}: {${name}} not in English`);
      else if (want.get(name) !== got.get(name)) {
        problems.push(`${id}: {${name}} is ${got.get(name)}, English has ${want.get(name)}`);
      }
    }
  }
  return problems;
}

describe("the English catalog", () => {
  it("every English template parses", () => {
    for (const [id, template] of Object.entries(EN)) {
      expect(() => templateArgs(template), id).not.toThrow();
    }
  });

  it("a catalog has English's IDs and each template the same arguments", () => {
    expect(sameShape(EN)).toEqual([]);
    expect(
      sameShape({ ...EN, REDUCE_PAGES: "{count, plural, one {# page} other {# pages}}" }),
    ).toEqual(["REDUCE_PAGES: {max} missing"]);
    expect(
      sameShape({
        ...EN,
        HIDE_TOOLTIP_DRILLTROUGH_PAGES:
          "{kind, select, tooltips {tooltip} other {drillthrough}} page is visible to readers",
      }),
    ).toEqual([
      "HIDE_TOOLTIP_DRILLTROUGH_PAGES: {kind} is select other tooltips, English has select other tooltip",
    ]);
    expect(sameShape({ ...EN, "date.long": "{date}" })).toEqual([
      "date.long: {date} is plain, English has date",
    ]);
    expect(
      sameShape({
        ...EN,
        "NOT_REACHED_FROM_REPORT.referencedOnly":
          "referenced only by {referrers, list}, which nothing reaches either",
      }),
    ).toEqual([
      "NOT_REACHED_FROM_REPORT.referencedOnly: {referrers} is list, English has list unit",
    ]);
    expect(sameShape({ ...EN, "list.more": "{count, list} more" })).toEqual([
      "list.more: {count} is list, English has plain",
    ]);
    const { "context.role": _, ...lacking } = EN;
    expect(sameShape({ ...lacking, extra: "x" } as unknown as Catalog)).toEqual([
      "context.role: missing",
      "extra: not an English message ID",
    ]);
  });
});
