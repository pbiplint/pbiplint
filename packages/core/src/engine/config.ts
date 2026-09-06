import type { Severity } from "../rules/types.js";

export type SeverityName = "info" | "warning" | "error";

/** Shape of pbiplint.config.json. */
export interface PbiplintConfig {
  /** Per rule: "off" disables it; a severity name overrides its severity. */
  rules?: Record<string, "off" | SeverityName>;
  /** Lowest severity that makes the CLI exit nonzero. Default "error". */
  failOn?: SeverityName | "none";
}

export interface ResolvedConfig {
  disabled: Set<string>;
  severity: Map<string, Severity>;
  failOn: Severity | null;
}

export class ConfigError extends Error {}

export const SEVERITY_BY_NAME: Record<SeverityName, Severity> = { info: 1, warning: 2, error: 3 };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function isResolvedConfig(v: unknown): v is ResolvedConfig {
  return isRecord(v) && v.disabled instanceof Set && v.severity instanceof Map;
}

export function resolveConfig(raw: unknown = {}): ResolvedConfig {
  if (!isRecord(raw)) throw new ConfigError("pbiplint.config.json must be a JSON object");
  for (const k of Object.keys(raw))
    if (k !== "rules" && k !== "failOn")
      throw new ConfigError(`pbiplint.config.json: unknown key "${k}"`);
  const out: ResolvedConfig = { disabled: new Set(), severity: new Map(), failOn: 3 };
  if (raw.rules !== undefined) {
    if (!isRecord(raw.rules))
      throw new ConfigError(
        'pbiplint.config.json: "rules" must be an object of rule id to "off" | "info" | "warning" | "error"',
      );
    for (const [id, v] of Object.entries(raw.rules)) {
      if (v === "off") out.disabled.add(id);
      else if (v === "info" || v === "warning" || v === "error")
        out.severity.set(id, SEVERITY_BY_NAME[v]);
      else
        throw new ConfigError(
          `pbiplint.config.json: rules["${id}"] must be "off", "info", "warning", or "error"`,
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
