import type { Page } from "../../pbir/types.js";
import { reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

/**
 * The names English Power BI Desktop gives a new or duplicated page (a duplicate of a duplicate
 * nests), and a name marked as a copy, each with what the finding says of it. Desktop numbers new
 * pages from 1 without leading zeros, so `Page 0` and `Page 01` are not its names. The detail names
 * the pattern, never who typed the name, which pbiplint cannot read.
 */
const DEFAULT_NAMES: [RegExp, string][] = [
  [/^Page [1-9]\d*$/, "is the name Power BI Desktop gives a new page"],
  [/^Duplicate of .+$/, "is the name Power BI Desktop gives a duplicated page"],
  [/^.+ \(copy\)$/, "is named as a copy"],
];

/**
 * The display name the page's own page.json records. A stub page, whose page.json is missing or
 * unreadable, and a page.json without one both fall back to the folder id, which nobody named.
 */
const recordedName = (p: Page): string | undefined => {
  const name = (p.json as { displayName?: unknown } | undefined)?.displayName;
  return typeof name === "string" ? name : undefined;
};

export const DEFAULT_PAGE_NAME = pbiplintRule({
  id: "DEFAULT_PAGE_NAME",
  name: "Page keeps its default name",
  category: "Report Design",
  severity: 2,
  scope: ["Page"],
  layer: "report",
  check: ({ report }) =>
    report
      ? report.pages.flatMap((p) => {
          const name = recordedName(p);
          const match =
            name === undefined ? undefined : DEFAULT_NAMES.find(([re]) => re.test(name));
          return match ? [reportFinding.page(p, "/displayName", `"${name}" ${match[1]}`)] : [];
        })
      : [],
});

export const pageRules = [DEFAULT_PAGE_NAME];
