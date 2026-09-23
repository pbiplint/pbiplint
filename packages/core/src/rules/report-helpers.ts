import { lineOfPointer } from "../pbir/json.js";
import {
  bookmarkLabel,
  pageFilterLabel,
  pageLabel,
  REPORT_FILTER_LABEL,
  REPORT_LABEL,
  reportMeasureLabel,
  visualLabel,
} from "../pbir/names.js";
import type { Bookmark, Page, Report, ReportMeasure, Visual } from "../pbir/types.js";
import type { RuleFinding } from "./types.js";

const at = (file: string, text: string, pointer?: string) => ({
  file,
  line: pointer ? lineOfPointer(text, pointer) : 1,
});
const withDetail = (f: RuleFinding, detail?: string): RuleFinding =>
  detail === undefined ? f : { ...f, detail };
/** A report-level finding's location in report.json, or none when report.json was not read. */
const inReportJson = (r: Report, pointer?: string) =>
  r.file ? { location: at(r.file, r.text ?? "", pointer) } : {};

/**
 * Finding factories for report objects. `objectId` is what parity compares; `object` is what the
 * ignore check reads. Report-level findings carry no `object`: they are switched off in config,
 * not by an annotation in report.json (spec section 5).
 */
export const reportFinding = {
  report: (r: Report, detail?: string, objectId = "report", pointer?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Report",
        objectName: REPORT_LABEL,
        objectId,
        ...inReportJson(r, pointer),
      },
      detail,
    ),
  /**
   * A finding on the report located in pages.json, where the opening page is set. Without a
   * pages.json in the input it sits where `report` puts it, never at a path the input lacks.
   */
  pagesHeader: (r: Report, pointer?: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Report",
        objectName: REPORT_LABEL,
        objectId: "report",
        ...(r.pagesHeader.file
          ? { location: at(r.pagesHeader.file, r.pagesHeader.text ?? "", pointer) }
          : inReportJson(r)),
      },
      detail,
    ),
  page: (p: Page, pointer?: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Page",
        objectName: pageLabel(p),
        objectId: p.id,
        location: at(p.file, p.text, pointer),
        object: p,
      },
      detail,
    ),
  visual: (v: Visual, pointer?: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Visual",
        objectName: visualLabel(v),
        objectId: v.id,
        location: at(v.file, v.text, pointer),
        object: v,
      },
      detail,
    ),
  pageFilter: (p: Page, pointer: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Page",
        objectName: pageFilterLabel(p),
        objectId: p.id,
        location: at(p.file, p.text, pointer),
        object: p,
      },
      detail,
    ),
  reportFilter: (r: Report, pointer: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Report",
        objectName: REPORT_FILTER_LABEL,
        objectId: "report",
        location: at(r.file ?? "definition/report.json", r.text ?? "", pointer),
      },
      detail,
    ),
  bookmark: (b: Bookmark, detail?: string, pointer?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Bookmark",
        objectName: bookmarkLabel(b),
        objectId: b.id,
        location: at(b.file, b.text, pointer),
        object: b,
      },
      detail,
    ),
  reportMeasure: (m: ReportMeasure, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "ReportMeasure",
        objectName: reportMeasureLabel(m),
        objectId: `${m.table}.${m.name}`,
        location: { file: m.file, line: m.line },
        object: m,
      },
      detail,
    ),
};

export const allVisuals = (r: Report): Visual[] => r.pages.flatMap((p) => p.visuals);
export const isHiddenPage = (p: Page): boolean => p.visibility === "HiddenInViewMode";
export const visiblePages = (r: Report): Page[] => r.pages.filter((p) => !isHiddenPage(p));

/**
 * HIDDEN_VISUAL_WITH_FIELDS's condition, which the Visuals fact shares: a hidden visual with a field
 * in any of its wells. It counts the wells' entries, so a visual calculation, which references no
 * model field, still counts, and a group, which has no wells, never does.
 */
export const hiddenVisualWithFields = (v: Visual): boolean => v.isHidden && v.projectionCount > 0;

/** The page a report opens on, what decided it, and the name pages.json gives it. */
export interface OpeningPage {
  by: "landing" | "active" | "first";
  name: string;
  /** The page that name resolves to; absent when no page has that name. */
  page?: Page;
}

/**
 * Where the report opens: the landing page when one is set, else the page open when it was saved,
 * else the first page in pageOrder, which is the pagesMetadata schema's default when pages.json
 * names neither. Undefined when pages.json was not read (absent, or unreadable), since nothing
 * then says which page opens, and when it names neither and there are no pages: nothing opens.
 */
export function openingPage(r: Report): OpeningPage | undefined {
  if (r.pagesHeader.file === undefined) return undefined;
  const { landingPageName, activePageName } = r.pagesHeader;
  const name = landingPageName ?? activePageName;
  if (name !== undefined)
    return {
      by: landingPageName !== undefined ? "landing" : "active",
      name,
      page: r.pages.find((p) => p.id === name),
    };
  const first = r.pages[0];
  return first === undefined ? undefined : { by: "first", name: first.id, page: first };
}

/**
 * OPENING_PAGE_INVALID's condition, which the Opens on fact shares: a landing page that names no
 * page, or, with no landing page, an active page that names no page or a hidden one. A hidden
 * landing page is a supported design, since readers always open on it; a hidden active page is a
 * report saved while on a helper page.
 */
export const openingPageInvalid = (o: OpeningPage | undefined): boolean =>
  o !== undefined &&
  o.by !== "first" &&
  (o.page === undefined || (o.by === "active" && isHiddenPage(o.page)));

/**
 * LANDING_PAGE_NOT_SET's condition, which the Opens on fact shares: a pages.json that was read
 * and sets no landing page, and a page to open.
 */
export const landingPageNotSet = (r: Report): boolean =>
  r.pagesHeader.file !== undefined &&
  r.pagesHeader.landingPageName === undefined &&
  r.pages.length > 0;

export type FiltersPaneState = "open" | "closed" | "hidden from readers";

/**
 * The Filters pane as readers first see it, and the report.json property that records it.
 * `visible: false` hides the pane whatever `expanded` says; otherwise `expanded` decides, and
 * without it the pane is read as open. Desktop records "false" when the pane was collapsed and
 * "true" when it was open, though one Desktop-saved 3.1.0 report outside the fixtures records
 * nothing for an open pane. `recordedAt` is absent when the file records neither, so the state is
 * that reading. Undefined when report.json was not read (absent, or unreadable), since nothing
 * then says what state the pane is in; FILTERS_PANE_STATE and the Filters pane fact share this.
 */
export function filtersPaneState(
  r: Report,
): { state: FiltersPaneState; recordedAt?: string } | undefined {
  if (r.file === undefined) return undefined;
  const property = (key: string) => `/objects/outspacePane/0/properties/${key}`;
  const pane = r.filtersPane;
  if (pane.visible === false)
    return { state: "hidden from readers", recordedAt: property("visible") };
  if (pane.expanded !== undefined)
    return { state: pane.expanded ? "open" : "closed", recordedAt: property("expanded") };
  return { state: "open" };
}
