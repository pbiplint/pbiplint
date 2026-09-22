import { defaultRules, type Rule } from "@pbiplint/core";

/**
 * The rules the browser lints with: the default rules less every rule that needs the report. The
 * browser reads no report until pull request 7, so a report rule could only ever be skipped here,
 * and the skipped line would say "no report in the input" even when the drop held one. This keeps
 * a model drop reading as it did before the report rules landed, the browser's half of what
 * decision 15's SITE_LAYERS does for the site. Task 38 deletes this module when SITE_LAYERS flips
 * and the browser lints the default rules again.
 */
export const BROWSER_RULES: Rule[] = defaultRules.filter((r) => !r.needs.includes("report"));
