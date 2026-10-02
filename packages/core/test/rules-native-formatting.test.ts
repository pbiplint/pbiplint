import { describe, expect, it } from "vitest";
import { DECIMAL_COLUMN_WITHOUT_FORMAT_STRING } from "../src/rules/pbiplint/formatting.js";
import { objectNames } from "./helpers.js";

describe("DECIMAL_COLUMN_WITHOUT_FORMAT_STRING", () => {
  it("reports a visible Decimal or Fixed decimal number column with no format string, and nothing else", () => {
    const m = [
      "table Sales",
      "\tcolumn Ratio",
      "\t\tdataType: double",
      "\tcolumn Price",
      "\t\tdataType: decimal",
      "\tcolumn Blank",
      "\t\tdataType: double",
      '\t\tformatString: " "',
      "\tcolumn Rate",
      "\t\tdataType: double",
      "\t\tformatString: 0.0%",
      "\tcolumn Cost",
      "\t\tdataType: decimal",
      "\t\tisHidden",
      "\tcolumn Quantity",
      "\t\tdataType: int64",
      "\tcolumn Shipped",
      "\t\tdataType: dateTime",
      "\tcolumn Untyped = 1.5",
      "table Budget",
      "\tisHidden",
      "\tcolumn Amount",
      "\t\tdataType: double",
    ].join("\n");
    expect(objectNames(DECIMAL_COLUMN_WITHOUT_FORMAT_STRING, m)).toEqual([
      "'Sales'[Ratio]",
      "'Sales'[Price]",
      "'Sales'[Blank]",
    ]);
  });
});
