import { visualName } from "../../pbir/names.js";
import type { Visual } from "../../pbir/types.js";
import { reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/**
 * A member's place in its scope's tab order. Every compared member records one; a group the tab
 * sequence does not reach may not, and its missing tabOrder counts as 0 only to break a position
 * tie among such groups.
 */
const tab = (v: Visual): number => v.position.tabOrder ?? 0;

/** Top to bottom, then left to right, with no tolerance; two at one position go in tab order. */
const byTopThenLeft = (a: Visual, b: Visual): number =>
  a.position.y - b.position.y || a.position.x - b.position.x || tab(a) - tab(b);

/**
 * Reading order: rows top to bottom, left to right within a row. A visual joins the current row
 * when its top is within half the median visual height of the row's first top; otherwise it
 * starts a new row. The tolerance is what keeps two visuals a few pixels apart on one row. Two at
 * one position read in tab order, so that tie alone is no disagreement.
 */
function readingOrder(visuals: Visual[]): Visual[] {
  const tolerance = median(visuals.map((v) => v.position.height)) / 2;
  const rows: Visual[][] = [];
  for (const v of [...visuals].sort(byTopThenLeft)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(v.position.y - row[0]!.position.y) <= tolerance) row.push(v);
    else rows.push([v]);
  }
  return rows.flatMap((row) =>
    row.sort(
      (a, b) => a.position.x - b.position.x || a.position.y - b.position.y || tab(a) - tab(b),
    ),
  );
}

/**
 * Whether a member takes a known place in its scope's tab order: visible, with a tabOrder of 0 or
 * more. Desktop writes a negative tabOrder for a visual hidden from the tab order, and one with
 * none leaves its place unknown.
 */
const compared = (v: Visual): boolean =>
  !v.isHidden && v.position.tabOrder !== undefined && v.position.tabOrder >= 0;

/**
 * The first disagreement in tab sequence from one scope down: the scope's compared members, then
 * the scope of each visible group in it, those the tab sequence reaches first. Desktop writes a
 * grouped visual's x, y, and tabOrder relative to its group, so the members of one scope share an
 * origin and their own positions order them. A scope agrees when its tab order, ties broken by
 * reading order, is the reading order or the strict top-then-left order Desktop's "match visual
 * order" button writes.
 */
function firstDisagreement(
  scope: Visual[],
  scopes: ReadonlyMap<string | undefined, Visual[]>,
  seen: Set<Visual>,
  group?: Visual,
): string | undefined {
  const members = scope.filter(compared);
  // A scope of fewer than two has no order to disagree with; its groups are still entered.
  const layout = members.length < 2 ? members : readingOrder(members);
  const read = new Map(layout.map((v, k) => [v, k]));
  const tabs = [...members].sort((a, b) => tab(a) - tab(b) || read.get(a)! - read.get(b)!);
  const strict = [...members].sort(byTopThenLeft);
  const i = layout.findIndex((v, k) => v !== tabs[k]);
  if (i !== -1 && strict.some((v, k) => v !== tabs[k])) {
    const detail =
      i === 0
        ? `tab order starts at ${visualName(tabs[0]!)} but the layout reads ${visualName(layout[0]!)} first`
        : `tab order visits ${visualName(tabs[i]!)} where the layout reads ${visualName(layout[i]!)}`;
    return group ? `in ${visualName(group)}, ${detail}` : detail;
  }
  // The groups the tab sequence reaches, in its order, then the visible ones it does not reach (no
  // tabOrder, or a negative one), in reading order: their children still have an order of their
  // own. A hidden group's children are left out with it.
  const unreached = scope.filter((v) => v.isGroup && !v.isHidden && !compared(v));
  const groups = [
    ...tabs.filter((v) => v.isGroup),
    ...(unreached.length < 2 ? unreached : readingOrder(unreached)),
  ];
  for (const g of groups) {
    // A group is visited once, whatever its members claim as their parent.
    if (seen.has(g)) continue;
    seen.add(g);
    const found = firstDisagreement(scopes.get(g.id) ?? [], scopes, seen, g);
    if (found !== undefined) return found;
  }
  return undefined;
}

export const TAB_ORDER_FOLLOWS_LAYOUT = pbiplintRule({
  id: "TAB_ORDER_FOLLOWS_LAYOUT",
  name: "Tab order disagrees with the layout",
  category: "Accessibility",
  severity: 2,
  scope: ["Page"],
  layer: "report",
  // One finding per page, on the first scope in tab sequence whose order disagrees.
  check: ({ report }) =>
    (report?.pages ?? []).flatMap((p) => {
      // A tooltip page shows on hover, not as a page a reader tabs through.
      if (p.bindingType === "Tooltip") return [];
      // Each scope's members by the group they sit in: the page's own under no group.
      const scopes = new Map<string | undefined, Visual[]>();
      for (const v of p.visuals) {
        const scope = scopes.get(v.groupId);
        if (scope) scope.push(v);
        else scopes.set(v.groupId, [v]);
      }
      const detail = firstDisagreement(scopes.get(undefined) ?? [], scopes, new Set());
      return detail === undefined ? [] : [reportFinding.page(p, undefined, detail)];
    }),
});

export const tabOrderRules = [TAB_ORDER_FOLLOWS_LAYOUT];
