import type { Indexes } from "../index/build.js";
import type { MessageId } from "../messages/en.js";
import type { Message, MessageParam } from "../messages/format.js";
import type { Model, SourceLocation } from "../model/types.js";
import type { Report } from "../pbir/types.js";
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
  | "Function"
  | "DataSource"
  | "File"
  | "Report"
  | "Page"
  | "Visual"
  | "Bookmark"
  | "ReportMeasure";

/**
 * Which part of a project a rule reads: one file family, both (`project`), or the Power Query M
 * that the model's files hold (`powerquery`, v3 spec, section 10.1). A Power Query rule's findings
 * are on model files, so their own layer (`LayerName`) is `model`.
 */
export type Layer = "model" | "report" | "project" | "powerquery";
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
  /** Never `severity`, which a rule's object in pbiplint.config.json reads as the rule's severity. */
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
  /**
   * Records an error the rule caught in one part of its work, so the rest still reports: `runRules`
   * lists each as a `RuleError` with the rule's id, its message the site's label and the error's
   * class alone. Absent when a rule is called without the engine.
   */
  reportError?: (error: unknown, site: ErrorSite) => void;
}

/** Where a rule caught an error: a label for the message, and the object it was working on. */
export interface ErrorSite {
  /** Names the part of the work, as `query 'Sales'` in English. */
  label: Message;
  /** The object the failed part was about, as a finding on it would name it. */
  finding: RuleFinding;
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
  /** The detail as English text. A finding carries this or `message`, never both. */
  detail?: string;
  /** The detail as a message, which `runRules` renders into the finding's `detail`. */
  message?: Message;
  object?: Ignorable;
}

export interface Finding {
  ruleId: string;
  layer: LayerName;
  objectType: ObjectType;
  objectName: string;
  objectId?: string;
  location?: SourceLocation;
  /** The detail in English, rendered from the message when the rule gave one. */
  detail?: string;
  /** The detail's message ID, set exactly when `detail` was rendered from a message. */
  messageId?: MessageId;
  /** The detail's message parameters, set exactly when `messageId` is. */
  params?: Readonly<Record<string, MessageParam>>;
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
  /**
   * The unread report files that stop the rule: a predicate over the report, one of those in
   * report-helpers.ts such as `fieldFileUnread`, that holds when a file the rule's findings depend
   * on could not be read. The engine then skips the rule with the reason `reportFileUnread`, so it
   * reports nothing and the skipped line says why.
   */
  skipWhenUnread?: (report: Report) => boolean;
  /**
   * The model side of `skipWhenUnread`: a predicate over the model, `modelPartlyRead` or
   * `tablesPartlyRead` in helpers.ts, that holds when the model may lack something its files
   * declare, or a part of a table's declaration. The engine then skips the rule with the reason
   * `modelFileUnread`, after it has checked `skipWhenUnread`, so a rule both stop gives the
   * report's reason.
   */
  skipWhenModelUnread?: (model: Model) => boolean;
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
