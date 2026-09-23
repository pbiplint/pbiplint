import type { Indexes } from "../index/build.js";
import type { SourceLocation } from "../model/types.js";
import type { Project } from "../project/types.js";

export type Category =
  | "Performance"
  | "Error Prevention"
  | "Accessibility"
  | "DAX Expressions"
  | "Maintenance"
  | "Report Design"
  | "Formatting"
  | "Naming Conventions";

/** Ranking order of categories (v2 spec section 7). The site build carries a copy a test holds equal. */
export const CATEGORY_ORDER: readonly Category[] = [
  "Performance",
  "Error Prevention",
  "Accessibility",
  "DAX Expressions",
  "Maintenance",
  "Report Design",
  "Formatting",
  "Naming Conventions",
];

/** 1 info, 2 warning, 3 error, as in BPARules.json. */
export type Severity = 1 | 2 | 3;

export const SEVERITY_LABEL: Record<Severity, "info" | "warning" | "error"> = {
  1: "info",
  2: "warning",
  3: "error",
};

export type ObjectType =
  | "Model"
  | "Table"
  | "CalculatedTable"
  | "CalculationGroupTable"
  | "Column"
  | "CalculatedColumn"
  | "CalculatedTableColumn"
  | "Measure"
  | "Partition"
  | "Relationship"
  | "Role"
  | "TablePermission"
  | "Perspective"
  | "Hierarchy"
  | "Level"
  | "CalculationItem"
  | "NamedExpression"
  | "DataSource"
  | "File"
  | "Report"
  | "Page"
  | "Visual"
  | "Bookmark"
  | "ReportMeasure";

/** Which part of a project a rule reads: one layer, or both (`project`). */
export type Layer = "model" | "report" | "project";
/** The two parts a project can hold. */
export type LayerName = "model" | "report";

export const REPORT_OBJECT_TYPES: ReadonlySet<ObjectType> = new Set<ObjectType>([
  "Report",
  "Page",
  "Visual",
  "Bookmark",
  "ReportMeasure",
]);

/** The layer a finding belongs to, from the object it names: the file family a reader opens to fix it. */
export const layerOf = (t: ObjectType): LayerName =>
  REPORT_OBJECT_TYPES.has(t) ? "report" : "model";

export type RuleStatus = "ported" | "needsLiveModel" | "builtin";

/** An option a rule accepts from pbiplint.config.json, with its default. */
export interface RuleOption {
  name: string;
  type: "number" | "string";
  default?: number | string;
  /** For a string option, the values it accepts. */
  values?: readonly string[];
}

export type RuleOptions = Readonly<Record<string, number | string>>;

export interface RuleContext {
  indexes: Indexes;
  /** The rule's options after config: every declared default, overridden by the config file. */
  options: RuleOptions;
}

/** Anything that can carry a pbiplint.ignore annotation: every model object and every page and visual. */
export interface Ignorable {
  annotations: Record<string, string>;
}

/** What a rule returns. `object` is used for ignore annotations and stripped before output. */
export interface RuleFinding {
  objectType: ObjectType;
  objectName: string;
  /** The report object's `name` (page, visual, bookmark id), or `report`; parity compares on it. Model findings carry none. */
  objectId?: string;
  /** Which part the finding belongs to, when the object type alone cannot say: a File is in either. Defaults to layerOf(objectType). */
  layer?: LayerName;
  location?: SourceLocation;
  detail?: string;
  object?: Ignorable;
}

export interface Finding {
  ruleId: string;
  layer: LayerName;
  objectType: ObjectType;
  objectName: string;
  objectId?: string;
  location?: SourceLocation;
  detail?: string;
}

export interface Rule {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  scope: ObjectType[];
  layer: Layer;
  /** The layers the rule cannot run without; it is skipped with `noModel` or `noReport` when one is absent. */
  needs: readonly LayerName[];
  /** Options the config may set for this rule; an option the rule does not declare is a ConfigError. */
  options?: readonly RuleOption[];
  /** What the rule checks, one paragraph from the rule page in pbiplint's own words. */
  description: string;
  fixExpression?: string;
  references: string[];
  status: RuleStatus;
  /** A policy rule's severity under its options, read when the config sets no severity for it. */
  policySeverity?(options: RuleOptions): Severity | undefined;
  check(project: Project, ctx: RuleContext): RuleFinding[];
}
