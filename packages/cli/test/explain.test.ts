import { defaultRules } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { explainJson, explainRule, explainText, splitSections, suggest } from "../src/explain.js";
import { RULE_HELP } from "../src/rule-help.data.js";

const found = (input: string) => {
  const r = explainRule(input);
  if (!("rule" in r)) throw new Error(`${input} did not explain`);
  return r;
};

describe("explainRule", () => {
  it.each(defaultRules.map((r) => r.id))("explains %s", (id) => {
    const e = found(id);
    expect(e.rule.id).toBe(id);
    expect(e.rule.description).not.toBe("");
    expect(e.sections.whyItMatters).toBeTruthy();
    expect(e.sections.howToFixIt).toBeTruthy();
    const text = explainText(e);
    expect(text.startsWith(`${id}  `)).toBe(true);
    expect(text).toContain(e.rule.url);
    expect(text).not.toContain("Read more:");
    expect(JSON.parse(explainJson(e, "1.2.3")).rule.id).toBe(id);
  });

  it("has help for every rule and no help for a rule that does not exist", () => {
    expect(Object.keys(RULE_HELP).sort()).toEqual(defaultRules.map((r) => r.id).sort());
  });

  it("splits every rule's help into sections that rejoin to the help exactly", () => {
    const titles = {
      example: "Example",
      whyItMatters: "Why it matters",
      howToFixIt: "How to fix it",
      whenToIgnoreIt: "When to ignore it",
      quirks: "Quirks",
    } as const;
    for (const [id, help] of Object.entries(RULE_HELP)) {
      const s = splitSections(help.markdown);
      const rejoined = (Object.keys(titles) as (keyof typeof titles)[])
        .filter((k) => s[k] !== undefined)
        .map((k) => `### ${titles[k]}\n\n${s[k]}\n`)
        .join("\n");
      expect(`${rejoined}\nRead more: ${found(id).rule.url}`, id).toBe(help.markdown);
    }
  });

  it("matches an id in any case, and a rule's page name", () => {
    expect(found("avoid_duplicate_measures").rule.id).toBe("AVOID_DUPLICATE_MEASURES");
    expect(found("broken-action-target").rule.id).toBe("BROKEN_ACTION_TARGET");
    expect(found(" Broken Action Target ").rule.id).toBe("BROKEN_ACTION_TARGET");
  });

  it("gives the rule's fields at their default severity, with its description", () => {
    const e = found("BROKEN_ACTION_TARGET");
    expect(e.rule).toEqual({
      id: "BROKEN_ACTION_TARGET",
      name: "Action points at nothing",
      category: "Error Prevention",
      severity: 3,
      layer: "report",
      slug: "broken-action-target",
      url: "https://pbiplint.com/rules/broken-action-target",
      status: "builtin",
      description: defaultRules.find((r) => r.id === "BROKEN_ACTION_TARGET")!.description,
    });
  });

  it("suggests the nearest ids for one it does not know", () => {
    expect(explainRule("AVOID_DUPLICATE_MEASURE")).toEqual({
      suggestions: ["AVOID_DUPLICATE_MEASURES"],
    });
    expect(explainRule("nothing like any rule at all")).toEqual({ suggestions: [] });
    expect(explainRule("")).toEqual({ suggestions: [] });
  });
});

describe("suggest", () => {
  it("puts ids that contain the input first, at most three", () => {
    const s = suggest("DUPLICATE");
    expect(s.length).toBeLessThanOrEqual(3);
    expect(s).toContain("AVOID_DUPLICATE_MEASURES");
  });
  it("finds a near miss by edit distance", () => {
    expect(suggest("BROKEN_ACTOIN_TARGET")).toEqual(["BROKEN_ACTION_TARGET"]);
  });
});

describe("explainText", () => {
  it("leads with the id, the name, severity, layer, category, and the page link", () => {
    const lines = explainText(found("BROKEN_ACTION_TARGET")).split("\n");
    expect(lines.slice(0, 4)).toEqual([
      "BROKEN_ACTION_TARGET  Action points at nothing",
      "Error, report layer, Error Prevention",
      "https://pbiplint.com/rules/broken-action-target",
      "",
    ]);
  });
  it("says a rule that needs a live model is listed but not run", () => {
    const live = defaultRules.find((r) => r.status === "needsLiveModel")!;
    expect(explainText(found(live.id)).split("\n")[1]).toMatch(
      /, needs a live model \(listed, not run\)$/,
    );
  });
});

describe("explainJson", () => {
  it("prints one document with the version, the tool, the rule, and its sections", () => {
    const doc = JSON.parse(explainJson(found("BROKEN_ACTION_TARGET"), "1.2.3"));
    expect(Object.keys(doc)).toEqual(["version", "tool", "rule", "sections"]);
    expect(doc.version).toBe(1);
    expect(doc.tool).toEqual({ name: "pbiplint", version: "1.2.3" });
    expect(Object.keys(doc.sections)).toEqual(
      ["example", "whyItMatters", "howToFixIt", "whenToIgnoreIt", "quirks"].filter(
        (k) => k in doc.sections,
      ),
    );
    expect(doc.sections.howToFixIt).toBe(found("BROKEN_ACTION_TARGET").sections.howToFixIt);
  });
});
