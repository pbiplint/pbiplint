import type { Indexes } from "../index/build.js";
import type { Model, Named, SourceLocation } from "../model/types.js";

export type Category =
  | "Performance"
  | "Error Prevention"
  | "DAX Expressions"
  | "Maintenance"
  | "Formatting"
  | "Naming Conventions";

/** Ranking order of categories (spec section 6). */
export const CATEGORY_ORDER: readonly Category[] = [
  "Performance",
  "Error Prevention",
  "DAX Expressions",
  "Maintenance",
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
  | "File";

export type RuleStatus = "ported" | "needsLiveModel" | "builtin";

export interface RuleContext {
  indexes: Indexes;
}

/** What a rule returns. `object` is used for ignore annotations and stripped before output. */
export interface RuleFinding {
  objectType: ObjectType;
  objectName: string;
  location?: SourceLocation;
  detail?: string;
  object?: Named;
}

export interface Finding {
  ruleId: string;
  objectType: ObjectType;
  objectName: string;
  location?: SourceLocation;
  detail?: string;
}

export interface Rule {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  scope: ObjectType[];
  description: string;
  fixExpression?: string;
  references: string[];
  status: RuleStatus;
  check(model: Model, ctx: RuleContext): RuleFinding[];
}
