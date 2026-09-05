import { describe, expect, it } from "vitest";
import { slug } from "../src/model/names.js";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { microsoftBpaRules } from "../src/rules/microsoft-bpa/index.js";
import { defaultRules } from "../src/rules/index.js";

describe("microsoft-bpa pack", () => {
  it("contains every rule in BPARules.json exactly once, in ruleset order", () => {
    expect(microsoftBpaRules.map((r) => r.id)).toEqual(BPA_RULES.map((r) => r.id));
  });
  it("declares exactly the five VertiPaq rules as needsLiveModel", () => {
    expect(microsoftBpaRules.filter((r) => r.status === "needsLiveModel").map((r) => r.id)).toEqual(
      [
        "AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS",
        "REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY",
        "SPLIT_DATE_AND_TIME",
        "LARGE_TABLES_SHOULD_BE_PARTITIONED",
        "FIX_REFERENTIAL_INTEGRITY_VIOLATIONS",
      ],
    );
  });
  it("has unique slugs across the default rule set", () => {
    const slugs = defaultRules.map((r) => slug(r.id));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(defaultRules.length).toBe(72);
  });
  it("gives every rule a scope, a name without the category prefix, and a category from the fixed list", () => {
    for (const r of microsoftBpaRules) {
      expect(r.scope.length, r.id).toBeGreaterThan(0);
      expect(r.name.startsWith("["), r.id).toBe(false);
      expect([
        "Performance",
        "Error Prevention",
        "DAX Expressions",
        "Maintenance",
        "Formatting",
        "Naming Conventions",
      ]).toContain(r.category);
    }
  });
});
