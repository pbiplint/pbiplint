import { lint, resolveConfig, type ProjectRun } from "@pbiplint/core";
import { describe, expect, it, vi } from "vitest";
import { severalSarif } from "../src/several.js";

// formatSarif with one field more on its run than it writes today, standing in for a field a later
// version adds. Mocked in a file of its own, since vi.mock applies to the whole file.
vi.mock("@pbiplint/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@pbiplint/core")>();
  return {
    ...core,
    formatSarif: (...args: Parameters<typeof core.formatSarif>): string => {
      const doc = JSON.parse(core.formatSarif(...args)) as { runs: Record<string, unknown>[] };
      doc.runs[0] = { columnKind: "unicodeCodePoints", ...doc.runs[0] };
      return JSON.stringify(doc);
    },
  };
});

describe("severalSarif's one run", () => {
  it("keeps every field formatSarif writes on a run, not only the ones it merges", async () => {
    const config = resolveConfig({});
    const runs: ProjectRun[] = await Promise.all(
      ["a", "b"].map(async (path) => ({
        path,
        result: await lint([{ path: "m.tmdl", text: "model Model\n" }], { config }),
        config,
      })),
    );
    const doc = JSON.parse(
      severalSarif({ runs, prefixes: [{}, {}] }, { toolVersion: "0", help: {} }),
    );
    expect(doc.runs[0].columnKind).toBe("unicodeCodePoints");
    expect(Object.keys(doc.runs[0])).toEqual(["columnKind", "tool", "results"]);
  });
});
