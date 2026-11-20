import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import type { LintFile } from "../src/engine/lint.js";
import type { Fact } from "../src/project/types.js";

const lit = (Value: string) => ({ expr: { Literal: { Value } } });
const fill = (hex: string) => ({ solid: { color: lit(`'${hex}'`) } });
const props = (o: object) => [{ properties: o }];
const WHITE = props({ show: lit("true"), color: fill("#FFFFFF"), transparency: lit("0D") });
const title = (hex: string) =>
  props({ show: lit("true"), text: lit("'Sales'"), fontSize: lit("12D"), fontColor: fill(hex) });

const shape = (name: string, vco: object): LintFile => ({
  path: `definition/pages/p/visuals/${name}/visual.json`,
  text: JSON.stringify({
    name,
    position: { x: 0, y: 0, z: 0, width: 100, height: 100 },
    visual: { visualType: "shape", visualContainerObjects: vco },
  }),
});
const BASE: LintFile[] = [
  { path: "definition/report.json", text: "{}" },
  { path: "definition/pages/p/page.json", text: JSON.stringify({ name: "p", displayName: "P" }) },
];
const contrastFact = async (files: LintFile[]): Promise<Fact | undefined> =>
  (await lint([...BASE, ...files])).facts.find((f) => f.label === "Text contrast");

describe("the Text contrast fact", () => {
  it("counts text elements measured, below the threshold, not measured, and of unknown visibility", async () => {
    const fact = await contrastFact([
      // Measured and passing.
      shape("ok", { background: WHITE, title: title("#000000") }),
      // Measured and below the threshold.
      shape("low", { background: WHITE, title: title("#BBBBBB") }),
      // Not measured: the colour depends on the data.
      shape("data", {
        background: WHITE,
        title: props({
          show: lit("true"),
          text: lit("'Sales'"),
          fontColor: { solid: { color: { expr: { Measure: {} } } } },
        }),
      }),
    ]);
    expect(fact).toEqual({
      layer: "report",
      label: "Text contrast",
      value: "2 measured, 1 below the threshold, 1 not measured",
      detail: "1 colour from the data; 3 more of unknown visibility",
      ruleId: "LOW_TEXT_CONTRAST",
      counts: { measured: 2, below: 1, notMeasured: 1, "data-dependent": 1, visibilityNotKnown: 3 },
    });
  });
  it("links no rule when nothing is below the threshold", async () => {
    const fact = await contrastFact([shape("ok", { background: WHITE, title: title("#000000") })]);
    expect(fact?.ruleId).toBeUndefined();
    expect(fact?.value).toBe("1 measured, 0 below the threshold");
  });
  it("has no line for a report without visuals, or without a report", async () => {
    expect(await contrastFact([])).toBeUndefined();
    const model = await lint([{ path: "definition/model.tmdl", text: "model Model\n" }]);
    expect(model.facts.find((f) => f.label === "Text contrast")).toBeUndefined();
  });
  it("counts below the threshold exactly the elements the rule reports on", async () => {
    const files = [
      ...BASE,
      shape("a", { background: WHITE, title: title("#BBBBBB") }),
      shape("b", { background: WHITE, title: title("#CCCCCC") }),
      shape("c", { background: WHITE, title: title("#000000") }),
    ];
    const result = await lint(files);
    const fact = result.facts.find((f) => f.label === "Text contrast")!;
    const findings = result.findings.filter((f) => f.ruleId === "LOW_TEXT_CONTRAST");
    expect(fact.counts?.below).toBe(findings.length);
  });
});
