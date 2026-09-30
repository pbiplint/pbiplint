import { escapePointer } from "../../pbir/json.js";
import {
  allVisuals,
  bookmarkUnread,
  pageUnread,
  reportFinding,
  visualUnread,
} from "../report-helpers.js";
import type { Page } from "../../pbir/types.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

/**
 * The action types whose destination names a page or a bookmark, keyed by the type in lower case,
 * with what a finding calls each.
 */
const CHECKED: ReadonlyMap<string, { action: string; object: "page" | "bookmark" }> = new Map([
  ["pagenavigation", { action: "Page navigation", object: "page" }],
  ["drillthrough", { action: "Drillthrough", object: "page" }],
  ["bookmark", { action: "Bookmark", object: "bookmark" }],
] as const);

export const BROKEN_ACTION_TARGET = pbiplintRule({
  id: "BROKEN_ACTION_TARGET",
  name: "Action points at nothing",
  category: "Error Prevention",
  severity: 3,
  scope: ["Visual"],
  layer: "report",
  check: ({ report }) => {
    if (!report) return [];
    // A page or a bookmark whose own file could not be read is there, under the folder or file
    // name Desktop gives it, so a destination naming it is not reported; nor is one a folder that
    // could not be read could hold.
    const pages = new Set(report.pages.map((p) => p.id));
    const bookmarks = new Set(report.bookmarks.map((b) => b.id));
    const exists = {
      page: (name: string) => pages.has(name) || pageUnread(report, name),
      bookmark: (name: string) => bookmarks.has(name) || bookmarkUnread(report, name),
    };
    // Every visual that carries an action is read, hidden or not: buttons, shapes, and images.
    return allVisuals(report).flatMap((v) =>
      v.actions.flatMap((a): RuleFinding[] => {
        // Not checked: navigators' pages and bookmarks, tooltip pages, a drillthrough page's binding.
        const checked = CHECKED.get(a.type.toLowerCase());
        // Off or conditional: nothing to resolve. An empty destination is ACTION_WITHOUT_DESTINATION's.
        if (!checked || !a.on || a.target === undefined) return [];
        if (exists[checked.object](a.target)) return [];
        return [
          reportFinding.visual(
            v,
            a.pointer,
            `${checked.action} action points at ${checked.object} "${a.target}", which does not exist`,
          ),
        ];
      }),
    );
  },
});

export const ACTION_WITHOUT_DESTINATION = pbiplintRule({
  id: "ACTION_WITHOUT_DESTINATION",
  name: "Action has no destination",
  category: "Report Design",
  severity: 2,
  scope: ["Visual"],
  layer: "report",
  // The same three types as BROKEN_ACTION_TARGET, on any visual, hidden or not. The pointer is the
  // destination property when it is there and empty, else the entry's properties.
  check: ({ report }) =>
    report
      ? allVisuals(report).flatMap((v) =>
          v.actions.flatMap((a): RuleFinding[] => {
            const checked = CHECKED.get(a.type.toLowerCase());
            if (!checked || !a.on || a.target !== undefined || a.conditional) return [];
            return [
              reportFinding.visual(v, a.pointer, `${checked.action} action has no destination`),
            ];
          }),
        )
      : [],
});

const SECTIONS = "/explorationState/sections";

export const BROKEN_BOOKMARK_REFERENCE = pbiplintRule({
  id: "BROKEN_BOOKMARK_REFERENCE",
  name: "Bookmark refers to a missing page or visual",
  category: "Error Prevention",
  severity: 2,
  scope: ["Bookmark"],
  layer: "report",
  // Groups, captured apart from visuals under `visualContainerGroups`, are not read. A page or a
  // visual whose own file could not be read is there, under the folder name Desktop gives it, so
  // it is never reported missing, and neither is one a folder that could not be read could hold.
  check: ({ report }) => {
    if (!report) return [];
    const pages = new Map(report.pages.map((p) => [p.id, p]));
    const missing = (id: string): boolean => !pages.has(id) && !pageUnread(report, id);
    const notOn = (p: Page, id: string): boolean =>
      !p.visuals.some((v) => v.id === id) && !visualUnread(report, p, id);
    return report.bookmarks.flatMap((b): RuleFinding[] => {
      const out: RuleFinding[] = [];
      if (b.activePage !== undefined && missing(b.activePage))
        out.push(
          reportFinding.bookmark(
            b,
            `active page "${b.activePage}" does not exist`,
            "/explorationState/activeSection",
          ),
        );
      // Desktop writes one section, the active page's, so a missing one is reported once, above.
      for (const id of b.pages)
        if (id !== b.activePage && missing(id))
          out.push(
            reportFinding.bookmark(
              b,
              `captured page "${id}" does not exist`,
              `${SECTIONS}/${escapePointer(id)}`,
            ),
          );
      for (const { page, visual, pointer } of b.visuals) {
        const p = pages.get(page);
        if (p && notOn(p, visual))
          out.push(
            reportFinding.bookmark(
              b,
              `captured visual "${visual}" is not on page "${p.displayName}"`,
              pointer,
            ),
          );
      }
      // Read only with Selected visuals on. The list names visuals and groups of the active page,
      // and a group is one of the page's visuals here.
      const active = b.activePage === undefined ? undefined : pages.get(b.activePage);
      if (active)
        for (const { visual, pointer } of b.targetVisuals ?? [])
          if (notOn(active, visual))
            out.push(
              reportFinding.bookmark(
                b,
                `target visual "${visual}" is not on page "${active.displayName}"`,
                pointer,
              ),
            );
      return out;
    });
  },
});

export const actionRules = [
  BROKEN_ACTION_TARGET,
  ACTION_WITHOUT_DESTINATION,
  BROKEN_BOOKMARK_REFERENCE,
];
