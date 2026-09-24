import { lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_CONFIG,
  SAMPLE_FILES,
  SAMPLE_NAME,
  sampleFiles,
  sampleLayers,
} from "../src/sample.js";

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
  it("exposes the sample's config and its layer counts", () => {
    expect(SAMPLE_CONFIG).toBeUndefined();
    expect(sampleLayers(SAMPLE_FILES)).toEqual({ model: 11, report: 0 });
  });
  it("sorts with the locale it asks for, not the order code units happen to give", () => {
    const files = sampleFiles({
      "/x/examples/messy-sales/Messy Sales Demo.SemanticModel/definition/tables/B.tmdl":
        "table B\n",
      "/x/examples/messy-sales/Messy Sales Demo.SemanticModel/definition/tables/a.tmdl":
        "table a\n",
    });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(["definition/tables/a.tmdl", "definition/tables/B.tmdl"]);
    // The two disagree on exactly this pair, which is what makes the assertion above worth making:
    // the default sort compares "B" (0x42) against "a" (0x61) and puts the capital first.
    expect([...paths].sort()).toEqual(["definition/tables/B.tmdl", "definition/tables/a.tmdl"]);
  });
  it("gives each part its own relative paths, and refuses a file outside both parts", () => {
    const files = sampleFiles({
      "/x/examples/messy-sales/Messy Sales Demo.SemanticModel/definition/tables/B.tmdl":
        "table B\n",
      "/x/examples/messy-sales/Messy Sales Demo.Report/definition/report.json": "{}",
      "/x/examples/messy-sales/Messy Sales Demo.Report/definition.pbir": "{}",
      "/x/examples/messy-sales/Messy Sales Demo.pbip": "{}",
    });
    expect(files.map((f) => f.path).sort()).toEqual(
      [
        "Messy Sales Demo.pbip",
        "definition.pbir",
        "definition/report.json",
        "definition/tables/B.tmdl",
      ].sort(),
    );
    // A file beside the parts belongs to neither, and passed on it would land in the report,
    // where lint routes every path that is not .tmdl.
    expect(() => sampleFiles({ "/x/examples/messy-sales/README.md": "" })).toThrow(
      /outside the sample project/,
    );
  });
  it("refuses a file from outside the sample project rather than slicing its key at a guess", () => {
    // indexOf returns -1 for a file the glob picked up from elsewhere, and slicing past the sample
    // root from there would cut its key at an offset that means nothing.
    expect(() => sampleFiles({ "/x/examples/other/definition/model.tmdl": "" })).toThrow(
      /outside the sample project/,
    );
  });
  it("lints to the same numbers as pbiplint --sample", () => {
    const { summary } = lint(SAMPLE_FILES);
    expect([summary.findings, summary.errors, summary.warnings, summary.infos]).toEqual([
      161, 16, 39, 106,
    ]);
  });
});
