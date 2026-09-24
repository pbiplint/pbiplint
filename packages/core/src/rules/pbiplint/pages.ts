import type { Page } from "../../pbir/types.js";
import { reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

const NEW_PAGE = "is the name Power BI Desktop gives a new page";
const DUPLICATE = "is the name Power BI Desktop gives a duplicated page";

/**
 * The names Power BI Desktop gives a new or duplicated page (a duplicate of a duplicate nests), and
 * a name marked as a copy, each with what the finding says of it. Desktop names pages in the
 * language it runs in, and Microsoft publishes no list of those names, so the forms other than
 * English are exactly the ones Desktop-saved page.json files show, each with the language of the
 * reports it was seen in (their model's culture or their other page names): `Seite 1` (German),
 * `Página 1` (Spanish and Portuguese), `Pagina 1` (Italian), `ページ 1` (Japanese, with an ASCII
 * space), and duplicates named `Duplikat von "<name>"` (German, the name in straight double
 * quotes), `Duplicado de` (Spanish), `Doublon de` (French), `Duplicata de` (Portuguese), and
 * `Duplikat av`, from a report that does not show its language (the phrase for "duplicate of" in
 * Norwegian and in Swedish). A form not listed is a missed finding, never a false one. Desktop
 * numbers new pages from 1 without leading zeros, so `Page 0` and `Page 01` are not its names. The
 * detail names the pattern, never who typed the name, which pbiplint cannot read.
 */
const DEFAULT_NAMES: [RegExp, string][] = [
  [/^(?:Page|Seite|Página|Pagina|ページ) [1-9]\d*$/, NEW_PAGE],
  [/^(?:Duplicate of|Duplicado de|Doublon de|Duplicata de|Duplikat av) .+$/, DUPLICATE],
  [/^Duplikat von ".+"$/, DUPLICATE],
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
