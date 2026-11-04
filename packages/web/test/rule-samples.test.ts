import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exampleSample } from "../../../scripts/sync-rule-pages.mjs";
import { RULE_SAMPLES } from "../src/build/rule-samples.data.js";

const page = (slug: string): string =>
  readFileSync(new URL(`../../../rules/${slug}.md`, import.meta.url), "utf8");

describe("rule-samples.data.ts", () => {
  it("is the sample the contrast rule's page draws from its own example today", () => {
    // Rerun scripts/sync-rule-pages.mjs after editing the page's example.
    expect(exampleSample(page("low-text-contrast"), "LOW_TEXT_CONTRAST")).toEqual(
      RULE_SAMPLES.LOW_TEXT_CONTRAST,
    );
  });
  it("holds a sample for that rule alone", () => {
    expect(Object.keys(RULE_SAMPLES)).toEqual(["LOW_TEXT_CONTRAST"]);
  });
});
