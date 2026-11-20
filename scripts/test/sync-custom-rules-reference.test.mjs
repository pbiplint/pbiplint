import { describe, expect, it } from "vitest";
import { teReference } from "@pbiplint/core/custom-rules";
import { TE_REFERENCE } from "../../packages/web/src/build/custom-rules-reference.data.ts";
import { referenceModule } from "../sync-custom-rules-reference.mjs";

describe("custom-rules-reference.data.ts", () => {
  it("is the reference the evaluator's own tables give today", () => {
    // Rerun scripts/sync-custom-rules-reference.mjs, after building core, when this fails.
    expect(TE_REFERENCE).toEqual(teReference());
  });
});

describe("referenceModule", () => {
  it("writes the reference as one typed constant, with a header that says how to regenerate it", () => {
    const text = referenceModule({ scopes: [{ name: "Model", types: ["Model"] }] });
    expect(text).toContain("node scripts/sync-custom-rules-reference.mjs");
    expect(text).toContain(
      'import type { TeReference } from "../../../core/src/custom-rules/te/reference.js";',
    );
    expect(text).toContain(
      'export const TE_REFERENCE: TeReference = {"scopes":[{"name":"Model","types":["Model"]}]};',
    );
  });
});
