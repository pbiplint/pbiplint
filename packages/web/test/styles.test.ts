// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lint, resolveConfig } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { renderResults } from "../src/results/render.js";
import { SAMPLE_CONFIG, SAMPLE_FILES } from "../src/sample.js";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../src/styles.css"), "utf8");
const indexHtml = readFileSync(join(here, "../index.html"), "utf8");

/** Every class name used anywhere in a tree. */
function classesIn(root: ParentNode): Set<string> {
  const out = new Set<string>();
  for (const el of root.querySelectorAll("*")) for (const c of el.classList) out.add(c);
  return out;
}

describe("styles.css", () => {
  it("has a rule for every class the results and the home page use", () => {
    document.body.innerHTML = indexHtml
      .slice(indexHtml.indexOf("<body>") + 6, indexHtml.indexOf("</body>"))
      .replace(/<script[\s\S]*?<\/script>/, "");
    const container = document.createElement("section");
    document.body.append(container);
    const sample = lint(SAMPLE_FILES, { config: resolveConfig(JSON.parse(SAMPLE_CONFIG)) });
    renderResults(container, sample, {
      source: "the sample project",
      files: SAMPLE_FILES.map((f) => f.path),
      notes: ["Old.SemanticModel holds no .tmdl files."],
    });
    // The clean run renders a different paragraph, so both shapes contribute their classes.
    const withFindings = classesIn(document.body);
    // A project rule whose findings fall on both layers is tagged project. The sample has no such
    // group, so one of its groups is relabelled to bring the tag's class in.
    const [first] = sample.groups;
    renderResults(
      container,
      { ...sample, groups: [{ ...first!, rule: { ...first!.rule, layer: "project" } }] },
      { source: "the sample project" },
    );
    const project = classesIn(document.body);
    renderResults(container, lint([{ path: "m.tmdl", text: "model Model\n" }], { rules: [] }), {
      source: "pasted TMDL",
    });
    const used = [...new Set([...withFindings, ...project, ...classesIn(document.body)])].sort();
    for (const c of ["facts", "fact", "flag", "detail", "layer", "model", "report", "project"])
      expect(used).toContain(c);
    expect(used.length).toBeGreaterThan(20);
    // A class in the markup with no rule behind it is either a dead hook or a style someone meant
    // to write; either way the markup and the stylesheet have drifted apart.
    expect(used.filter((c) => !new RegExp(`\\.${c}\\b`).test(css))).toEqual([]);
  });
});
