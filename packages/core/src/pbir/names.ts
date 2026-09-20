import type { Bookmark, Page, ReportMeasure, Visual } from "./types.js";

/** The first six characters of a report object's id, enough to find its folder. */
export const shortId = (id: string): string => id.slice(0, 6);
export const pageLabel = (p: Page): string => `Page "${p.displayName}"`;
/** `"<title>" on "<page>"` when the visual has a title, else `<type> (<id6>) on "<page>"`. */
export const visualLabel = (v: Visual): string =>
  v.title !== undefined && v.title !== ""
    ? `"${v.title}" on "${v.page.displayName}"`
    : `${v.type} (${shortId(v.id)}) on "${v.page.displayName}"`;
export const bookmarkLabel = (b: Bookmark): string => `Bookmark "${b.displayName}"`;
export const reportMeasureLabel = (m: ReportMeasure): string => `[${m.name}] (report)`;
export const pageFilterLabel = (p: Page): string => `Page filter on "${p.displayName}"`;
export const REPORT_LABEL = "Report";
export const REPORT_FILTER_LABEL = "Report filter";
