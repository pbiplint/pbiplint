import { formatJson, formatMarkdown, VERSION, type LintResult } from "@pbiplint/core";
import { RULE_GUIDANCE } from "./rule-guidance.data.js";

export interface ExportFile {
  name: string;
  type: string;
  text: string;
}

/** The same reports the CLI writes with --format markdown and --format json. */
export const exportMarkdown = (result: LintResult): ExportFile => ({
  name: "pbiplint-report.md",
  type: "text/markdown",
  text: formatMarkdown(result, { toolVersion: VERSION }),
});

export const exportJson = (result: LintResult): ExportFile => ({
  name: "pbiplint-report.json",
  type: "application/json",
  text: formatJson(result, { toolVersion: VERSION }),
});

/**
 * What holds for every rule, for an assistant reading a run it did not make. The judgment items
 * follow the list in #180's skill; once the skill's source file is in the CLI package, the sync
 * script copies its marked block here instead, so the two cannot drift.
 */
export const ASSISTANT_PREAMBLE = `# For the AI assistant reading this

The person who sent you this linted a Power BI project with pbiplint on pbiplint.com, which ran in their browser. Below is its report, followed by pbiplint's guidance for each rule that has findings: how to fix it, and when to leave it alone.

- Work through the errors first, then the warnings. Info findings are suggestions, not a to-do list.
- Fix a report in Power BI Desktop. Fix a model in Desktop, or in its TMDL files, which are indented with tabs.
- In a file you suggest editing, keep the formatting and key order Power BI Desktop writes, and leave \`$schema\` alone. Desktop may overwrite files edited while it has the project open.
- Ask before ignoring, deleting, or renaming anything. A finding that matches its rule's When to ignore it is a question for the person, not a fix. Each When to ignore it ends with how to ignore the rule; suggest that, a config change, or deleting an object only once the person agrees, never just to clear a finding.
- Renaming a table, column, or measure reaches the report's files too. When the fixes are made, and after any rename, ask the person to lint the whole project again on pbiplint.com.
`;

/** Each fired rule's How to fix it and When to ignore it, in the report's order, with its page. */
function guidance(result: LintResult): string {
  const out = ["## How to fix these findings", ""];
  for (const { rule } of result.groups) {
    const g = RULE_GUIDANCE[rule.id];
    out.push(`### ${rule.name} (${rule.id})`, "");
    // A rule with no page text still gets its heading and its page, so no fired rule goes unnamed.
    if (g) out.push("**How to fix it**", "", g.fix, "");
    if (g?.ignore) out.push("**When to ignore it**", "", g.ignore, "");
    out.push(`Rule page: ${rule.url}`, "");
  }
  return out.join("\n");
}

/**
 * The Markdown report between a preamble for an AI assistant and each fired rule's guidance. The
 * rule's Example stays on its page: a report rule's Example is the report JSON a person does not
 * edit by hand, and it would double each rule's share of the paste.
 */
export const exportForAssistant = (result: LintResult): ExportFile => ({
  name: "pbiplint-report-for-ai.md",
  type: "text/markdown",
  text: [ASSISTANT_PREAMBLE, exportMarkdown(result).text.trimEnd(), "", guidance(result)].join(
    "\n",
  ),
});

/** Offers the text as a download through a same-origin blob URL. No request leaves the page. */
export function download(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoked late, not right after the click: Safari has cancelled downloads whose blob URL was
  // released before the navigation it started had a chance to begin.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copies the text with the async clipboard API. The write goes out in the caller's own turn rather
 * than from a later microtask, because a clipboard write is gesture gated and WebKit wants the
 * gesture still on the stack. Whatever the environment does about that, the caller sees one
 * failure path: a throw from reading the property and a throw from the call itself both come back
 * as a rejection, alongside the rejection a refused permission gives. An insecure context or an
 * older browser has no `navigator.clipboard` at all, which is the case the explicit throw covers.
 */
export function copy(file: ExportFile): Promise<void> {
  try {
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (!clipboard) throw new Error("Clipboard access is not available");
    return Promise.resolve(clipboard.writeText(file.text));
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}
