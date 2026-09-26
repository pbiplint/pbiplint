import { describe, expect, it } from "vitest";
import {
  datasetReference,
  isPbix,
  isReportFile,
  pairingDecision,
  pbixRefusal,
  routeFiles,
} from "../src/project/route.js";

describe("routeFiles", () => {
  it("sends .tmdl to the model and report files to the report, and drops the rest", () => {
    const { model, report } = routeFiles([
      { path: "definition/tables/Sales.tmdl", text: "" },
      { path: "definition/pages/p/page.json", text: "" },
      { path: "definition.pbir", text: "" },
      { path: ".platform", text: "" },
      { path: "Demo.pbip", text: "" },
      { path: "README.md", text: "" },
      { path: "StaticResources/x.json", text: "" },
    ]);
    expect(model.map((f) => f.path)).toEqual(["definition/tables/Sales.tmdl"]);
    expect(report.map((f) => f.path)).toEqual([
      "definition/pages/p/page.json",
      "definition.pbir",
      ".platform",
      "Demo.pbip",
    ]);
    expect(isReportFile("definition/report.json")).toBe(true);
    expect(isReportFile("definition/tables/x.tmdl")).toBe(false);
  });
});

describe("pairingDecision", () => {
  it("pairs a report with the model its byPath names, and only that one", () => {
    expect(
      pairingDecision(
        { kind: "byPath", path: "../Demo.SemanticModel" },
        "Demo.SemanticModel",
        "Demo.Report",
      ),
    ).toEqual({ useModel: true });
    expect(pairingDecision({ kind: "none" }, "Demo.SemanticModel", "Demo.Report")).toEqual({
      useModel: true,
    });
    expect(pairingDecision({ kind: "byConnection" }, "Demo.SemanticModel", "Demo.Report")).toEqual({
      useModel: false,
      reason: "this report reads a published model",
    });
    expect(
      pairingDecision({ kind: "byPath", path: "../Demo.SemanticModel" }, undefined, "Demo.Report"),
    ).toEqual({ useModel: false });
    expect(pairingDecision({ kind: "byConnection" }, undefined, "Demo.Report")).toEqual({
      useModel: false,
      reason: "this report reads a published model",
    });
    expect(
      pairingDecision(
        { kind: "byPath", path: "../Other.SemanticModel" },
        "Demo.SemanticModel",
        "Demo.Report",
      ),
    ).toEqual({
      useModel: false,
      reason: "this report reads a model outside the input (../Other.SemanticModel)",
      diagnostic: {
        kind: "model-reference-mismatch",
        path: "Demo.Report/definition.pbir",
        message:
          "Demo.Report/definition.pbir points at ../Other.SemanticModel, not at Demo.SemanticModel beside it, so the model was not paired with this report",
      },
    });
  });
  it("matches the folder byPath names with the one beside the report without regard to case", () => {
    expect(
      pairingDecision(
        { kind: "byPath", path: "../sales.semanticmodel" },
        "Sales.SemanticModel",
        "Sales.Report",
      ),
    ).toEqual({ useModel: true });
    expect(
      pairingDecision(
        { kind: "byPath", path: "..\\SALES.SEMANTICMODEL\\" },
        "Sales.SemanticModel",
        "Sales.Report",
      ),
    ).toEqual({ useModel: true });
    expect(
      pairingDecision(
        { kind: "byPath", path: "../returns.semanticmodel" },
        "Sales.SemanticModel",
        "Sales.Report",
      ),
    ).toEqual({
      useModel: false,
      reason: "this report reads a model outside the input (../returns.semanticmodel)",
      diagnostic: {
        kind: "model-reference-mismatch",
        path: "Sales.Report/definition.pbir",
        message:
          "Sales.Report/definition.pbir points at ../returns.semanticmodel, not at Sales.SemanticModel beside it, so the model was not paired with this report",
      },
    });
  });
  it("reads the dataset reference out of definition.pbir text", () => {
    expect(
      datasetReference('{"datasetReference":{"byPath":{"path":"../M.SemanticModel"}}}'),
    ).toEqual({ kind: "byPath", path: "../M.SemanticModel" });
    expect(datasetReference("not json")).toEqual({ kind: "none" });
    expect(datasetReference("[]")).toEqual({ kind: "none" });
  });
});

describe("a .pbix (tracked in #88)", () => {
  // From Learn's Power BI Desktop projects page: the menu path, the file type, and the preview
  // option, as Learn labels them.
  const HOW =
    "pbiplint reads a report saved as a Power BI project (PBIP). In Power BI Desktop, choose File > Save as and pick Power BI project files (*.pbip) as the file type (if it isn't offered, first turn on Power BI Project (.pbip) save option under File > Options and settings > Options > Preview features).";
  it("is known by its name alone, in any case", () => {
    for (const path of ["Sales.pbix", "Sales.PBIX", "Demo/old/Sales.Pbix", "a b.pbix"])
      expect(isPbix(path), path).toBe(true);
    for (const path of ["Sales.pbip", "Sales.pbit", "Sales.pbix.txt", "Sales.pbix/x.tmdl", "pbix"])
      expect(isPbix(path), path).toBe(false);
  });
  it("names one .pbix and says how to save the report as a Power BI project", () => {
    expect(pbixRefusal("Demo/Sales.pbix")).toBe(
      `Demo/Sales.pbix is a Power BI Desktop file (.pbix), which pbiplint cannot read. ${HOW}`,
    );
    expect(pbixRefusal("Sales.PBIX", 0)).toBe(
      `Sales.PBIX is a Power BI Desktop file (.pbix), which pbiplint cannot read. ${HOW}`,
    );
  });
  it("names the first of several and counts the others", () => {
    expect(pbixRefusal("Demo/A.pbix", 1)).toBe(
      `Demo/A.pbix and 1 other .pbix file are Power BI Desktop files, which pbiplint cannot read. ${HOW}`,
    );
    expect(pbixRefusal("Demo/A.pbix", 2)).toBe(
      `Demo/A.pbix and 2 other .pbix files are Power BI Desktop files, which pbiplint cannot read. ${HOW}`,
    );
  });
});
