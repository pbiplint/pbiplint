import { describe, expect, it } from "vitest";
import {
  datasetReference,
  isReportFile,
  pairingDecision,
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
