import { describe, expect, it } from "vitest";
import type { MessageId } from "../src/messages/en.js";
import {
  formatMessage,
  msg,
  templateArgs,
  type Catalog,
  type MessageParam,
} from "../src/messages/format.js";

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
