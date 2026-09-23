import {
  filtersPaneState,
  landingPageNotSet,
  openingPage,
  openingPageInvalid,
  reportFinding,
} from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

export const LANDING_PAGE_NOT_SET = pbiplintRule({
  id: "LANDING_PAGE_NOT_SET",
  name: "No landing page set",
  category: "Report Design",
  severity: 1,
  scope: ["Report"],
  layer: "report",
  check: ({ report }) => {
    const opens = report && landingPageNotSet(report) ? openingPage(report) : undefined;
    if (!report || !opens) return [];
    const pointer = opens.by === "active" ? "/activePageName" : undefined;
    // Never name a page the report does not have; OPENING_PAGE_INVALID reports it beside this.
    if (opens.page === undefined)
      return [
        reportFinding.pagesHeader(
          report,
          pointer,
          `no landing page set; the active page "${opens.name}" does not exist`,
        ),
      ];
    const which = opens.by === "first" ? "the first page" : "the page open when it was saved";
    return [
      reportFinding.pagesHeader(report, pointer, `opens on "${opens.page.displayName}", ${which}`),
    ];
  },
});

export const OPENING_PAGE_INVALID = pbiplintRule({
  id: "OPENING_PAGE_INVALID",
  name: "Opening page missing or hidden",
  category: "Error Prevention",
  severity: 3,
  scope: ["Report"],
  layer: "report",
  check: ({ report }) => {
    const opens = report && openingPage(report);
    if (!report || !opens || !openingPageInvalid(opens)) return [];
    const pointer = opens.by === "landing" ? "/landingPageName" : "/activePageName";
    // A page that exists and is still invalid is a hidden active page.
    const detail =
      opens.page === undefined
        ? `${opens.by} page "${opens.name}" does not exist`
        : `active page "${opens.page.displayName}" is hidden from readers`;
    return [reportFinding.pagesHeader(report, pointer, detail)];
  },
});

export const FILTERS_PANE_STATE = pbiplintRule({
  id: "FILTERS_PANE_STATE",
  name: "Filters pane state differs from policy",
  category: "Report Design",
  severity: 2,
  scope: ["Report"],
  layer: "report",
  options: [{ name: "expect", type: "string", values: ["open", "closed"] }],
  check: ({ report }, ctx) => {
    const expect = ctx.options.expect;
    if (!report || expect === undefined) return [];
    // Silent, too, without a report.json to read the pane from.
    const pane = filtersPaneState(report);
    if (!pane || pane.state === expect) return [];
    const { state, recordedAt } = pane;
    // Without the property pbiplint reads the pane as open, and says that is its reading of a
    // state the file does not record, not a saved state.
    const saved = recordedAt === undefined ? `not recorded, read as ${state}` : `saved ${state}`;
    return [
      reportFinding.report(report, `${saved}; the policy expects ${expect}`, "report", recordedAt),
    ];
  },
});

export const openingRules = [LANDING_PAGE_NOT_SET, OPENING_PAGE_INVALID, FILTERS_PANE_STATE];
