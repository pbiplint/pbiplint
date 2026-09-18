import { lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { SAMPLE_FILES, SAMPLE_NAME, sampleFiles } from "../src/sample.js";

describe("bundled sample", () => {
  it("is examples/messy-sales, model-relative and in the order the results list them", () => {
    // Written out rather than compared to a re-sort of itself: the module sorts with an explicit
    // locale, and [...].sort() is the default sort, which agrees with it here by luck rather than
    // by rule.
    expect(SAMPLE_FILES.map((f) => f.path)).toEqual([
      "definition/cultures/en-US.tmdl",
      "definition/database.tmdl",
      "definition/model.tmdl",
      "definition/relationships.tmdl",
      "definition/tables/Customer.tmdl",
      "definition/tables/Date.tmdl",
      "definition/tables/Employee.tmdl",
      "definition/tables/Product.tmdl",
      "definition/tables/Promotion.tmdl",
      "definition/tables/Sales.tmdl",
      "definition/tables/Store.tmdl",
    ]);
  });
  it("names itself the way the results heading and the announcement read", () => {
    expect(SAMPLE_NAME).toBe("the sample project");
  });
  it("sorts with the locale it asks for, not the order code units happen to give", () => {
    const files = sampleFiles({
      "/x/examples/messy-sales/definition/tables/B.tmdl": "table B\n",
      "/x/examples/messy-sales/definition/tables/a.tmdl": "table a\n",
    });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(["definition/tables/a.tmdl", "definition/tables/B.tmdl"]);
    // The two disagree on exactly this pair, which is what makes the assertion above worth making:
    // the default sort compares "B" (0x42) against "a" (0x61) and puts the capital first.
    expect([...paths].sort()).toEqual(["definition/tables/B.tmdl", "definition/tables/a.tmdl"]);
  });
  it("refuses a file from outside the model rather than slicing it down to nothing", () => {
    // indexOf returns -1 for a file the glob picked up from elsewhere, and slice(-1) would make
    // its path the last character of its name.
    expect(() => sampleFiles({ "/x/examples/messy-sales/README.md": "" })).toThrow(
      /outside the model/,
    );
  });
  it("lints to the same numbers as pbiplint --sample", () => {
    const { summary } = lint(SAMPLE_FILES);
    expect([summary.findings, summary.errors, summary.warnings, summary.infos]).toEqual([
      161, 16, 39, 106,
    ]);
  });
});
