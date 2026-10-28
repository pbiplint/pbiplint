/**
 * A rule's layer as the site names it, the site's copy of core's `Layer`: a file family, `project`
 * for a rule that reads both, or `powerquery` for a rule that reads the Power Query M a model's
 * files hold (v3 spec, section 10.1). The copy is deliberate for the reason CATEGORY_ORDER gives
 * in build/pages.ts: the site build imports nothing from core. The rules index (build/pages.ts and
 * rules-filter.ts) and the results page (results/render.ts) both read this module, so the two name
 * and filter a layer alike.
 */
export type RuleLayer = "model" | "report" | "project" | "powerquery";

/** Every layer a page may declare, and the list the error names when a page declares another. */
export const RULE_LAYERS: readonly RuleLayer[] = ["model", "report", "project", "powerquery"];

/**
 * How the site writes a layer on a tag, a meta line, and a filter box: Power Query by its product
 * name, every other layer by its own word, as before v3.
 */
export const LAYER_LABEL: Record<RuleLayer, string> = {
  model: "model",
  report: "report",
  project: "project",
  powerquery: "Power Query",
};

/** The families a reader can filter by, in the order their boxes show. `project` is not one. */
export const FILTER_LAYERS = ["model", "report", "powerquery"] as const;

/** A filter box's label, in title case like the severity and category boxes: "Power Query". */
export function boxLabel(layer: string): string {
  const label = LAYER_LABEL[layer as RuleLayer] ?? layer;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Whether a rule (on the rules index) or a group (in the results) on `layer` shows, given the
 * filter boxes `present` and the ones `checked`. A family shows while its box is checked, or when
 * it has no box. A `project` rule reads both file families, so it shows while the Model or the
 * Report box is checked, or when neither is present; Power Query alone does not show it.
 */
export function layerShown(
  layer: string,
  checked: ReadonlySet<string>,
  present: readonly string[],
): boolean {
  if (layer === "project") {
    const files = present.filter((l) => l === "model" || l === "report");
    return files.length === 0 || files.some((l) => checked.has(l));
  }
  return !present.includes(layer) || checked.has(layer);
}
