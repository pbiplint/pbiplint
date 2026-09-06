import type { Model } from "../../model/types.js";
import type { Category, ObjectType, Rule, RuleContext, RuleFinding, Severity } from "../types.js";
import { BPA_RULES, type BpaRuleMeta } from "./bpa-rules.data.js";

const byId = new Map(BPA_RULES.map((r) => [r.id, r]));

/** Microsoft scope name to pbiplint object type. KPI is not modeled in v1 and maps to nothing. */
const SCOPE_MAP: Record<string, ObjectType | null> = {
  Model: "Model",
  Table: "Table",
  CalculatedTable: "CalculatedTable",
  CalculationGroup: "CalculationGroupTable",
  DataColumn: "Column",
  CalculatedColumn: "CalculatedColumn",
  CalculatedTableColumn: "CalculatedTableColumn",
  Measure: "Measure",
  Partition: "Partition",
  Relationship: "Relationship",
  ModelRole: "Role",
  TablePermission: "TablePermission",
  Perspective: "Perspective",
  Hierarchy: "Hierarchy",
  Level: "Level",
  CalculationItem: "CalculationItem",
  NamedExpression: "NamedExpression",
  ProviderDataSource: "DataSource",
  StructuredDataSource: "DataSource",
  KPI: null,
};

export function mapScope(scope: string): ObjectType[] {
  const out: ObjectType[] = [];
  for (const s of scope
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)) {
    if (!(s in SCOPE_MAP)) throw new Error(`Unknown BPA scope: ${s}`);
    const t = SCOPE_MAP[s];
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export const metaOf = (id: string): BpaRuleMeta => {
  const meta = byId.get(id);
  if (!meta) throw new Error(`Unknown BPA rule id: ${id}`);
  return meta;
};

const stripCategory = (name: string): string => name.replace(/^\[[^\]]*\]\s*/, "");

const extractUrls = (text: string): string[] => [
  ...new Set((text.match(/https?:\/\/[^\s)"]+/g) ?? []).map((u) => u.replace(/[.,]$/, ""))),
];

/** A literal port of one Microsoft BPA rule: metadata from the ruleset, behavior from `check`. */
export function bpaRule(
  id: string,
  check: (model: Model, ctx: RuleContext) => RuleFinding[],
): Rule {
  const meta = metaOf(id);
  return {
    id,
    name: stripCategory(meta.name),
    category: meta.category as Category,
    severity: meta.severity as Severity,
    scope: mapScope(meta.scope),
    description: meta.description,
    fixExpression: meta.fixExpression,
    references: extractUrls(meta.description),
    status: "ported",
    check,
  };
}

/** A rule that needs VertiPaq statistics: declared so it can be listed, never run. */
export function liveModelRule(id: string): Rule {
  return { ...bpaRule(id, () => []), status: "needsLiveModel" };
}
