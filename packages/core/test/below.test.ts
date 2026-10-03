import { describe, expect, it } from "vitest";
import {
  projectBelowNotice,
  projectsBelow,
  reportsNamed,
  type FoundBelow,
} from "../src/project/below.js";

const j = (v: unknown) => JSON.stringify(v);
/** A .pbip's text whose artifacts name each of `reports`, as Microsoft's schema has it. */
const pbipText = (...reports: string[]): string =>
  j({ version: "1.0", artifacts: reports.map((path) => ({ report: { path } })) });
/** A definition.pbir's text that names the model at `path`. */
const byPath = (path: string): string => j({ datasetReference: { byPath: { path } } });
/** A whole project in the folder `dir`: its .pbip, its report, and the model the report reads. */
const project = (dir: string, name = "Demo"): FoundBelow => ({
  pbips: [{ path: `${dir}/${name}.pbip`, text: pbipText(`${name}.Report`) }],
  reports: [{ path: `${dir}/${name}.Report`, pbir: byPath(`../${name}.SemanticModel`) }],
  models: [`${dir}/${name}.SemanticModel`],
});
const both = (a: FoundBelow, b: FoundBelow): FoundBelow => ({
  pbips: [...a.pbips, ...b.pbips],
  reports: [...a.reports, ...b.reports],
  models: [...a.models, ...b.models],
});
const none: FoundBelow = { pbips: [], reports: [], models: [] };

describe("projectsBelow (#174)", () => {
  it("finds no project where there is none", () => {
    expect(projectsBelow(none)).toEqual([]);
  });
  it("gives a project alone in its folder as that folder, one level down or two", () => {
    expect(projectsBelow(project("sub"))).toEqual(["sub"]);
    expect(projectsBelow(project("a/b"))).toEqual(["a/b"]);
  });
  it("gives each of several projects, in name order by the whole path", () => {
    expect(projectsBelow(both(project("b"), project("a")))).toEqual(["a", "b"]);
    // "Archive 2024/" sorts before "Archive/", as the refusals that name folders sort them.
    expect(projectsBelow(both(project("Archive/Old"), project("Archive 2024/Older")))).toEqual([
      "Archive 2024/Older",
      "Archive/Old",
    ]);
  });
  it("counts the model a thin report reads by path as the report's, beside it or elsewhere", () => {
    // Beside it under another name: the folder, which pairs the two as a PBIP folder does.
    const beside: FoundBelow = {
      pbips: [{ path: "sub/Thin.pbip", text: pbipText("Thin.Report") }],
      reports: [{ path: "sub/Thin.Report", pbir: byPath("../Shared.SemanticModel") }],
      models: ["sub/Shared.SemanticModel"],
    };
    expect(projectsBelow(beside)).toEqual(["sub"]);
    // Elsewhere: the .pbip, which the CLI follows to the model, and the model is no project of
    // its own.
    const elsewhere: FoundBelow = {
      pbips: [{ path: "reports/Thin.pbip", text: pbipText("Thin.Report") }],
      reports: [{ path: "reports/Thin.Report", pbir: byPath("../../models/Shared.SemanticModel") }],
      models: ["models/Shared.SemanticModel"],
    };
    expect(projectsBelow(elsewhere)).toEqual(["reports/Thin.pbip"]);
    // A path written in another case still names the folder, as pairingDecision compares them.
    const cased: FoundBelow = {
      ...beside,
      reports: [{ path: "sub/Thin.Report", pbir: byPath("..\\shared.semanticmodel\\") }],
    };
    expect(projectsBelow(cased)).toEqual(["sub"]);
  });
  it("gives a .pbip whose report reads a model the search did not find as the .pbip, which follows it", () => {
    // Alone in its folder, but read as that folder the report's path would not be followed.
    const outside: FoundBelow = {
      pbips: [{ path: "sub/Thin.pbip", text: pbipText("Thin.Report") }],
      reports: [{ path: "sub/Thin.Report", pbir: byPath("../../../Shared/Shared.SemanticModel") }],
      models: [],
    };
    expect(projectsBelow(outside)).toEqual(["sub/Thin.pbip"]);
  });
  it("knows each thing found by its path, matching a path written in another case only failing that", () => {
    // Two folders whose names differ only in case, as a case-sensitive file system can hold, are
    // two projects.
    expect(
      projectsBelow({ ...none, models: ["A/Sales.SemanticModel", "a/Sales.SemanticModel"] }),
    ).toEqual(["a/Sales.SemanticModel", "A/Sales.SemanticModel"]);
    // A report reads the one its path names exactly, where another differs only in case.
    const exact: FoundBelow = {
      pbips: [],
      reports: [{ path: "sub/R.Report", pbir: byPath("../M.SemanticModel") }],
      models: ["sub/M.SemanticModel", "sub/m.SemanticModel"],
    };
    expect(projectsBelow(exact)).toEqual([
      "sub/m.SemanticModel",
      "sub/M.SemanticModel",
      "sub/R.Report",
    ]);
  });
  it("never gives a folder named definition, which would be read as a model's definition folder", () => {
    expect(projectsBelow(project("x/definition"))).toEqual(["x/definition/Demo.pbip"]);
  });
  it("pairs a report whose definition.pbir names no model with the one model beside it, as a PBIP folder does", () => {
    for (const pbir of [j({ version: "4.0" }), undefined]) {
      const pair: FoundBelow = {
        pbips: [],
        reports: [{ path: "sub/R.Report", pbir }],
        models: ["sub/M.SemanticModel"],
      };
      expect(projectsBelow(pair)).toEqual(["sub"]);
    }
    // A report bound to a published model reads none of them.
    const published = j({ datasetReference: { byConnection: { connectionString: "x" } } });
    expect(
      projectsBelow({
        pbips: [],
        reports: [{ path: "sub/R.Report", pbir: published }],
        models: ["sub/M.SemanticModel"],
      }),
    ).toEqual(["sub/M.SemanticModel", "sub/R.Report"]);
  });
  it("gives each .pbip of a folder that holds several, as a folder of them is refused", () => {
    const shared = both(project("ws", "Cost"), project("ws", "Sales"));
    expect(projectsBelow(shared)).toEqual(["ws/Cost.pbip", "ws/Sales.pbip"]);
  });
  it("reads a .pbip that names no report as its folder, which takes the parts beside it", () => {
    for (const text of [pbipText(), "not JSON", undefined]) {
      const p = project("sub");
      expect(projectsBelow({ ...p, pbips: [{ path: "sub/Demo.pbip", text }] })).toEqual(["sub"]);
    }
  });
  it("gives a report and its model with no .pbip as their folder, and each part where the folder holds more", () => {
    const pair = (dir: string, name: string): FoundBelow => ({
      pbips: [],
      reports: [{ path: `${dir}/${name}.Report`, pbir: byPath(`../${name}.SemanticModel`) }],
      models: [`${dir}/${name}.SemanticModel`],
    });
    expect(projectsBelow(pair("ws", "A"))).toEqual(["ws"]);
    // Pointed at, the folder would be refused as holding two of each, and a report folder alone
    // reads the report alone, so its model is a project of its own.
    expect(projectsBelow(both(pair("ws", "A"), pair("ws", "B")))).toEqual([
      "ws/A.Report",
      "ws/A.SemanticModel",
      "ws/B.Report",
      "ws/B.SemanticModel",
    ]);
  });
  it("gives a part alone as its own folder", () => {
    expect(projectsBelow({ ...none, models: ["Models/Old.SemanticModel"] })).toEqual([
      "Models/Old.SemanticModel",
    ]);
    const published = j({ datasetReference: { byConnection: { connectionString: "x" } } });
    expect(
      projectsBelow({ ...none, reports: [{ path: "sub/Thin.Report", pbir: published }] }),
    ).toEqual(["sub/Thin.Report"]);
    // A .pbip whose report is not there is the .pbip, which says so when pointed at.
    expect(
      projectsBelow({ ...none, pbips: [{ path: "sub/Gone.pbip", text: pbipText("Gone.Report") }] }),
    ).toEqual(["sub/Gone.pbip"]);
  });
});

describe("reportsNamed", () => {
  it("gives the report paths a .pbip's artifacts name, as it writes them", () => {
    expect(reportsNamed(pbipText("Demo.Report", "./Other.Report"))).toEqual([
      "Demo.Report",
      "./Other.Report",
    ]);
    expect(reportsNamed(j({ artifacts: [{ dataset: { path: "x" } }, { report: {} }] }))).toEqual(
      [],
    );
    expect(reportsNamed("not JSON")).toEqual([]);
    expect(reportsNamed("[]")).toEqual([]);
  });
});

describe("projectBelowNotice", () => {
  it("names the one project found below the folder given, which was linted as if given directly", () => {
    expect(projectBelowNotice("sub/messy-sales")).toEqual({
      kind: "project-below-input",
      path: "sub/messy-sales",
      message:
        "sub/messy-sales is the only project found below the folder given, so it was linted as if given directly",
    });
  });
});
