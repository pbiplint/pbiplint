import { parseJsonc } from "../jsonc.js";
import { LIMITS } from "../limits.js";

/** One Tabular Editor rule as pbiplint read it from a rule file. */
export interface TeRule {
  id: string;
  /** The rule's `Name`, or its id when it has none. */
  name: string;
  description?: string;
  category?: string;
  /** The rule's `Severity` as written; what each number means is the engine's call. */
  severity?: number;
  /** Tabular Editor's scope names, spelled as Tabular Editor spells them, each once. */
  scopes: string[];
  expression: string;
  /**
   * The rule's `IsDisabled` as read. Tabular Editor CLI runs a rule marked disabled (pull request A
   * captures), so the engine runs it too; this is kept only so a page or message can mention it.
   */
  disabled: boolean;
}

/** A rule pbiplint could not read, with a reason written for whoever fixes the file. */
export interface TeRuleProblem {
  /** The rule's id, or `(rule N)` for the Nth entry when it has none. */
  id: string;
  name?: string;
  reason: string;
  /**
   * `duplicate`: a later rule in the file with an earlier rule's id and different text. The first
   * rule runs, so this one is a notice rather than a rule that cannot run.
   */
  kind?: "duplicate";
}

/** A rule file read: refused whole with a reason, or its rules and the rules it could not read. */
export type TeRuleFile = { error: string } | { rules: TeRule[]; problems: TeRuleProblem[] };

/** The scope names Tabular Editor CLI 0.8.1.1 accepts (pull request A captures). */
const SCOPES = [
  "Model",
  "Table",
  "CalculatedTable",
  "Column",
  "DataColumn",
  "CalculatedColumn",
  "CalculatedTableColumn",
  "Measure",
  "Hierarchy",
  "Level",
  "Partition",
  "Relationship",
  "Perspective",
  "Culture",
  "ModelRole",
  "ModelRoleMember",
  "TablePermission",
  "CalculationGroup",
  "CalculationItem",
  "KPI",
  "NamedExpression",
  "ProviderDataSource",
  "StructuredDataSource",
  "Variation",
  "Calendar",
  "UserDefinedFunction",
];
const SCOPE_BY_LOWER = new Map(SCOPES.map((s) => [s.toLowerCase(), s]));

/** Report object scopes: a rule file in Tabular Editor's shape sometimes uses them. */
export const TE_REPORT_SCOPES: readonly string[] = [
  "Page",
  "Visual",
  "CustomVisual",
  "Filter",
  "Report",
];
const REPORT_SCOPES = new Set(TE_REPORT_SCOPES.map((s) => s.toLowerCase()));

/** Names Tabular Editor refuses that have a scope it accepts for the same objects. */
export const TE_NEAREST_SCOPES: Readonly<Record<string, string>> = {
  CalculationGroupTable: "CalculationGroup",
  Function: "UserDefinedFunction",
  Role: "ModelRole",
  DataSource: "ProviderDataSource",
  Expression: "NamedExpression",
};
const NEAREST_SCOPE = new Map(
  Object.entries(TE_NEAREST_SCOPES).map(([name, near]) => [name.toLowerCase(), near]),
);

/** A field of a Tabular Editor rule: read, or ignored, with what pbiplint does with it. */
export interface TeRuleField {
  name: string;
  use: "read" | "ignored";
  note: string;
}

/**
 * The fields of a rule, as Tabular Editor names them, and what the reader does with each; keys
 * match in any case. The reader looks each read field up by its name here.
 */
const RULE_FIELD_USE = {
  ID: "read",
  Name: "read",
  Category: "read",
  Description: "read",
  Severity: "read",
  Scope: "read",
  Expression: "read",
  IsDisabled: "read",
  FixExpression: "ignored",
  CompatibilityLevel: "ignored",
} as const satisfies Record<string, TeRuleField["use"]>;
type FieldName = keyof typeof RULE_FIELD_USE;

const RULE_FIELD_NOTES: Record<FieldName, string> = {
  ID: "Required. Text, or a whole number read as its digits; it names the rule in every finding, so no two rules may share one.",
  Name: "A short title for the rule; the ID stands in when there is none.",
  Category: "Groups the rule in the output; Custom when there is none.",
  Description:
    "What everyone who meets a finding reads: what the rule checks, why, and how to fix it.",
  Severity: "A number, or digits in a string; see the severities below. 1 when there is none.",
  Scope:
    "Required. A comma-separated list of the scopes below; the rule runs on each object of each one.",
  Expression: "Required. The condition, as text; an object it is true for is a finding.",
  IsDisabled:
    "Read, but the rule still runs, as Tabular Editor CLI runs it; turn a rule off in pbiplint.config.json instead.",
  FixExpression: "pbiplint reports findings and never changes the model, so a fix is not run.",
  CompatibilityLevel: "pbiplint runs the rule whatever the model's compatibility level.",
};

/** The fields of a rule, each read or ignored, with a note for the reference. */
export const TE_RULE_FIELDS: readonly TeRuleField[] = /* @__PURE__ */ (
  Object.keys(RULE_FIELD_USE) as FieldName[]
).map((name) => ({ name, use: RULE_FIELD_USE[name], note: RULE_FIELD_NOTES[name] }));

/** A field's key, lowercased, as `lowerKeys` gives it. */
const key = (name: FieldName): string => name.toLowerCase();

const count = (n: number) => n.toLocaleString("en-US");
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A rule's keys lowercased, as Json.NET matches them; for a key written twice, the first wins. */
function lowerKeys(entry: Record<string, unknown>): Map<string, unknown> {
  const keys = new Map<string, unknown>();
  for (const [k, v] of Object.entries(entry)) {
    const lower = k.toLowerCase();
    if (!keys.has(lower)) keys.set(lower, v);
  }
  return keys;
}

/** The entry's keys and values in a stable order, to tell an identical rule from a different one. */
function canonical(keys: Map<string, unknown>): string {
  return JSON.stringify([...keys].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function readId(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function readSeverity(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\s*-?\d+\s*$/.test(v)) return Number(v);
  return undefined;
}

/** The rule's scopes, or the reason they cannot be used. */
function readScopes(v: unknown): { scopes: string[] } | { reason: string } {
  const names =
    typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "")
      : [];
  if (names.length === 0) {
    return {
      reason:
        "The rule has no Scope, so it would check nothing (Tabular Editor runs such a rule on no objects). Give it a Scope such as Measure, Column, or Table.",
    };
  }
  const report = names.filter((n) => REPORT_SCOPES.has(n.toLowerCase()));
  if (report.length > 0) {
    return {
      reason: `The rule's Scope names a report object (${report.join(", ")}). Tabular Editor's rules check the semantic model; report rules use fab-inspector's format.`,
    };
  }
  const scopes: string[] = [];
  const unknown: string[] = [];
  for (const n of names) {
    const known = SCOPE_BY_LOWER.get(n.toLowerCase());
    if (known === undefined) unknown.push(n);
    else if (!scopes.includes(known)) scopes.push(known);
  }
  if (unknown.length > 0) {
    const hints = unknown
      .map((n) => [n, NEAREST_SCOPE.get(n.toLowerCase())] as const)
      .filter(([, near]) => near !== undefined)
      .map(([n, near]) => ` For ${n}, use ${near}.`)
      .join("");
    const list = unknown.join(", ");
    return {
      reason: `The rule's Scope names ${unknown.length === 1 ? "a scope" : "scopes"} Tabular Editor does not define: ${list}.${hints} Scope is a comma-separated list of names such as Model, Table, Column, Measure, Partition, or Relationship.`,
    };
  }
  return { scopes };
}

/** Why a rule with this `Scope` text is not run (a problem of the file), or undefined when it reads. */
export function teScopeReason(scope: string): string | undefined {
  const read = readScopes(scope);
  return "reason" in read ? read.reason : undefined;
}

/**
 * Reads a Tabular Editor rule file the way Tabular Editor CLI 0.8.1.1 does (pull request A
 * captures): a JSON array of rules or an object with a `rules` array, keys in any case, a numeric
 * `ID` read as its decimal string, a byte order mark and comments allowed. Where Tabular Editor
 * refuses a whole file for one bad scope, or silently runs a rule with no scope on nothing, pbiplint
 * reports that rule and reads the rest. A file in fab-inspector's shape, or one mixing both shapes,
 * is refused. Reasons name the rule by its id and name and never quote its expression.
 */
export function readTeRuleFile(text: string): TeRuleFile {
  const parsed = parseJsonc(text);
  if ("error" in parsed) return parsed;
  const root = parsed.value;
  let entries: unknown[] | undefined;
  if (Array.isArray(root)) entries = root;
  else if (isObject(root)) {
    const wrapped = lowerKeys(root).get("rules");
    if (Array.isArray(wrapped)) entries = wrapped;
  }
  if (entries === undefined) {
    return {
      error:
        'The file is not a rule file: pbiplint reads a JSON array of rules, or an object with a "rules" array.',
    };
  }

  const keyed = entries.map((e) => (isObject(e) ? lowerKeys(e) : undefined));
  let te = 0,
    fab = 0;
  for (const keys of keyed) {
    if (keys === undefined) continue;
    if (keys.has(key("Expression"))) te++;
    if (keys.has("part") && keys.has("test")) fab++;
  }
  if (fab > 0 && te > 0) {
    return {
      error:
        "The file mixes Tabular Editor's rules (with Expression) and fab-inspector's rules (with part and test). Put each format in its own file.",
    };
  }
  if (fab > 0) {
    return {
      error:
        "The file holds fab-inspector rules (with part and test); report rules in fab-inspector's format come in a later release of pbiplint.",
    };
  }

  const rules: TeRule[] = [];
  const problems: TeRuleProblem[] = [];
  // The first entry with each id, as a canonical string, to tell repeats from differing rules.
  const firstById = new Map<string, string>();

  keyed.forEach((keys, index) => {
    const place = `(rule ${index + 1})`;
    if (keys === undefined) {
      problems.push({ id: place, reason: "This entry is not a rule: each rule is a JSON object." });
      return;
    }
    const rawName = keys.get(key("Name"));
    const givenName = typeof rawName === "string" && rawName !== "" ? rawName : undefined;
    const id = readId(keys.get(key("ID")));
    const problem = (reason: string, kind?: "duplicate") =>
      problems.push({
        id: id ?? place,
        ...(givenName === undefined ? {} : { name: givenName }),
        reason,
        ...(kind === undefined ? {} : { kind }),
      });

    if (index >= LIMITS.rulesPerFile) {
      problem(
        `The file has more than ${count(LIMITS.rulesPerFile)} rules, the most pbiplint reads from one file, and this rule comes after that. Split the file in two.`,
      );
      return;
    }
    if (id === undefined) {
      problem(
        "The rule has no ID. Give it an ID, such as TEAM_MEASURE_FORMAT, that no other rule uses.",
      );
      return;
    }

    const canon = canonical(keys);
    const first = firstById.get(id);
    if (first !== undefined) {
      if (first !== canon) {
        problem(
          "Another rule earlier in this file has the same ID, and only the first rule with this ID runs. Give this rule its own ID, or remove one of the two.",
          "duplicate",
        );
      }
      return;
    }
    firstById.set(id, canon);

    const scopes = readScopes(keys.get(key("Scope")));
    if ("reason" in scopes) {
      problem(scopes.reason);
      return;
    }
    const expression = keys.get(key("Expression"));
    if (expression === undefined || (typeof expression === "string" && expression.trim() === "")) {
      problem(
        "The rule has no Expression, so there is nothing to check. Add the condition an object fails on.",
      );
      return;
    }
    if (typeof expression !== "string") {
      problem("The rule's Expression is not text. Write it as a JSON string.");
      return;
    }
    if (expression.length > LIMITS.expressionChars) {
      problem(
        `The rule's Expression is longer than ${count(LIMITS.expressionChars)} characters, the most pbiplint reads for one rule. Split it into smaller rules.`,
      );
      return;
    }

    const description = keys.get(key("Description"));
    const category = keys.get(key("Category"));
    const severity = readSeverity(keys.get(key("Severity")));
    rules.push({
      id,
      name: givenName ?? (typeof rawName === "number" ? String(rawName) : id),
      ...(typeof description === "string" ? { description } : {}),
      ...(typeof category === "string" ? { category } : {}),
      ...(severity === undefined ? {} : { severity }),
      scopes: scopes.scopes,
      expression,
      disabled: keys.get(key("IsDisabled")) === true,
    });
  });

  return { rules, problems };
}
