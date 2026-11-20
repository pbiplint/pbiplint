import { describe, expect, it, vi } from "vitest";

// A measurement that throws partway: the fact must not show a partial count as if it were whole.
vi.mock("../src/colour/measure.js", () => ({
  measureReport: () => {
    throw new Error("partway");
  },
}));

const { lint } = await import("../src/engine/lint.js");

describe("the Text contrast fact when measuring fails", () => {
  it("says unknown rather than a count, and the run goes on", async () => {
    const result = await lint(
      [
        { path: "definition/report.json", text: "{}" },
        { path: "definition/pages/p/page.json", text: JSON.stringify({ name: "p" }) },
      ],
      { config: { rules: { LOW_TEXT_CONTRAST: "off" } } },
    );
    expect(result.facts.find((f) => f.label === "Text contrast")).toEqual({
      layer: "report",
      label: "Text contrast",
      value: "unknown",
      detail: "the text could not be measured",
    });
  });
});
