import type { Rule, Severity } from "../rules/types.js";

export type SeverityName = "info" | "warning" | "error";

/** A rule's value as an object: an optional severity plus the options the rule declares. */
export interface RuleConfigObject {
  severity?: SeverityName;
  [option: string]: unknown;
}

/** Shape of pbiplint.config.json. */
export interface PbiplintConfig {
  /** Optional JSON Schema URL, so an editor can validate and complete the file. Read by nothing else. */
  $schema?: string;
  /** Per rule: "off" disables it; a severity name overrides its severity; an object may carry both a severity and the rule's options. */
  rules?: Record<string, "off" | SeverityName | RuleConfigObject>;
  /** Lowest severity that makes the CLI exit nonzero. Default "error". */
  failOn?: SeverityName | "none";
}

export interface ResolvedConfig {
  disabled: Set<string>;
  severity: Map<string, Severity>;
  /** Options per rule id as written, validated against the rule's declaration by bindConfig. */
  options: Map<string, Record<string, unknown>>;
  failOn: Severity | null;
}

export class ConfigError extends Error {}

export interface BoundConfig {
  /** The same settings keyed by the rules' own ids. */
  config: ResolvedConfig;
  /** Ids from the config that match no rule, as written. */
  unknownRules: string[];
}

/**
 * Map the config's rule ids onto `rules` without regard to case, so `hide_foreign_keys` reaches
 * HIDE_FOREIGN_KEYS, and list the ids that reach nothing so a typo never disables a rule silently.
 * Options are checked against the rule's own declaration here, where the rules are in hand.
 */
export function bindConfig(config: ResolvedConfig, rules: Rule[]): BoundConfig {
  const idByUpper = new Map(rules.map((r) => [r.id.toUpperCase(), r.id]));
  const bound: ResolvedConfig = {
    disabled: new Set(),
    severity: new Map(),
    options: new Map(),
    failOn: config.failOn,
  };
  const unknownRules: string[] = [];
  for (const id of config.disabled) {
    const real = idByUpper.get(id.toUpperCase());
    if (real === undefined) unknownRules.push(id);
    else bound.disabled.add(real);
  }
  for (const [id, severity] of config.severity) {
    const real = idByUpper.get(id.toUpperCase());
    if (real === undefined) unknownRules.push(id);
    else bound.severity.set(real, severity);
  }
  for (const [id, options] of config.options) {
    const real = idByUpper.get(id.toUpperCase());
    if (real === undefined) {
      unknownRules.push(id);
      continue;
    }
    const rule = rules.find((r) => r.id === real)!;
    const declared = rule.options ?? [];
    if (declared.length === 0)
      throw new ConfigError(`pbiplint.config.json: rules["${real}"] takes no options`);
    for (const [name, value] of Object.entries(options)) {
      const decl = declared.find((o) => o.name === name);
      if (!decl)
        throw new ConfigError(
          `pbiplint.config.json: rules["${real}"] has no option "${name}" (options: ${declared.map((o) => o.name).join(", ")})`,
        );
      if (typeof value !== decl.type)
        throw new ConfigError(
          `pbiplint.config.json: rules["${real}"].${name} must be a ${decl.type}`,
        );
      if (decl.values && !decl.values.includes(value as string))
        throw new ConfigError(
          `pbiplint.config.json: rules["${real}"].${name} must be one of ${decl.values.join(", ")}`,
        );
    }
    bound.options.set(real, options);
  }
  return { config: bound, unknownRules };
}

export const SEVERITY_BY_NAME: Record<SeverityName, Severity> = { info: 1, warning: 2, error: 3 };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function isResolvedConfig(v: unknown): v is ResolvedConfig {
  return (
    isRecord(v) &&
    v.disabled instanceof Set &&
    v.severity instanceof Map &&
    v.options instanceof Map
  );
}

export function resolveConfig(raw: unknown = {}): ResolvedConfig {
  if (!isRecord(raw)) throw new ConfigError("pbiplint.config.json must be a JSON object");
  for (const k of Object.keys(raw))
    if (k !== "rules" && k !== "failOn" && k !== "$schema")
      throw new ConfigError(`pbiplint.config.json: unknown key "${k}"`);
  // Nothing here reads $schema, but a number or an object in it means the file was written by
  // hand and misunderstood, and every other key says so rather than passing it over in silence.
  if (raw.$schema !== undefined && typeof raw.$schema !== "string")
    throw new ConfigError('pbiplint.config.json: "$schema" must be a string');
  const out: ResolvedConfig = {
    disabled: new Set(),
    severity: new Map(),
    options: new Map(),
    failOn: 3,
  };
  if (raw.rules !== undefined) {
    if (!isRecord(raw.rules))
      throw new ConfigError(
        'pbiplint.config.json: "rules" must be an object of rule id to "off" | "info" | "warning" | "error"',
      );
    for (const [id, v] of Object.entries(raw.rules)) {
      if (v === "off") out.disabled.add(id);
      else if (v === "info" || v === "warning" || v === "error")
        out.severity.set(id, SEVERITY_BY_NAME[v]);
      else if (isRecord(v)) {
        const { severity, ...options } = v;
        if (severity !== undefined) {
          if (severity !== "info" && severity !== "warning" && severity !== "error")
            throw new ConfigError(
              `pbiplint.config.json: rules["${id}"].severity must be "info", "warning", or "error"`,
            );
          out.severity.set(id, SEVERITY_BY_NAME[severity]);
        }
        if (Object.keys(options).length > 0) out.options.set(id, options);
      } else
        throw new ConfigError(
          `pbiplint.config.json: rules["${id}"] must be "off", "info", "warning", "error", or an object with a severity and options`,
        );
    }
  }
  if (raw.failOn !== undefined) {
    if (raw.failOn === "none") out.failOn = null;
    else if (raw.failOn === "info" || raw.failOn === "warning" || raw.failOn === "error")
      out.failOn = SEVERITY_BY_NAME[raw.failOn];
    else
      throw new ConfigError(
        'pbiplint.config.json: "failOn" must be "info", "warning", "error", or "none"',
      );
  }
  return out;
}
