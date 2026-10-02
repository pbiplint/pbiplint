import type { Model } from "../../model/types.js";
import type { Category, ObjectType, Rule, RuleContext, RuleFinding, Severity } from "../types.js";
import { RULE_SUMMARIES } from "../rule-summaries.data.js";
import { BPA_RULES, type BpaRuleMeta } from "./bpa-rules.data.js";

const byId = new Map(BPA_RULES.map((r) => [r.id, r]));

/**
 * Microsoft scope name to pbiplint object type. KPI is not modeled in v1 and maps to nothing.
 * `UserDefinedFunction` is Tabular Editor's token for a function, which Microsoft's ruleset does
 * not use yet.
 */
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
  UserDefinedFunction: "Function",
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

export interface BpaRuleSpec {
  /**
   * The partly read model that stops the rule (Rule.skipWhenModelUnread): `modelPartlyRead` for a
   * rule whose finding rests on the whole model, something missing from it or a share of all of it,
   * since a model file pbiplint could not fully read may hold what it looks for, and
   * `tablesPartlyRead` for one that reports a table, or something under it, for what any part of
   * the table's declaration can say.
   */
  skipWhenModelUnread?: (model: Model) => boolean;
}

type ModelCheck = (model: Model, ctx: RuleContext) => RuleFinding[];

/**
 * A port of one Microsoft BPA rule: metadata from the ruleset, behavior from `check`, and what
 * stops it, when anything does, from the spec given before `check`. A port keeps the source's
 * quirks, apart from the eleven deviations named on the pages and in the rules' doc comments, and
 * the thirteen rules that test a column's type leaving out a column whose TMDL names none (#164);
 * those a fixture shows are pinned by `ours` in the model expectation files, the others by the
 * rules' unit tests.
 * The description is pbiplint's own summary from the rule page, never the ruleset's text; the
 * ruleset description is read only for the reference URLs it carries.
 */
export function bpaRule(id: string, check: ModelCheck): Rule;
export function bpaRule(id: string, spec: BpaRuleSpec, check: ModelCheck): Rule;
export function bpaRule(id: string, ...args: [ModelCheck] | [BpaRuleSpec, ModelCheck]): Rule {
  const [{ skipWhenModelUnread }, check] = args.length === 1 ? [{}, args[0]] : args;
  const meta = metaOf(id);
  return {
    id,
    name: stripCategory(meta.name),
    category: meta.category as Category,
    severity: meta.severity as Severity,
    scope: mapScope(meta.scope),
    layer: "model",
    needs: ["model"],
    ...(skipWhenModelUnread ? { skipWhenModelUnread } : {}),
    description: RULE_SUMMARIES[id] ?? stripCategory(meta.name),
    fixExpression: meta.fixExpression,
    references: extractUrls(meta.description),
    status: "ported",
    // The 72 model bodies keep their (model, ctx) shape; the project is unwrapped here once.
    check: (project, ctx) => (project.model ? check(project.model, ctx) : []),
  };
}

/** A rule that needs VertiPaq statistics: declared so it can be listed, never run. */
export function liveModelRule(id: string): Rule {
  return { ...bpaRule(id, () => []), status: "needsLiveModel" };
}
