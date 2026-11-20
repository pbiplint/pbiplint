import { ConfigError } from "../engine/config.js";
import { CustomRuleStop, type CustomRuleSet } from "../engine/custom.js";
import type {
  Calendar,
  Column,
  Culture,
  Measure,
  Model,
  Role,
  RoleMember,
} from "../model/types.js";
import type { Diagnostic } from "../project/types.js";
import { finding, modelPartlyRead } from "../rules/helpers.js";
import type { Ignorable, ObjectType, Rule, RuleFinding, Severity } from "../rules/types.js";
import type { TmdlNode } from "../tmdl/types.js";
import { teRunner } from "./te/index.js";
import { readTeRuleFile, type TeRule, type TeRuleProblem } from "./te/read.js";
import type { TomObject } from "./te/view-types.js";

export type { CustomRuleSet } from "../engine/custom.js";

/**
 * A Tabular Editor rule's `Severity` as pbiplint's built-in rules read Microsoft's numbers (custom
 * rules spec, section 8): below 2 is info, 2 up to 3 a warning, 3 and above an error. A rule with
 * no `Severity` takes 1, the default Tabular Editor 2 gives it (`public int Severity { get; set; }
 * = 1;` in TabularEditor/BestPracticeAnalyzer/BestPracticeRule.cs, MIT, at commit
 * 4e050d23b5b203aa7805ca9a06c4a2823af6968f), which reads as info.
 */
export function teSeverity(n: number | undefined): Severity {
  const value = n ?? 1;
  return value >= 3 ? 3 : value >= 2 ? 2 : 1;
}

/** The objects each Tabular Editor scope reaches, as pbiplint's findings name their types. */
const SCOPE_OBJECT_TYPES: Record<string, readonly ObjectType[]> = {
  Model: ["Model"],
  Table: ["Table"],
  CalculatedTable: ["CalculatedTable"],
  Column: ["Column", "CalculatedColumn", "CalculatedTableColumn"],
  DataColumn: ["Column"],
  CalculatedColumn: ["CalculatedColumn"],
  CalculatedTableColumn: ["CalculatedTableColumn"],
  Measure: ["Measure"],
  Hierarchy: ["Hierarchy"],
  Level: ["Level"],
  Partition: ["Partition"],
  Relationship: ["Relationship"],
  Perspective: ["Perspective"],
  Culture: ["Culture"],
  ModelRole: ["Role"],
  ModelRoleMember: ["RoleMember"],
  TablePermission: ["TablePermission"],
  CalculationGroup: ["CalculationGroupTable"],
  CalculationItem: ["CalculationItem"],
  KPI: ["KPI"],
  NamedExpression: ["NamedExpression"],
  ProviderDataSource: ["DataSource"],
  StructuredDataSource: ["DataSource"],
  Variation: ["Variation"],
  Calendar: ["Calendar"],
  UserDefinedFunction: ["Function"],
};

const scopeTypes = (scopes: readonly string[]): ObjectType[] => [
  ...new Set(scopes.flatMap((s) => SCOPE_OBJECT_TYPES[s] ?? [])),
];

/** A finding without the context message a built-in helper adds: a custom finding has no detail. */
const bare = ({ message: _message, ...f }: RuleFinding): RuleFinding => f;
const at = (node: TmdlNode | undefined) =>
  node === undefined ? undefined : { file: node.file, line: node.line };

/**
 * A custom rule's finding on an object of the model view: the object type, name, and location
 * pbiplint's built-in helpers give that object, without their context message. The objects no
 * built-in rule reports (a KPI, a culture, a role member, a variation, a calendar) are named as
 * Tabular Editor names them. One with no annotations of its own gets an empty set, so Tabular
 * Editor's annotation on the model still reaches it.
 */
export function tomFinding(o: TomObject): RuleFinding {
  const s = o.source as never;
  const none = (): Ignorable => ({ annotations: {} });
  const own = (objectType: ObjectType, location: RuleFinding["location"], object: Ignorable) => ({
    objectType,
    objectName: o.teName,
    ...(location === undefined ? {} : { location }),
    object,
  });
  switch (o.type) {
    case "Model":
      return finding.model(s);
    case "Table":
    case "CalculatedTable":
    case "CalculationGroupTable":
      return finding.table(s);
    case "DataColumn":
    case "CalculatedColumn":
    case "CalculatedTableColumn":
      return finding.column(s);
    case "Measure":
      return finding.measure(s);
    case "Hierarchy":
      return bare(finding.hierarchy(s));
    case "Level":
      return bare(finding.level(s));
    case "Partition":
      return bare(finding.partition(s));
    case "Relationship":
      return finding.relationship(s);
    case "Perspective":
      return finding.perspective(s);
    case "ModelRole":
      return finding.role(s);
    case "TablePermission":
      return bare(finding.tablePermission(s));
    case "CalculationItem":
      return bare(finding.calculationItem(s));
    case "NamedExpression":
      return finding.expression(s);
    case "ProviderDataSource":
    case "StructuredDataSource":
      return finding.dataSource(s);
    case "Function":
      return finding.function(s);
    case "Culture":
      return own("Culture", (s as Culture).location, s);
    case "Calendar":
      return own("Calendar", (s as Calendar).location, s);
    case "KPI": {
      const k = s as { measure: Measure; node?: TmdlNode };
      return own("KPI", at(k.node) ?? k.measure.location, none());
    }
    case "ModelRoleMember":
      return own("RoleMember", (s as { role: Role; member: RoleMember }).role.location, none());
    case "Variation": {
      const v = s as { column: Column; node?: TmdlNode };
      return own("Variation", at(v.node) ?? v.column.location, none());
    }
    default:
      // A part reached only through a property (a column's AlternateOf, a dependency), which no
      // scope yields.
      return own("Model", undefined, none());
  }
}

/** The ids pbiplint keeps for its safety nets: a custom rule cannot take either. */
const RESERVED = new Set(["PARSE_ISSUE", "RULE_COULD_NOT_FINISH"]);
const PLACEHOLDER = /^\(rule \d+\)$/;

const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/** A custom rule that runs its Tabular Editor rule on the model when, and only when, it runs. */
function customRule(te: TeRule, file: string): Rule {
  return {
    id: te.id,
    name: te.name,
    category: te.category?.trim() ? te.category : "Custom",
    severity: teSeverity(te.severity),
    scope: scopeTypes(te.scopes),
    layer: "model",
    needs: ["model"],
    skipWhenModelUnread: modelPartlyRead,
    description: te.description?.trim() ? te.description : te.name,
    references: [],
    status: "custom",
    custom: {
      file,
      scopes: te.scopes,
      expression: te.expression,
      ...(te.severity === undefined ? {} : { teSeverity: te.severity }),
    },
    check: (project, ctx) => {
      const model: Model | undefined = project.model;
      if (model === undefined) return [];
      const outcome = teRunner(model)(te);
      if (outcome.kind === "could-not-run") throw new CustomRuleStop(outcome.reason);
      if (outcome.unset > 0) {
        ctx.notice?.({
          kind: "custom-rule-left-out",
          path: file,
          message: `The custom rule ${te.id} in ${file} left out ${plural(outcome.unset, "object", "objects")} whose files leave unset a value the rule reads, such as a calculated column's data type, and says nothing about ${outcome.unset === 1 ? "it" : "them"}.`,
        });
      }
      return outcome.objects.map(tomFinding);
    },
  };
}

/** A custom rule that cannot run: its check stops with the reason, which the engine reports. */
function stoppedRule(rule: Rule, reason: string): Rule {
  // The cause is in the rule file, so an unread model file does not hide it.
  const { skipWhenModelUnread: _skip, ...rest } = rule;
  return {
    ...rest,
    check: () => {
      throw new CustomRuleStop(reason);
    },
  };
}

/** A rule the reader could not read, as a custom rule that cannot run. */
function problemRule(problem: TeRuleProblem, id: string, file: string): Rule {
  const name = problem.name ?? id;
  return stoppedRule(
    {
      id,
      name,
      category: "Custom",
      severity: teSeverity(undefined),
      scope: [],
      layer: "model",
      needs: ["model"],
      description: name,
      references: [],
      status: "custom",
      custom: { file, scopes: [], expression: "" },
      check: () => [],
    },
    problem.reason,
  );
}

/** What makes two rules with one id the same rule: what they check and how severe it is. */
const sameness = (te: TeRule) =>
  JSON.stringify([[...te.scopes].sort(), te.expression, teSeverity(te.severity)]);

/**
 * Reads a project's custom rule files, `{ path, text }` each, in `customRules` order, as the CLI
 * and the site pass them: core reads no file. Each Tabular Editor rule becomes a `Rule` with
 * `status: "custom"`, evaluated only when its check runs. A rule the reader could not read, and
 * one that takes the id of pbiplint's PARSE_ISSUE or RULE_COULD_NOT_FINISH, becomes a rule that
 * cannot run, which the engine reports once with the reason. Ids are compared without regard to
 * case: a rule held alike by two files (or twice in one) runs once; for different rules with one
 * id the first runs and a notice names the other. A file the reader refuses whole throws a
 * `ConfigError` naming it, which stops the project's lint as a config that cannot be used does.
 */
export function readCustomRules(files: readonly { path: string; text: string }[]): CustomRuleSet {
  const set: CustomRuleSet = { files: [], rules: [], notices: [] };
  const first = new Map<string, { file: string; key: string }>();
  const notice = (path: string, message: string): Diagnostic => ({
    kind: "custom-rule-duplicate",
    path,
    message,
  });
  /** Adds the rule unless an earlier one holds its id, with a notice when the two differ. */
  const add = (rule: Rule, key: string, file: string): void => {
    const upper = rule.id.toUpperCase();
    const earlier = first.get(upper);
    if (earlier === undefined) {
      first.set(upper, { file, key });
      set.rules.push(rule);
    } else if (earlier.key !== key) {
      set.notices.push(
        notice(
          file,
          earlier.file === file
            ? `The custom rule ${rule.id} in ${file} is left out: a different rule earlier in the file has the same ID, and only the first runs. Give it its own ID, or remove one of the two.`
            : `The custom rule ${rule.id} in ${file} is left out: ${earlier.file}, earlier in customRules, holds a different rule with the same ID, and only the first runs. Give one of them its own ID.`,
        ),
      );
    }
  };

  for (const { path, text } of files) {
    const read = readTeRuleFile(text);
    if ("error" in read)
      throw new ConfigError(`pbiplint.config.json: customRules: ${path}: ${read.error}`);
    const ids: string[] = [];
    const list = (id: string) => {
      if (!ids.includes(id)) ids.push(id);
    };
    for (const te of read.rules) {
      list(te.id);
      const rule = customRule(te, path);
      const upper = te.id.toUpperCase();
      if (RESERVED.has(upper)) {
        const reason = `The ID ${upper} belongs to one of pbiplint's own rules, which report what pbiplint could not read or run, so a custom rule cannot use it. Give the rule an ID of its own.`;
        add(stoppedRule(rule, reason), JSON.stringify(["stopped", reason]), path);
      } else add(rule, sameness(te), path);
    }
    for (const problem of read.problems) {
      if (problem.kind === "duplicate") {
        set.notices.push(
          notice(path, `The custom rule ${problem.id} in ${path}: ${problem.reason}`),
        );
        continue;
      }
      // A rule with no id is known by its place in its file; another file's rule may share it.
      let id = problem.id;
      if (PLACEHOLDER.test(id) && first.has(id.toUpperCase())) id = `${id} in ${path}`;
      list(id);
      add(problemRule(problem, id, path), JSON.stringify(["stopped", problem.reason]), path);
    }
    set.files.push({ path, ids });
  }
  return set;
}
