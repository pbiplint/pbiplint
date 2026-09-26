import { describe, expect, it } from "vitest";
import {
  datasetReference,
  isPbix,
  isReportFile,
  noTmdlNote,
  noTmdlRefusal,
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
  // From Learn's Power BI Desktop projects pages: the menu path, the three preview options (the
  // PBIP save, the PBIR report format, and the TMDL model format), and the file type, as Learn
  // labels them.
  const HOW =
    "pbiplint reads a report saved as a Power BI project (PBIP). In Power BI Desktop, open File > Options and settings > Options > Preview features and turn on each of these it lists: Power BI Project (.pbip) save option, Store reports using enhanced metadata format (PBIR), and Store semantic model using TMDL format. Then choose File > Save as and pick Power BI project files (*.pbip) as the file type.";
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

describe("a model folder that holds no .tmdl files (tracked in #88)", () => {
  // The cause is offered, not asserted: such a folder may as well be empty or half copied.
  const TMDL_ONLY =
    "Only a model stored as TMDL can be linted; if it is in the older model.bim format, save it in the TMDL format from Power BI Desktop first.";
  it("names one folder, or several in the order given, and says only TMDL can be linted", () => {
    expect(noTmdlRefusal(["Demo/Old.SemanticModel"])).toBe(
      `Demo/Old.SemanticModel holds no .tmdl files. ${TMDL_ONLY}`,
    );
    expect(noTmdlRefusal(["a/B.SemanticModel", "a/A.SemanticModel"])).toBe(
      `a/B.SemanticModel and a/A.SemanticModel hold no .tmdl files. ${TMDL_ONLY}`,
    );
    expect(noTmdlRefusal(["A.SemanticModel", "B.SemanticModel", "C.SemanticModel"])).toBe(
      `A.SemanticModel, B.SemanticModel, and C.SemanticModel hold no .tmdl files. ${TMDL_ONLY}`,
    );
  });
  it("says the same beside something linted, where the browser notes the folders were not", () => {
    expect(noTmdlNote(["Proj/Old.SemanticModel"])).toBe(
      `Proj/Old.SemanticModel holds no .tmdl files and was not linted. ${TMDL_ONLY}`,
    );
    expect(noTmdlNote(["Proj/A.SemanticModel", "Proj/B.SemanticModel"])).toBe(
      `Proj/A.SemanticModel and Proj/B.SemanticModel hold no .tmdl files and were not linted. ${TMDL_ONLY}`,
    );
  });
});
