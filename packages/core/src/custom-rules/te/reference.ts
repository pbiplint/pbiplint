import { LIMITS, LIMIT_DESCRIPTIONS, type CustomRuleLimits } from "../limits.js";
import { teSeverity } from "../rules.js";
import { SEVERITY_LABEL } from "../../rules/types.js";
import {
  CONVERSION_REFUSED,
  NO_METHOD,
  READS_UNKNOWN,
  TE_CONVERSIONS,
  TE_EMPTY_VALUES,
} from "./evaluate.js";
import {
  LIBRARY,
  REGEX_OPTIONS,
  REGEX_OPTIONS_RUN,
  REGEX_OPTION_REFUSED,
  STATISTICS_REASON,
  isStatisticsAnnotation,
  type TeLibraryEntry,
} from "./library.js";
import { NAMED_LAMBDA_HINT, NAMED_LAMBDA_REASON, TE_LAMBDA_METHODS, TE_TYPES } from "./parser.js";
import { TE_NEAREST_SCOPES, TE_REPORT_SCOPES, TE_RULE_FIELDS, teScopeReason } from "./read.js";
import { REGEX_REFUSED, REGEX_RUNS } from "./regex.js";
import { TE_KEYWORDS, TE_LITERALS, TE_OPERATORS } from "./syntax.js";
import { TOKEN_MEMBERS, TOKEN_TYPES } from "./tokens.js";
import {
  PROPERTIES,
  SCOPE_TYPES,
  STATISTICS_PREFIX,
  TE_SCOPES,
  TOM_TYPES,
  UNKNOWN_PROPERTIES,
  unknownReason,
  type TeType,
} from "./view.js";

/** A parameter of a method or function: its name and type. */
export interface TeReferenceParam {
  name: string;
  type: string;
}

/** A method, static function, value property or static value; only the first two take `params`. */
export interface TeReferenceMember {
  /** The kind of value it is called on (`String`, `Collection`), or the type a static is written on. */
  on: string;
  name: string;
  params?: TeReferenceParam[];
  returns: string;
  description: string;
}

/** A property of a model object type, and a collection's own members (`ReferencedBy.AllMeasures`). */
export interface TeReferenceProperty {
  name: string;
  type: string;
  members?: { name: string; type: string }[];
}

/** What a rule cannot use, and the reason a rule that uses it gets. */
export interface TeReferenceNotRun {
  name: string;
  kind: "property" | "annotation" | "scope" | "syntax" | "option" | "field";
  /**
   * The reason, as the rule reports it: a rule that stops while it runs adds the object type
   * (`, on a Table`), and a syntax error adds its position (`at character 12`).
   */
  reason: string;
}

/**
 * Everything a Tabular Editor rule can use in pbiplint, and what it cannot, built at run time from
 * the evaluator's own tables (custom rules spec, section 9), so it cannot drift from what runs.
 * Plain data, safe to print as JSON.
 */
export interface TeReference {
  fields: { name: string; use: "read" | "ignored"; note: string }[];
  /**
   * How each `Severity` reads: a number, `"below 0"` or `"4 or more"` for the ranges at either
   * end, and `null` for a rule with none.
   */
  severities: {
    written: number | "below 0" | "4 or more" | null;
    severity: "info" | "warning" | "error";
  }[];
  scopes: { name: string; types: string[] }[];
  types: { name: string; scopes: string[]; properties: TeReferenceProperty[] }[];
  methods: TeReferenceMember[];
  valueProperties: TeReferenceMember[];
  statics: TeReferenceMember[];
  staticValues: TeReferenceMember[];
  conversions: { type: string; spellings: string[] }[];
  /** `runs`, when given, lists the only values pbiplint runs; any other stops the rule. */
  enums: { name: string; values: string[]; runs?: string[]; description: string }[];
  syntax: {
    operators: { op: string; spellings: string[]; precedence: number; meaning: string }[];
    keywords: { name: string; meaning: string }[];
    /** How each kind of value is written, with an example and the type it gives. */
    literals: { written: string; type: string; meaning: string }[];
    /** What an empty (null) value does. */
    emptyValues: string;
  };
  tokens: {
    members: { name: string; type: string; description: string }[];
    types: string[];
  };
  regex: {
    runs: { construct: string; example: string; matches: string; doesNotMatch: string }[];
    refused: { construct: string; example: string; reason: string }[];
  };
  notRun: TeReferenceNotRun[];
  limits: { name: string; value: number; description: string }[];
}

/**
 * A view type as the reference prints it: `String`, `Boolean`, `Int32`, `Int64`, `Double`,
 * `Decimal`, an enum's name, object types joined by ` | ` (`Object` for any), `Collection<...>`,
 * `Indexer<...>` for a lookup by name, and `?` after a type that may be null.
 */
export function typeLabel(t: TeType): string {
  switch (t.kind) {
    case "string":
      return "String";
    case "boolean":
      return "Boolean";
    case "int":
      return "Int32";
    case "long":
      return "Int64";
    case "double":
      return "Double";
    case "decimal":
      return "Decimal";
    case "enum":
      return t.name;
    case "object":
      return t.of === "any" ? "Object" : t.of.join(" | ");
    case "collection":
      return `Collection<${typeLabel(t.of)}>`;
    case "map":
      return `Indexer<${typeLabel(t.value)}>`;
    case "nullable": {
      const of = typeLabel(t.of);
      return of.includes(" | ") ? `(${of})?` : `${of}?`;
    }
  }
}

const member = (on: string, e: TeLibraryEntry): TeReferenceMember => ({
  on,
  name: e.name,
  params: e.params.map((p) => ({ name: p.name, type: p.type })),
  returns: e.returns,
  description: e.description,
});

const valueOf = (
  on: string,
  name: string,
  v: { returns: string; description: string },
): TeReferenceMember => ({ on, name, returns: v.returns, description: v.description });

function properties(type: (typeof TOM_TYPES)[number]): TeReferenceProperty[] {
  return Object.entries(PROPERTIES[type]).map(([name, spec]) => {
    const of = spec.type.kind === "nullable" ? spec.type.of : spec.type;
    const members = of.kind === "collection" ? of.members : undefined;
    return {
      name,
      type: typeLabel(spec.type),
      ...(members
        ? {
            members: Object.entries(members).map(([m, x]) => ({
              name: m,
              type: typeLabel(x.type),
            })),
          }
        : {}),
    };
  });
}

function notRun(): TeReferenceNotRun[] {
  const out: TeReferenceNotRun[] = [];
  for (const name of Object.keys(UNKNOWN_PROPERTIES)) {
    const kind = isStatisticsAnnotation(name) ? "annotation" : "property";
    out.push({ name, kind, reason: READS_UNKNOWN(name, unknownReason(name)!) });
  }
  const prefix = `${STATISTICS_PREFIX}*`;
  out.push({ name: prefix, kind: "annotation", reason: READS_UNKNOWN(prefix, STATISTICS_REASON) });
  for (const name of [...TE_REPORT_SCOPES, ...Object.keys(TE_NEAREST_SCOPES)])
    out.push({ name, kind: "scope", reason: teScopeReason(name)! });
  out.push({
    name: "x => ...",
    kind: "syntax",
    reason: `${NAMED_LAMBDA_REASON}; ${NAMED_LAMBDA_HINT}`,
  });
  // A type that is not a value (a static class such as `Math`, or an enum such as
  // `StringComparison`) is left out: converting to one is not something a rule would try.
  const notValues = new Set(
    [
      ...Object.keys(LIBRARY.statics).filter((on) => !Object.hasOwn(LIBRARY.methods, on)),
      ...Object.keys(LIBRARY.enums),
    ].map((n) => n.toLowerCase()),
  );
  for (const t of TE_TYPES)
    if (!TE_CONVERSIONS.some((c) => c.type === t.name) && !notValues.has(t.name.toLowerCase()))
      out.push({
        name: `${t.name}(...)`,
        kind: "syntax",
        reason: CONVERSION_REFUSED(t.name, t.name),
      });
  const methods = new Set(
    Object.values(LIBRARY.methods)
      .flat()
      .map((m) => m.name.toLowerCase()),
  );
  for (const m of TE_LAMBDA_METHODS)
    if (!methods.has(m.toLowerCase()))
      out.push({ name: `.${m}(...)`, kind: "syntax", reason: NO_METHOD("collection", m) });
  for (const v of REGEX_OPTIONS.values)
    if (!REGEX_OPTIONS_RUN.includes(v))
      out.push({ name: `RegexOptions.${v}`, kind: "option", reason: REGEX_OPTION_REFUSED(v) });
  for (const f of TE_RULE_FIELDS)
    if (f.use === "ignored") out.push({ name: f.name, kind: "field", reason: f.note });
  return out;
}

/**
 * What a Tabular Editor rule can use at this version of pbiplint, and what it cannot with the
 * reason, from the tables the reader, parser, evaluator and matcher run on. A new object each call.
 */
export function teReference(): TeReference {
  return {
    fields: TE_RULE_FIELDS.map((f) => ({ name: f.name, use: f.use, note: f.note })),
    severities: [
      { written: "below 0" as const, severity: SEVERITY_LABEL[teSeverity(-1)] },
      ...[0, 1, 2, 3].map((n) => ({ written: n, severity: SEVERITY_LABEL[teSeverity(n)] })),
      { written: "4 or more" as const, severity: SEVERITY_LABEL[teSeverity(4)] },
      { written: null, severity: SEVERITY_LABEL[teSeverity(undefined)] },
    ],
    scopes: TE_SCOPES.map((name) => ({ name, types: [...SCOPE_TYPES[name]] })),
    types: TOM_TYPES.map((name) => ({
      name,
      scopes: TE_SCOPES.filter((s) => SCOPE_TYPES[s].includes(name)),
      properties: properties(name),
    })),
    methods: Object.entries(LIBRARY.methods).flatMap(([on, list]) =>
      list.map((e) => member(on, e)),
    ),
    valueProperties: Object.entries(LIBRARY.properties).flatMap(([on, props]) =>
      Object.entries(props).map(([name, v]) => valueOf(on, name, v)),
    ),
    statics: Object.entries(LIBRARY.statics).flatMap(([on, list]) =>
      list.map((e) => member(on, e)),
    ),
    staticValues: Object.entries(LIBRARY.staticValues).flatMap(([on, values]) =>
      Object.entries(values).map(([name, v]) => valueOf(on, name, v)),
    ),
    conversions: TE_CONVERSIONS.map((c) => ({ type: c.type, spellings: [...c.spellings] })),
    enums: Object.entries(LIBRARY.enums).map(([name, e]) => ({
      name,
      values: [...e.type.values],
      ...(name === REGEX_OPTIONS.name ? { runs: [...REGEX_OPTIONS_RUN] } : {}),
      description: e.description,
    })),
    syntax: {
      operators: TE_OPERATORS.map((o) => ({
        op: o.op,
        spellings: [...o.spellings],
        precedence: o.precedence,
        meaning: o.meaning,
      })),
      keywords: TE_KEYWORDS.map((k) => ({ name: k.name, meaning: k.meaning })),
      literals: TE_LITERALS.map((l) => ({ written: l.written, type: l.type, meaning: l.meaning })),
      emptyValues: TE_EMPTY_VALUES,
    },
    tokens: {
      members: TOKEN_MEMBERS.map((m) => ({
        name: m.name,
        type: m.type,
        description: m.description,
      })),
      types: [...TOKEN_TYPES],
    },
    regex: {
      runs: REGEX_RUNS.map((r) => ({ ...r })),
      refused: Object.values(REGEX_REFUSED).map((r) => ({ ...r })),
    },
    notRun: notRun(),
    limits: (Object.keys(LIMITS) as (keyof CustomRuleLimits)[]).map((name) => ({
      name,
      value: LIMITS[name],
      description: LIMIT_DESCRIPTIONS[name],
    })),
  };
}
