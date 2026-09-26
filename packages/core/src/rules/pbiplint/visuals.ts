import { plural } from "../../format/text.js";
import { visualName } from "../../pbir/names.js";
import {
  allVisuals,
  hiddenVisualWithFields,
  hidingGroup,
  reportFinding,
  slicerSearch,
  slicerSelection,
} from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

export const HIDDEN_VISUAL_WITH_FIELDS = pbiplintRule({
  id: "HIDDEN_VISUAL_WITH_FIELDS",
  name: "Hidden visual with fields bound",
  category: "Maintenance",
  severity: 1,
  scope: ["Visual"],
  layer: "report",
  // A hidden visual runs no query until a bookmark or the Selection pane shows it, so the finding
  // is one nothing may show, left behind with its fields, not a cost the report pays. A visual
  // hidden only through its group has no isHidden of its own to point at, so its finding sits on
  // line 1 and names the outermost hidden group.
  check: ({ report }) =>
    report
      ? allVisuals(report)
          .filter(hiddenVisualWithFields)
          .map((v) => {
            const fields = `${plural(v.projectionCount, "field")} bound`;
            const group = v.isHidden ? undefined : hidingGroup(v);
            return group
              ? reportFinding.visual(v, undefined, `${fields}, hidden with ${visualName(group)}`)
              : reportFinding.visual(v, "/isHidden", fields);
          })
      : [],
});

/**
 * Visual types that bind no fields by design. Groups are left out by `isGroup`, not by a type name.
 */
const NON_DATA = new Set([
  // Shapes, current and legacy; a line or a rectangle is a `shape`.
  "shape",
  "basicShape",
  "textbox",
  "image",
  // Every button preset is an `actionButton`.
  "actionButton",
  // Navigators have their own types, though Learn files them under buttons.
  "pageNavigator",
  "bookmarkNavigator",
  // No data roles in Microsoft's visual catalog.
  "qnaVisual",
  "aiNarratives",
  "scorecard",
  "animatedNumber",
  // The paginated report visual and the Power Automate visual, whose fields Learn makes optional.
  "rdlVisual",
  "FlowVisual_C29F1DCC_81F5_4973_94AD_0517D44CC06A",
]);

export const VISUAL_WITHOUT_FIELDS = pbiplintRule({
  id: "VISUAL_WITHOUT_FIELDS",
  name: "Data visual with no fields",
  category: "Report Design",
  severity: 2,
  scope: ["Visual"],
  layer: "report",
  // It counts the wells' entries: a title or a sort bound to a measure shows no data in a well.
  // A container with neither a `visual` nor a `visualGroup` is malformed, not a data visual.
  check: ({ report }) =>
    report
      ? allVisuals(report)
          .filter(
            (v) =>
              !v.isGroup &&
              v.type !== "unknown" &&
              !NON_DATA.has(v.type) &&
              v.projectionCount === 0,
          )
          .map((v) => reportFinding.visual(v, "/visual/visualType", "no fields bound"))
      : [],
});

export const VISUAL_OUTSIDE_PAGE = pbiplintRule({
  id: "VISUAL_OUTSIDE_PAGE",
  name: "Visual extends past the page",
  category: "Report Design",
  severity: 2,
  scope: ["Visual"],
  layer: "report",
  // Only what sits on the page itself: an ungrouped visual or a top-level group. Desktop writes a
  // grouped visual's x and y relative to its parent group, chained through nested groups, and lays
  // its box out inside the group's, so a group past the edge is one finding, on the group.
  check: ({ report }) =>
    report
      ? allVisuals(report).flatMap((v) => {
          const { width, height } = v.page;
          if (v.groupId !== undefined || width === undefined || height === undefined) return [];
          const right = v.position.x + v.position.width - width;
          const bottom = v.position.y + v.position.height - height;
          // An edge counts from a whole pixel past it, so a fraction of a pixel is not reported.
          const parts = [
            right >= 1 && `${Math.round(right)} px past the right edge`,
            bottom >= 1 && `${Math.round(bottom)} px past the bottom edge`,
          ].filter((part): part is string => typeof part === "string");
          return parts.length ? [reportFinding.visual(v, "/position", parts.join(", "))] : [];
        })
      : [],
});

export const SLICER_SELECTION_SAVED = pbiplintRule({
  id: "SLICER_SELECTION_SAVED",
  name: "Slicer saved with a selection",
  category: "Report Design",
  severity: 1,
  scope: ["Visual"],
  layer: "report",
  options: [{ name: "expect", type: "string", values: ["none"] }],
  policySeverity: (o) => (o.expect === "none" ? 2 : undefined),
  // A hidden slicer still filters, and each synced copy carries the selection it reports. Any
  // visual type is read, so a custom slicer from AppSource with a selection is reported too.
  check: ({ report }) =>
    report
      ? allVisuals(report).flatMap((v) => {
          const selection = slicerSelection(v);
          return selection === undefined
            ? []
            : [reportFinding.visual(v, selection, "opens with this selection applied")];
        })
      : [],
});

export const SLICER_SEARCH_SAVED = pbiplintRule({
  id: "SLICER_SEARCH_SAVED",
  name: "Slicer saved with a search term",
  category: "Report Design",
  severity: 2,
  scope: ["Visual"],
  layer: "report",
  // Read on any visual type and hidden or not, as a saved selection is. The detail names no
  // column: Desktop keeps the term when the slicer's field is swapped, so it can sit on a column
  // the slicer no longer shows.
  check: ({ report }) =>
    report
      ? allVisuals(report).flatMap((v) => {
          const search = slicerSearch(v);
          if (search === undefined) return [];
          const detail =
            search.term === undefined
              ? "opens with a search term saved"
              : `opens with the search term "${search.term}" saved`;
          return [reportFinding.visual(v, search.pointer, detail)];
        })
      : [],
});

export const visualRules = [
  HIDDEN_VISUAL_WITH_FIELDS,
  VISUAL_WITHOUT_FIELDS,
  VISUAL_OUTSIDE_PAGE,
  SLICER_SELECTION_SAVED,
  SLICER_SEARCH_SAVED,
];
