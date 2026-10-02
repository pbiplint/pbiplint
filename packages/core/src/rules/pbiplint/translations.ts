import type { CultureTranslations, Model } from "../../model/types.js";
import { finding, modelPartlyRead } from "../helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

/** "fr-FR", "fr-FR and de-DE", "fr-FR, de-DE, and es-ES". */
const listOf = (items: string[]): string =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;

/**
 * Every visible table (calculation groups included), column, measure, and hierarchy, and every
 * level of a visible hierarchy, that a culture other than the model's own leaves without a caption,
 * reading only the cultures that have a `translations` block. With no `culture` line under
 * `model`, every culture with a block counts. A caption equal to the object's name counts.
 */
function namesWithoutTranslation(model: Model): RuleFinding[] {
  const ownCulture = model.props.culture;
  const own = typeof ownCulture === "string" ? ownCulture.toLowerCase() : undefined;
  const cultures = model.cultures.filter(
    (c) => c.translations !== undefined && c.name.toLowerCase() !== own,
  );
  if (cultures.length === 0) return [];
  const out: RuleFinding[] = [];
  const report = (f: RuleFinding, captioned: (tr: CultureTranslations) => boolean): void => {
    const missing = cultures.filter((c) => !captioned(c.translations!)).map((c) => c.name);
    if (missing.length === 0) return;
    const cultureDetail = `no caption in ${listOf(missing)}`;
    out.push({ ...f, detail: f.detail ? `${f.detail}, ${cultureDetail}` : cultureDetail });
  };
  for (const t of model.tables) {
    if (t.isHidden) continue;
    report(finding.table(t), (tr) => tr.tables.includes(t.name));
    for (const c of t.columns)
      if (!c.isHidden)
        report(finding.column(c), (tr) =>
          tr.columns.some((x) => x.table === t.name && x.name === c.name),
        );
    for (const m of t.measures)
      if (!m.isHidden)
        report(finding.measure(m), (tr) =>
          tr.measures.some((x) => x.table === t.name && x.name === m.name),
        );
    for (const h of t.hierarchies) {
      if (h.isHidden) continue;
      report(finding.hierarchy(h), (tr) =>
        tr.hierarchies.some((x) => x.table === t.name && x.name === h.name),
      );
      for (const l of h.levels)
        report(finding.level(l), (tr) =>
          tr.levels.some((x) => x.table === t.name && x.hierarchy === h.name && x.name === l.name),
        );
    }
  }
  return out;
}

// The idea of Tabular Editor's TRANSLATE_HIDEABLE_OBJECT_NAMES and TRANSLATE_HIERARCHY_LEVEL_NAMES
// (BPARules-PowerBI.json), in one rule. Documented deviations from them: a culture with no
// translations block is not read, a calculation group table is, and visibility is the object's and
// its table's, as pbiplint reads it elsewhere. A model file pbiplint could not fully read may hold
// the caption, or hide the object.
export const NAME_WITHOUT_TRANSLATION = pbiplintRule({
  id: "NAME_WITHOUT_TRANSLATION",
  name: "Visible name with no translation",
  category: "Naming Conventions",
  severity: 1,
  scope: [
    "Table",
    "Column",
    "CalculatedColumn",
    "CalculatedTable",
    "CalculatedTableColumn",
    "CalculationGroupTable",
    "Measure",
    "Hierarchy",
    "Level",
  ],
  layer: "model",
  skipWhenModelUnread: modelPartlyRead,
  check: ({ model }) => (model ? namesWithoutTranslation(model) : []),
});

export const translationRules = [NAME_WITHOUT_TRANSLATION];
