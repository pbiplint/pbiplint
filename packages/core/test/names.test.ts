import { describe, expect, it } from "vitest";
import {
  columnRef,
  isAutoDateTable,
  isAutoDateTableCopy,
  isHiddenAutoDateTable,
  measureRef,
  relationshipName,
  ruleUrl,
  slug,
  tableRef,
} from "../src/model/names.js";
import { modelFrom } from "./helpers.js";

describe("DAX object names", () => {
  it("quotes tables and doubles embedded quotes", () => {
    expect(tableRef("Sales")).toBe("'Sales'");
    expect(tableRef("O'Brien")).toBe("'O''Brien'");
    expect(tableRef(" Spaced ")).toBe("' Spaced '");
  });
  it("formats columns and measures", () => {
    expect(columnRef("Sales", "Sale ID")).toBe("'Sales'[Sale ID]");
    expect(columnRef("T", "a]b")).toBe("'T'[a]]b]");
    expect(measureRef("Total Sales")).toBe("[Total Sales]");
  });
  it("formats relationships the way Tabular Editor displays them", () => {
    const m = modelFrom(
      "relationship a\n\tfromColumn: Sales.'Month Start'\n\ttoColumn: Date.Date\n\nrelationship b\n\tfromCardinality: many\n\ttoCardinality: many\n\tcrossFilteringBehavior: bothDirections\n\tfromColumn: Customer.Region\n\ttoColumn: 'Region Security'.Region\n\nrelationship c\n\tfromCardinality: one\n\ttoCardinality: one\n\tfromColumn: A.K\n\ttoColumn: B.K\n",
    );
    expect(relationshipName(m.relationships[0]!)).toBe("'Sales'[Month Start] ∞←1 'Date'[Date]");
    expect(relationshipName(m.relationships[1]!)).toBe(
      "'Customer'[Region] ∞↔∞ 'Region Security'[Region]",
    );
    expect(relationshipName(m.relationships[2]!)).toBe("'A'[K] 1←1 'B'[K]");
  });
});

describe("rule slugs", () => {
  it("lowercases and collapses non-alphanumerics", () => {
    expect(slug("HIDE_FOREIGN_KEYS")).toBe("hide-foreign-keys");
    expect(slug("DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE")).toBe(
      "date-calendar-tables-should-be-marked-as-a-date-table",
    );
    expect(slug("AVOID_USING_'1-(X/Y)'_SYNTAX")).toBe("avoid-using-1-x-y-syntax");
    expect(slug("MONTH_(AS_A_STRING)_MUST_BE_SORTED")).toBe("month-as-a-string-must-be-sorted");
  });
  it("builds rule page URLs", () => {
    expect(ruleUrl("HIDE_FOREIGN_KEYS")).toBe("https://pbiplint.com/rules/hide-foreign-keys");
  });
});

describe("Desktop's auto date/time tables", () => {
  const COPY = "LocalDateTable_6d3e2a1b-4c5f-4e7a-9b8c-0d1e2f3a4b5c";
  const table = (name: string, partition: string) =>
    modelFrom(
      `table ${name}\n\tshowAsVariationsOnly\n\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tisHidden\n\n\tpartition ${name} = ${partition}\n`,
    ).tables[0]!;
  /** The partition a composite model writes for a table it reads from the model it extends. */
  const entity = (mode: string) =>
    `entity\n\t\tmode: ${mode}\n\t\tsource\n\t\t\tentityName: ${COPY}\n\t\t\texpressionSource: 'DirectQuery to AS - Sales'\n`;
  const calculated = "calculated\n\t\tmode: import\n\t\tsource = CALENDARAUTO()\n";
  it("reads a composite model's copy, a LocalDateTable_ read through DirectQuery, as one of Desktop's hidden tables", () => {
    const copy = table(COPY, entity("directQuery"));
    expect(isAutoDateTableCopy(copy)).toBe(true);
    expect(isHiddenAutoDateTable(copy)).toBe(true);
    // REMOVE_AUTO-DATE_TABLE keeps the source rule's test, which requires a calculated table.
    expect(isAutoDateTable(copy)).toBe(false);
  });
  it("reads the model's own calculated tables as hidden too, and neither as a copy", () => {
    for (const name of [COPY, "DateTableTemplate_f2afc5fc-2d0d-478c-92e8-dc0f26f32175"]) {
      const own = table(name, calculated);
      expect(isAutoDateTable(own)).toBe(true);
      expect(isHiddenAutoDateTable(own)).toBe(true);
      expect(isAutoDateTableCopy(own)).toBe(false);
    }
  });
  it("reads no other table as a copy", () => {
    // Another storage mode, another table read from a published model, and a table of Desktop's
    // name that reads a query of its own.
    const others = [
      table(COPY, entity("directLake")),
      table("Sales", entity("directQuery")),
      table(COPY, 'm\n\t\tmode: directQuery\n\t\tsource = Sql.Database("s", "d")\n'),
    ];
    for (const t of others) {
      expect(isAutoDateTableCopy(t)).toBe(false);
      expect(isHiddenAutoDateTable(t)).toBe(false);
    }
  });
});
