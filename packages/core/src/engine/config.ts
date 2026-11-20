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
  /** Tabular Editor rule files to run as rules, as paths relative to the folder this file is in. */
  customRules?: string[];
}

/** Every top-level key pbiplint.config.json may hold; the JSON Schema lists the same. */
export const CONFIG_KEYS = ["$schema", "rules", "failOn", "customRules"] as const;

export interface ResolvedConfig {
  disabled: Set<string>;
  severity: Map<string, Severity>;
  /** Options per rule id as written, validated against the rule's declaration by bindConfig. */
  options: Map<string, Record<string, unknown>>;
  failOn: Severity | null;
  /** The config's customRules entries as written and in order; empty when the key is absent. */
  customRules: string[];
}

// A mark shared by every copy of the class, as CustomRuleStop's is.
const CONFIG_ERROR = Symbol.for("pbiplint.ConfigError");

/**
 * A config that cannot be used: the wrong shape, an unknown key, or an option the rule does not
 * declare. Its message names the file and the key at fault, and is written to be shown to the
 * user as it stands, as the CLI and the site do. Callers know one by `isConfigError`, not by
 * `instanceof`: the custom rules entry is its own bundle on the site, with its own copy of this class.
 */
export class ConfigError extends Error {
  // On the prototype, so the mark is no own field of an error and two with one message stay equal.
  get [CONFIG_ERROR](): true {
    return true;
  }
}

/** Whether `e` is a ConfigError from any copy of the core, known by its mark rather than its class. */
export const isConfigError = (e: unknown): e is ConfigError =>
  typeof e === "object" &&
  e !== null &&
  (e as Record<symbol, unknown>)[CONFIG_ERROR] === true &&
  typeof (e as { message?: unknown }).message === "string";

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
  const ruleByUpper = new Map(rules.map((r) => [r.id.toUpperCase(), r]));
  const bound: ResolvedConfig = {
    disabled: new Set(),
    severity: new Map(),
    options: new Map(),
    failOn: config.failOn,
    customRules: config.customRules,
  };
  const unknownRules: string[] = [];
  for (const id of config.disabled) {
    const real = ruleByUpper.get(id.toUpperCase())?.id;
    if (real === undefined) unknownRules.push(id);
    else bound.disabled.add(real);
  }
  for (const [id, severity] of config.severity) {
    const real = ruleByUpper.get(id.toUpperCase())?.id;
    if (real === undefined) unknownRules.push(id);
    else bound.severity.set(real, severity);
  }
  for (const [id, options] of config.options) {
    const rule = ruleByUpper.get(id.toUpperCase());
    if (rule === undefined) {
      unknownRules.push(id);
      continue;
    }
    const real = rule.id;
    // An object with no options names the rule, which is why it is here, and changes nothing.
    if (Object.keys(options).length === 0) continue;
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
      // A values list is a string option's alphabet; on a number option it could never match, so
      // it is not a gate a number has to pass.
      if (decl.type === "string" && decl.values && !decl.values.includes(value as string))
        throw new ConfigError(
          `pbiplint.config.json: rules["${real}"].${name} must be one of ${decl.values.join(", ")}`,
        );
    }
    // A copy, so a caller that changes its own object later does not change the run's options.
    bound.options.set(real, { ...options });
  }
  // One id that carries a severity and options reaches the list twice; it is named once.
  return { config: bound, unknownRules: [...new Set(unknownRules)] };
}

export const SEVERITY_BY_NAME: Record<SeverityName, Severity> = { info: 1, warning: 2, error: 3 };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Whether `v` is already a ResolvedConfig rather than a config file's raw JSON, so `lint` takes either. */
export function isResolvedConfig(v: unknown): v is ResolvedConfig {
  return (
    isRecord(v) &&
    v.disabled instanceof Set &&
    v.severity instanceof Map &&
    v.options instanceof Map
  );
}

/**
 * Check a parsed pbiplint.config.json and turn it into a ResolvedConfig, throwing a ConfigError at
 * the first thing wrong with it. With nothing given, every rule is on at its own severity and
 * `failOn` is `error`. Rule ids are kept as written and options are not checked against any rule
 * yet; `bindConfig` does both once the rules are known.
 */
export function resolveConfig(raw: unknown = {}): ResolvedConfig {
  if (!isRecord(raw)) throw new ConfigError("pbiplint.config.json must be a JSON object");
  for (const k of Object.keys(raw))
    if (!(CONFIG_KEYS as readonly string[]).includes(k))
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
    customRules: [],
  };
  if (raw.rules !== undefined) {
    if (!isRecord(raw.rules))
      throw new ConfigError(
        'pbiplint.config.json: "rules" must be an object of rule id to "off", "info", "warning", "error", or an object with a severity and options',
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
        // Kept even when empty, so bindConfig checks the id as it checks every other.
        out.options.set(id, options);
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
  if (raw.customRules !== undefined) out.customRules = readCustomRulePaths(raw.customRules);
  return out;
}

const PATHS_ONLY =
  "customRules takes paths to local files, relative to the folder pbiplint.config.json is in";

/**
 * Check customRules: a list of relative paths. The site and the pipelines resolve each entry
 * against the config's own folder, so a URL or an absolute path could only work on one machine;
 * it is refused here with the entry's index rather than failing later as a missing file.
 */
function readCustomRulePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
    throw new ConfigError(
      'pbiplint.config.json: "customRules" must be a list of paths to rule files',
    );
  const paths = value as string[];
  paths.forEach((path, i) => {
    const problem =
      path.trim() === ""
        ? "is empty"
        : path.includes("://")
          ? "is a URL"
          : // A leading slash or backslash (a root, or a \\server share), or a drive letter.
            /^[\\/]|^[A-Za-z]:/.test(path)
            ? "is an absolute path"
            : undefined;
    if (problem)
      throw new ConfigError(`pbiplint.config.json: customRules[${i}] ${problem}; ${PATHS_ONLY}`);
  });
  // A copy, so a caller that changes its own list later does not change the run's.
  return [...paths];
}
