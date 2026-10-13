import { describe, expect, it } from "vitest";
import { boxLabel, FILTER_LAYERS, LAYER_LABEL, layerShown, RULE_LAYERS } from "../src/layers.js";

describe("the site's rule layers", () => {
  it("names Power Query by its product name and every other layer by its own word", () => {
    expect([...RULE_LAYERS]).toEqual(["model", "report", "project", "powerquery"]);
    expect(LAYER_LABEL).toEqual({
      model: "model",
      report: "report",
      project: "project",
      powerquery: "Power Query",
    });
    expect(FILTER_LAYERS.map(boxLabel)).toEqual(["Model", "Report", "Power Query"]);
  });
});

describe("layerShown", () => {
  const all = ["model", "report", "powerquery"];
  it("shows a family's rule while its box is checked", () => {
    expect(layerShown("powerquery", new Set(["powerquery"]), all)).toBe(true);
    expect(layerShown("powerquery", new Set(["model", "report"]), all)).toBe(false);
    expect(layerShown("model", new Set(["model"]), all)).toBe(true);
    expect(layerShown("report", new Set(["model"]), all)).toBe(false);
  });
  it("shows a project rule while Model or Report is checked, not Power Query alone", () => {
    expect(layerShown("project", new Set(["model"]), all)).toBe(true);
    expect(layerShown("project", new Set(["report"]), all)).toBe(true);
    expect(layerShown("project", new Set(["powerquery"]), all)).toBe(false);
    expect(layerShown("project", new Set(), all)).toBe(false);
  });
  it("shows a project rule when neither Model nor Report has a box", () => {
    expect(layerShown("project", new Set(["powerquery"]), ["powerquery"])).toBe(true);
  });
  it("shows everything when there are no boxes, and a family that has no box", () => {
    for (const layer of ["model", "report", "project", "powerquery"])
      expect(layerShown(layer, new Set(), []), layer).toBe(true);
    expect(layerShown("powerquery", new Set(["model"]), ["model", "report"])).toBe(true);
  });
});
