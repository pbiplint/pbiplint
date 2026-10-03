import {
  defaultRules,
  resolveConfig,
  SEVERITY_LABEL,
  slug,
  summarizeRule,
  type Rule,
  type RuleSummary,
} from "@pbiplint/core";
import { RULE_HELP } from "./rule-help.data.js";

/** A rule page's help sections, in Markdown, keyed as `--format json` names them. */
export interface ExplainSections {
  example?: string;
  whyItMatters?: string;
  howToFixIt?: string;
  whenToIgnoreIt?: string;
  quirks?: string;
}

export interface Explained {
  /** The fields lint's JSON gives a rule, at the rule's default severity, plus what it checks. */
  rule: RuleSummary & { description: string };
  sections: ExplainSections;
}

export interface NotFound {
  /** The nearest rule ids, nearest first, at most three; empty when none is near. */
  suggestions: string[];
}

const SECTION_KEYS: Readonly<Record<string, keyof ExplainSections>> = {
  Example: "example",
  "Why it matters": "whyItMatters",
  "How to fix it": "howToFixIt",
  "When to ignore it": "whenToIgnoreIt",
  Quirks: "quirks",
};

/**
 * A rule's help Markdown, as scripts/sync-rule-pages.mjs writes it, split at its `### ` headings,
 * with the closing "Read more" line dropped (the rule's url carries it). The rule pages hold no
 * `### ` line of their own, which the explain tests check for every rule.
 */
export function splitSections(markdown: string): ExplainSections {
  const out: ExplainSections = {};
  const body = markdown.replace(/\n*Read more: \S+\s*$/, "");
  for (const chunk of body.split(/^### /m).slice(1)) {
    const nl = chunk.indexOf("\n");
    const key = SECTION_KEYS[chunk.slice(0, nl)];
    if (key) out[key] = chunk.slice(nl + 1).trim();
  }
  return out;
}

/** Levenshtein distance, two rows at a time. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * The rule ids nearest a mistyped one, compared as slugs: those that contain it first, then those
 * within an edit distance of a quarter of its length (at least 2), nearest first, at most three.
 */
export function suggest(input: string): string[] {
  const s = slug(input);
  if (s === "") return [];
  const limit = Math.max(2, Math.floor(s.length / 4));
  return defaultRules
    .map((r) => {
      const id = slug(r.id);
      return { id: r.id, d: id.includes(s) ? 0 : distance(s, id) };
    })
    .filter((c) => c.d <= limit)
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id, "en"))
    .slice(0, 3)
    .map((c) => c.id);
}

/** The rule an id names, as a finding names it, in any case, or by its page name. */
export function findRule(input: string): Rule | undefined {
  const wanted = slug(input);
  return wanted === "" ? undefined : defaultRules.find((r) => slug(r.id) === wanted);
}

/** What stderr says for an id that names no rule: the id, the nearest ids, and where the list is. */
export function noRuleLines(input: string): string[] {
  const s = suggest(input);
  return [
    `pbiplint: no rule named "${input}"`,
    ...(s.length
      ? [`Did you mean ${s.length === 1 ? s[0] : `${s.slice(0, -1).join(", ")}, or ${s.at(-1)}`}?`]
      : []),
    "Run pbiplint rules for the list.",
  ];
}

/**
 * One rule's guidance, from the rule pages the CLI carries: its id as a finding names it, in any
 * case, or its page name. What `pbiplint explain` prints and the MCP server's explain_rule returns.
 */
export function explainRule(input: string): Explained | NotFound {
  const rule = findRule(input);
  const help = rule && RULE_HELP[rule.id];
  if (!rule || !help) return { suggestions: suggest(input) };
  return {
    rule: { ...summarizeRule(rule, resolveConfig({})), description: rule.description },
    sections: splitSections(help.markdown),
  };
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The text `pbiplint explain` prints: the rule's id, name, and page, then its help as plain text. */
export function explainText(e: Explained): string {
  const r = e.rule;
  const about = [
    capital(SEVERITY_LABEL[r.severity]),
    `${r.layer} layer`,
    r.category,
    ...(r.status === "needsLiveModel" ? ["needs a live model (listed, not run)"] : []),
  ].join(", ");
  const body = RULE_HELP[r.id]!.text.replace(/\n*Read more: \S+\s*$/, "");
  return `${r.id}  ${r.name}\n${about}\n${r.url}\n\n${r.description.replace(/`([^`]*)`/g, "$1")}\n\n${body}\n`;
}

/** The document `pbiplint explain --format json` prints. */
export function explainJson(e: Explained, toolVersion: string): string {
  const doc = {
    version: 1,
    tool: { name: "pbiplint", version: toolVersion },
    rule: e.rule,
    sections: e.sections,
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
