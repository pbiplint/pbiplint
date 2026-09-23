import { defaultRules, type ResolvedConfig, type Rule } from "@pbiplint/core";

/**
 * The rules the browser lints with: the default rules less every rule that needs the report. The
 * browser reads no report until pull request 7, so a report rule could only ever be skipped here,
 * and the skipped line would say "no report in the input" even when the drop held one. This keeps
 * a model drop reading as it did before the report rules landed, the browser's half of what
 * decision 15's SITE_LAYERS does for the site. `browserConfig` below goes with it. Task 37, where
 * the browser starts reading reports, deletes this module and lints the default rules again.
 */
export const BROWSER_RULES: Rule[] = defaultRules.filter((r) => !r.needs.includes("report"));

/** The ids of the default rules the browser leaves out, upper-cased as bindConfig matches them. */
const LEFT_OUT = new Set(
  defaultRules.filter((r) => !BROWSER_RULES.includes(r)).map((r) => r.id.toUpperCase()),
);

/**
 * The config less its entries for a default rule the browser leaves out, matched without regard to
 * case as bindConfig matches. A config written for the CLI can name a report rule, and bound
 * against BROWSER_RULES that entry would be reported as naming no rule, which is false. Dropped
 * here, it raises no notice and its options go unchecked, since the browser never runs the rule.
 * An id no default rule has still reaches bindConfig and is named as unknown.
 */
export function browserConfig(config: ResolvedConfig): ResolvedConfig {
  const kept = (id: string): boolean => !LEFT_OUT.has(id.toUpperCase());
  return {
    disabled: new Set([...config.disabled].filter(kept)),
    severity: new Map([...config.severity].filter(([id]) => kept(id))),
    options: new Map([...config.options].filter(([id]) => kept(id))),
    failOn: config.failOn,
  };
}
