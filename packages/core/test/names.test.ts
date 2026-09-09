import { describe, expect, it } from "vitest";
import {
  columnRef,
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
