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
import type { Project } from "../project/types.js";
import type { RuleFinding } from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
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
 * not by an annotation in report.json (spec section 5). Report measures carry none either, since
 * pbiplint reads no annotation on a measure in reportExtensions.json, and neither do bookmarks,
 * since Microsoft's bookmark schema allows no annotation in a bookmark's file.
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
      },
      detail,
    ),
};

export const allVisuals = (r: Report): Visual[] => r.pages.flatMap((p) => p.visuals);
export const isHiddenPage = (p: Page): boolean => p.visibility === "HiddenInViewMode";
export const visiblePages = (r: Report): Page[] => r.pages.filter((p) => !isHiddenPage(p));

/**
 * Whether the page is set up as a tooltip. page.json marks one in either of two places: its own
 * `type`, which Microsoft's page schema gives as "Page to be used as tooltip." and which alone
 * marks most tooltip pages in Desktop-saved reports, or its `pageBinding`'s `type`, "Binding to be
 * used as tooltip page." in the same schema.
 */
export const isTooltipPage = (p: Page): boolean =>
  p.type === "Tooltip" || p.bindingType === "Tooltip";

/**
 * Whether the page is set up as a drillthrough target, read from the same two places: its own
 * `type`, "Page to be used as drillthrough." in Microsoft's page schema, or its `pageBinding`'s
 * `type`, "Binding to be used as drillthrough." in the same schema.
 */
export const isDrillthroughPage = (p: Page): boolean =>
  p.type === "Drillthrough" || p.bindingType === "Drillthrough";

/**
 * The outermost hidden group the visual sits in, or undefined when no group above it is hidden.
 * It follows `groupId`, visual.json's `parentGroupName`, from group to group among the visuals of
 * the visual's own page, following only a group. A group that names itself, or a chain of groups
 * that comes back round, is followed once.
 */
export function hidingGroup(v: Visual): Visual | undefined {
  const seen = new Set([v.id]);
  let outermost: Visual | undefined;
  let id = v.groupId;
  while (id !== undefined && !seen.has(id)) {
    seen.add(id);
    const group = v.page.visuals.find((g) => g.isGroup && g.id === id);
    if (group === undefined) break;
    if (group.isHidden) outermost = group;
    id = group.groupId;
  }
  return outermost;
}

/**
 * Whether the visual is hidden on its page: by its own `isHidden`, or by a hidden group above it.
 * Hiding a group in the Selection pane hides every visual in it, and Power BI Desktop's saved
 * files do not always write `isHidden` on those visuals themselves. HIDDEN_VISUAL_WITH_FIELDS and
 * the Visuals fact's hidden count read this. The ported rules read the visual's own `isHidden`
 * instead, as their source does, and parity with PBI Inspector depends on it.
 */
export const isHiddenVisual = (v: Visual): boolean => v.isHidden || hidingGroup(v) !== undefined;

/**
 * HIDDEN_VISUAL_WITH_FIELDS's condition, which the Visuals fact shares: a visual hidden by its own
 * `isHidden` or through its group, with a field in any of its wells. It counts the wells'
 * entries, so a visual calculation, which references no model field, still counts, and a group,
 * which has no wells, never does.
 */
export const hiddenVisualWithFields = (v: Visual): boolean =>
  isHiddenVisual(v) && v.projectionCount > 0;

/**
 * The slicer types in Microsoft's visual catalog: the slicer, the button slicer, the list slicer,
 * the input slicer, and `filterSlicer`. A slicer from AppSource is a custom visual, not one of them.
 */
const SLICER_TYPES = new Set([
  "slicer",
  "advancedSlicerVisual",
  "listSlicer",
  "textSlicer",
  "filterSlicer",
]);

/** Whether the visual is one of Microsoft's slicers; the Slicers fact counts these. */
export const isSlicer = (v: Visual): boolean => SLICER_TYPES.has(v.type);

/**
 * SLICER_SELECTION_SAVED's condition, which the Slicers fact shares: the pointer of a slicer's
 * saved selection, the first `general` entry whose `filter` holds a `Where` with a condition in
 * it, or undefined when the slicer opens with nothing selected. Every catalog slicer keeps its
 * selection there. Its `filterConfig` entries are Filters pane filters, never the selection, and
 * Select all writes no filter, even in inverted selection mode.
 */
export function slicerSelection(v: Visual): string | undefined {
  if (!isSlicer(v) || !isRecord(v.json) || !isRecord(v.json.visual)) return undefined;
  const objects = v.json.visual.objects;
  const general = isRecord(objects) && Array.isArray(objects.general) ? objects.general : [];
  const i = general.findIndex((entry) => {
    const props = isRecord(entry) && isRecord(entry.properties) ? entry.properties : {};
    const filter =
      isRecord(props.filter) && isRecord(props.filter.filter) ? props.filter.filter : {};
    return Array.isArray(filter.Where) && filter.Where.length > 0;
  });
  return i === -1 ? undefined : `/visual/objects/general/${i}/properties/filter`;
}

/**
 * The report measures REPORT_LEVEL_MEASURES reports, which the Report measures fact shares: every
 * measure the report defines when the run holds the model the report reads, so each can move into
 * it, and none otherwise. A report that reads a published model is left alone, since report
 * measures are the supported route for an author who cannot change a shared model.
 */
export const reportMeasuresToMove = (project: Project): ReportMeasure[] =>
  project.model && project.report ? project.report.measures : [];

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
