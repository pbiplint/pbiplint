import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { resolveProject } from "../src/walk.js";

// A script as Power BI Desktop's TMDL view writes one: a table, and a measure under `ref table`.
const SCRIPT = [
  "createOrReplace",
  "",
  "\ttable Extra",
  "\t\tcolumn Amount",
  "\t\t\tdataType: double",
  "\t\t\tsummarizeBy: sum",
  "\t\t\tsourceColumn: Amount",
  "",
  "\tref table Sales",
  "",
  "\t\tmeasure Scripted = 1",
  "",
].join("\n");

/** A .SemanticModel folder whose saved TMDL view tab holds SCRIPT. */
function project(): string {
  const folder = join(tempDir("tmdl-scripts"), "Sales.SemanticModel");
  mkdirSync(join(folder, "definition", "tables"), { recursive: true });
  mkdirSync(join(folder, "TMDLScripts"));
  writeFileSync(join(folder, "definition", "model.tmdl"), "model Model\n\tculture: en-US\n");
  writeFileSync(
    join(folder, "definition", "tables", "Sales.tmdl"),
    "table Sales\n\tcolumn Region\n\t\tdataType: string\n\t\tsourceColumn: Region\n",
  );
  writeFileSync(join(folder, "TMDLScripts", "Script 1.tmdl"), SCRIPT);
  return folder;
}

const lintModel = async (folder: string) => {
  const { model } = resolveProject(folder);
  return lint(model!.files);
};

describe("TMDL view scripts and the CLI (#274)", () => {
  it("keeps a project's saved TMDL view tabs out of the model", async () => {
    const r = await lintModel(project());
    expect(r.model.tables.map((t) => t.name)).toEqual(["Sales"]);
    expect(r.model.tables[0]!.measures).toEqual([]);
    expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
  });

  it("reads a script named directly as the model it describes", async () => {
    const r = await lintModel(join(project(), "TMDLScripts", "Script 1.tmdl"));
    expect(r.model.tables.map((t) => t.name)).toEqual(["Extra", "Sales"]);
    expect(r.model.tables[1]!.measures.map((m) => m.name)).toEqual(["Scripted"]);
    expect(r.findings.map((f) => f.ruleId)).toContain("NUMERIC_COLUMN_SUMMARIZE_BY");
    expect(r.summary.rulesSkipped.some((s) => s.reason === "partOfModel")).toBe(true);
  });
});
