import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lint, resolveConfig } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import {
  isModelFolder,
  isReportFolder,
  selectProject,
  type InputEntry,
  type InputMarker,
} from "../src/input/project-files.js";
import { markerOf, SKIP_DIRS, wanted } from "../src/input/read-drop.js";
import {
  SAMPLE_CONFIG,
  SAMPLE_FILES,
  SAMPLE_NAME,
  SAMPLE_TREE,
  sampleFiles,
  sampleTree,
} from "../src/sample.js";

describe("bundled sample", () => {
  it("is examples/messy-sales: the model's files, then the report's, each relative to its part", () => {
    // Written out rather than compared to a re-sort of itself: the module sorts with an explicit
    // locale, and [...].sort() is the default sort, which agrees with it here by luck rather than
    // by rule.
    const paths = SAMPLE_FILES.map((f) => f.path);
    expect(paths.slice(0, 14)).toEqual([
      "definition/cultures/en-US.tmdl",
      "definition/database.tmdl",
      "definition/model.tmdl",
      "definition/relationships.tmdl",
      "definition/tables/Customer.tmdl",
      "definition/tables/Date.tmdl",
      "definition/tables/DateTableTemplate_96ead6f8-eef3-4336-a020-6641aa278e92.tmdl",
      "definition/tables/Employee Grouping.tmdl",
      "definition/tables/Employee.tmdl",
      "definition/tables/LocalDateTable_b6c07c62-ecbc-4f14-b072-2fb027697b1d.tmdl",
      "definition/tables/Product.tmdl",
      "definition/tables/Promotion.tmdl",
      "definition/tables/Sales.tmdl",
      "definition/tables/Store.tmdl",
    ]);
    // The report's 78, as the CLI counts them: the .pbip one level up, the part's own two files,
    // and the 75 JSON files under its definition folder.
    const report = paths.slice(14);
    expect(report).toHaveLength(78);
    expect(report.slice(0, 4)).toEqual([
      "../Messy Sales Demo.pbip",
      ".platform",
      "definition.pbir",
      "definition/bookmarks/bookmarks.json",
    ]);
    expect(report.slice(3).every((p) => p.startsWith("definition/") && p.endsWith(".json"))).toBe(
      true,
    );
    expect(report).toContain("definition/report.json");
    expect(report).toContain("definition/reportExtensions.json");
  });
  it("names itself the way the results heading and the announcement read", () => {
    expect(SAMPLE_NAME).toBe("the sample project");
  });
  it("carries the sample's config, which sets the two policies the sample plants", () => {
    expect(JSON.parse(SAMPLE_CONFIG)).toEqual({
      $schema: "https://pbiplint.com/schema/pbiplint.config.schema.json",
      rules: {
        FILTERS_PANE_STATE: { expect: "closed" },
        TAB_ORDER_FOLLOWS_LAYOUT: { expect: "layout" },
      },
    });
  });
  it("reads as a drop of examples/messy-sales reads, so selectProject gives lint the same files and config", () => {
    // The button runs the sample through selectProject, as a drop of the folder runs, so the
    // files lint sees and the config it applies are held to the ones this module lints here.
    const project = selectProject(SAMPLE_TREE);
    expect(project.root).toBe("messy-sales");
    expect(project.files).toEqual(SAMPLE_FILES);
    expect(project.config).toEqual({
      path: "messy-sales/pbiplint.config.json",
      text: SAMPLE_CONFIG,
    });
    expect(project.absent).toEqual({});
    expect(project.notes).toEqual([]);
    expect(project.diagnostics).toEqual([]);
    expect(SAMPLE_TREE.modelFolders).toEqual(["messy-sales/Messy Sales Demo.SemanticModel"]);
    expect(SAMPLE_TREE.reportFolders).toEqual(["messy-sales/Messy Sales Demo.Report"]);
  });
  it("holds every file a drop of examples/messy-sales reads, so its files read cannot drift from a drop's", () => {
    // The drop route, walked over the repository's copy: every folder but the ones the walkers
    // skip, the legacy markers seen by name, and every file `wanted` keeps, read as text, each by
    // its path from examples/. A file the sample's globs miss, or one they take that a drop would
    // not, shows up here, which comparing the tree with SAMPLE_FILES cannot see.
    const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
    const entries: InputEntry[] = [];
    const markers: InputMarker[] = [];
    const modelFolders: string[] = [];
    const reportFolders: string[] = [];
    const walk = (dir: string): void => {
      for (const d of readdirSync(join(examples, dir), { withFileTypes: true })) {
        const path = `${dir}/${d.name}`;
        if (d.isDirectory()) {
          if (SKIP_DIRS.has(d.name)) continue;
          if (isModelFolder(d.name)) modelFolders.push(path);
          if (isReportFolder(d.name)) reportFolders.push(path);
          walk(path);
          continue;
        }
        const marker = markerOf(path);
        if (marker) markers.push(marker);
        else if (wanted(path))
          entries.push({ path, text: readFileSync(join(examples, path), "utf8") });
      }
    };
    walk("messy-sales");
    const byName = (a: string, b: string): number => a.localeCompare(b, "en");
    entries.sort((a, b) => byName(a.path, b.path));
    // The model's .platform is among them: a drop reads it and lists it as not linted.
    expect(entries.map((e) => e.path)).toContain(
      "messy-sales/Messy Sales Demo.SemanticModel/.platform",
    );
    expect(SAMPLE_TREE.entries).toEqual(entries);
    expect(SAMPLE_TREE.markers).toEqual(markers);
    expect(SAMPLE_TREE.modelFolders).toEqual(modelFolders.sort(byName));
    expect(SAMPLE_TREE.reportFolders).toEqual(reportFolders.sort(byName));
  });
  it("lints to the numbers the CLI gives for examples/messy-sales", () => {
    // packages/cli/test/cli.test.ts pins the same totals for `pbiplint examples/messy-sales`.
    const result = lint(SAMPLE_FILES, { config: resolveConfig(JSON.parse(SAMPLE_CONFIG)) });
    const { summary } = result;
    expect([summary.findings, summary.errors, summary.warnings, summary.infos]).toEqual([
      257, 19, 78, 160,
    ]);
    expect(summary.files).toBe(92);
    expect(result.layers).toEqual({
      model: { present: true, files: 14 },
      report: { present: true, files: 78 },
    });
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
  it("gives each part its own relative paths, the model's first, and refuses a file outside both parts", () => {
    const files = sampleFiles({
      "/x/examples/messy-sales/Messy Sales Demo.Report/definition/report.json": "{}",
      "/x/examples/messy-sales/Messy Sales Demo.SemanticModel/definition/tables/B.tmdl":
        "table B\n",
      "/x/examples/messy-sales/Messy Sales Demo.Report/definition.pbir": "{}",
      "/x/examples/messy-sales/Messy Sales Demo.pbip": "{}",
    });
    // The model's files, then the report's with the project file among them, as the CLI and
    // selectProject hand them to lint.
    expect(files.map((f) => f.path)).toEqual([
      "definition/tables/B.tmdl",
      "../Messy Sales Demo.pbip",
      "definition.pbir",
      "definition/report.json",
    ]);
    // A file beside the parts belongs to neither: lint would read it as nothing, and the results
    // heading would still count it.
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
    expect(() => sampleTree({ "/x/examples/other/definition/model.tmdl": "" })).toThrow(
      /outside the sample project/,
    );
  });
  it("builds the tree a drop of examples/messy-sales gives, rooted at messy-sales", () => {
    const tree = sampleTree({
      "/x/examples/messy-sales/pbiplint.config.json": "{}",
      "/x/examples/messy-sales/Messy Sales Demo.Report/definition/report.json": "{}",
      "/x/examples/messy-sales/Messy Sales Demo.SemanticModel/definition/model.tmdl": "model M\n",
    });
    expect(tree.entries.map((e) => e.path)).toEqual([
      "messy-sales/Messy Sales Demo.Report/definition/report.json",
      "messy-sales/Messy Sales Demo.SemanticModel/definition/model.tmdl",
      "messy-sales/pbiplint.config.json",
    ]);
    expect(tree.modelFolders).toEqual(["messy-sales/Messy Sales Demo.SemanticModel"]);
    expect(tree.reportFolders).toEqual(["messy-sales/Messy Sales Demo.Report"]);
    expect(tree.markers).toEqual([]);
    expect(tree.diagnostics).toEqual([]);
    expect(tree.unreadFolders).toEqual([]);
  });
});
