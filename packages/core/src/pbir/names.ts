import type { Bookmark, Page, ReportMeasure, Visual } from "./types.js";

/** The first six characters of a report object's id, enough to find its folder. */
export const shortId = (id: string): string => id.slice(0, 6);
export const pageLabel = (p: Page): string => `Page "${p.displayName}"`;
/**
 * A visual's name without its page: `"<title>"` when the visual has a title, `Group "<name>"` for
 * a group whose visualGroup records a display name, else `<type> (<id6>)`, which for a group
 * without one reads `visualGroup (<id6>)`.
 */
export const visualName = (v: Visual): string =>
  v.title !== undefined && v.title !== ""
    ? `"${v.title}"`
    : v.displayName !== undefined && v.displayName !== ""
      ? `Group "${v.displayName}"`
      : `${v.type} (${shortId(v.id)})`;
/** The visual's name and the page it sits on: `<name> on "<page>"`. */
export const visualLabel = (v: Visual): string => `${visualName(v)} on "${v.page.displayName}"`;
export const bookmarkLabel = (b: Bookmark): string => `Bookmark "${b.displayName}"`;
export const reportMeasureLabel = (m: ReportMeasure): string => `[${m.name}] (report)`;
export const pageFilterLabel = (p: Page): string => `Page filter on "${p.displayName}"`;
export const REPORT_LABEL = "Report";
export const REPORT_FILTER_LABEL = "Report filter";
