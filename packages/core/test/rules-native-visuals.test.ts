import { describe, expect, it } from "vitest";
import { HIDDEN_VISUAL_WITH_FIELDS } from "../src/rules/pbiplint/visuals.js";
import {
  bound,
  column,
  measure,
  page,
  reportFindings,
  reportObjectIds,
  visual,
} from "./report-helpers.js";

describe("HIDDEN_VISUAL_WITH_FIELDS", () => {
  it("fires on a hidden visual with fields bound and not on an empty one", () => {
    const files = [
      page("p"),
      bound("p", "hiddenBound", "cardVisual", [column("Sales", "Amount")], { isHidden: true }),
      visual("p", "hiddenEmpty", "textbox", { isHidden: true }),
      bound("p", "shown", "cardVisual", [column("Sales", "Amount")]),
    ];
    expect(reportObjectIds(HIDDEN_VISUAL_WITH_FIELDS, files)).toEqual(["hiddenBound"]);
  });

  it("counts the entries in the visual's wells, not the field references they hold", () => {
    const wells = (name: string, queryState: Record<string, unknown>) =>
      visual("p", name, "tableEx", { isHidden: true }, { query: { queryState } });
    const files = [
      page("p"),
      // A visual calculation is a field in a well that references no model field.
      wells("calc", {
        Values: {
          projections: [
            {
              field: {
                NativeVisualCalculation: {
                  Language: "dax",
                  Expression: "RUNNINGSUM([C0])",
                  Name: "Running total",
                },
              },
            },
          ],
        },
      }),
      // An arithmetic projection is one field in a well, though each operand is a reference.
      wells("sum", {
        Values: {
          projections: [
            {
              field: {
                Arithmetic: {
                  Left: measure("Sales", "Total Sales"),
                  Right: measure("Sales", "Total Cost"),
                  Operator: 1,
                },
              },
            },
          ],
        },
      }),
      // One field bound in two roles is in two wells.
      wells("twice", {
        Category: { projections: [{ field: column("Sales", "Region") }] },
        Tooltips: { projections: [{ field: column("Sales", "Region") }] },
      }),
    ];
    expect(
      reportFindings(HIDDEN_VISUAL_WITH_FIELDS, files).map((f) => [f.objectId, f.detail]),
    ).toEqual([
      ["calc", "1 field bound"],
      ["sum", "1 field bound"],
      ["twice", "2 fields bound"],
    ]);
  });

  it("sits on the isHidden line of the visual's visual.json", () => {
    const file = bound("p", "hidden", "cardVisual", [column("Sales", "Amount")], {
      isHidden: true,
    });
    const text = JSON.stringify(JSON.parse(file.text), null, 2);
    const line = text.slice(0, text.indexOf('"isHidden"')).split("\n").length;
    expect(line).toBeGreaterThan(1);
    const [f] = reportFindings(HIDDEN_VISUAL_WITH_FIELDS, [page("p"), { ...file, text }]);
    expect(f).toMatchObject({
      objectType: "Visual",
      objectId: "hidden",
      location: { file: "definition/pages/p/visuals/hidden/visual.json", line },
      detail: "1 field bound",
    });
    expect(HIDDEN_VISUAL_WITH_FIELDS).toMatchObject({
      name: "Hidden visual with fields bound",
      category: "Maintenance",
      severity: 1,
      scope: ["Visual"],
      layer: "report",
      needs: ["report"],
      status: "builtin",
    });
  });
});
