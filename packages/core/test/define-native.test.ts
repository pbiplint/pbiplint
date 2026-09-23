import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/engine/config.js";
import { effectiveSeverity } from "../src/engine/rank.js";
import { pbiplintRule, type PbiplintRuleSpec } from "../src/rules/pbiplint/define.js";
import { pbiplintRules } from "../src/rules/pbiplint/index.js";
import { defaultRules } from "../src/rules/index.js";

describe("pbiplintRule", () => {
  const spec: PbiplintRuleSpec = {
    id: "X_RULE",
    name: "X",
    category: "Report Design",
    severity: 1,
    scope: ["Visual"],
    layer: "project",
    options: [{ name: "expect", type: "string", values: ["none"] }],
    policySeverity: (o) => (o.expect === "none" ? 2 : undefined),
    check: () => [],
  };
  const rule = pbiplintRule(spec);
  it("derives needs from the layer and marks the rule built in", () => {
    expect(rule).toMatchObject({
      status: "builtin",
      needs: ["model", "report"],
      references: [],
      description: "X",
    });
    expect(pbiplintRule({ ...spec, layer: "report" }).needs).toEqual(["report"]);
  });
  it("takes the needs a rule declares over the ones its layer implies", () => {
    expect(pbiplintRule({ ...spec, layer: "report", needs: ["model", "report"] })).toMatchObject({
      layer: "report",
      needs: ["model", "report"],
    });
  });
  it("lets a policy raise the severity unless the config overrides it", () => {
    expect(effectiveSeverity(rule, resolveConfig())).toBe(1);
    expect(effectiveSeverity(rule, resolveConfig({ rules: { X_RULE: { expect: "none" } } }))).toBe(
      2,
    );
    expect(
      effectiveSeverity(
        rule,
        resolveConfig({ rules: { X_RULE: { expect: "none", severity: "error" } } }),
      ),
    ).toBe(3);
  });
  it("is in the default rule set after the ported rules", () => {
    expect(defaultRules.slice(-pbiplintRules.length).map((r) => r.id)).toEqual(
      pbiplintRules.map((r) => r.id),
    );
  });
});
