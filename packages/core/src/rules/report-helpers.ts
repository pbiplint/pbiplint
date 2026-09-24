import { holdsFieldReferences, isMobileFile, isVisualFile, pageFolderOf } from "../pbir/build.js";
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

/**
 * Whether a file the report's field references are read from could not be read: report.json,
 * reportExtensions.json, a page.json, a visual.json, or a bookmark file (`holdsFieldReferences`),
 * found among `Report.unreadDefinitionFiles`. Such a file may reference any field in the model,
 * so NOT_REACHED_FROM_REPORT sets this as its `skipWhenUnread` and the Model fact's not-reached
 * clause says unknown. version.json, pages.json, bookmarks.json, and a mobile.json name no field,
 * so one of them unread changes neither.
 */
export const fieldFileUnread = (r: Report): boolean =>
  r.unreadDefinitionFiles.some(holdsFieldReferences);

/**
 * Whether a visual.json could not be read. The visual it holds could be of any type, a slicer
 * included, and could carry a saved selection, so the Slicers fact says unknown where it would
 * otherwise say none.
 */
export const visualFileUnread = (r: Report): boolean => r.unreadDefinitionFiles.some(isVisualFile);

/**
 * Whether a registered custom visual type is used by no visual that was read while a visual.json
 * could not be read: the unread visual could be of that type, so whether it is used is unknown.
 * REMOVE_UNUSED_CUSTOM_VISUALS sets this as its `skipWhenUnread`, and the Visuals fact says the
 * used count is unknown on the same condition. With no custom visual registered, or every
 * registered type used by a visual that was read, the unread visual changes neither.
 */
export function customVisualUseUnknown(r: Report): boolean {
  if (!visualFileUnread(r)) return false;
  const used = new Set(allVisuals(r).map((v) => v.type));
  return r.publicCustomVisuals.some((t) => !used.has(t));
}

/**
 * Whether a visual's mobile.json could not be read. The Mobile layouts fact says unknown then
 * where it would otherwise say none, since that file marks a mobile layout.
 */
export const mobileFileUnread = (r: Report): boolean => r.unreadDefinitionFiles.some(isMobileFile);

/**
 * Whether a mobile.json that was read sits in a page folder no page object stands for, while that
 * folder holds a page.json or a visual.json that could not be read. Every other mobile.json that
 * was read marks the page in its folder (`Page.hasMobileLayout`); this one's page is not counted,
 * and the unread file may be what defines it, so the Mobile layouts fact cannot say none. A stray
 * mobile.json in a folder where nothing failed to read marks no page, and none stays: no file
 * pbiplint could not read could define a page there.
 */
export function mobilePageUnread(r: Report): boolean {
  const placed = new Set(r.pages.map((p) => pageFolderOf(p.file)));
  const unread = new Set([
    ...r.unreadPages,
    ...r.unreadDefinitionFiles.filter(isVisualFile).map(pageFolderOf),
  ]);
  return r.files.some((f) => {
    if (!isMobileFile(f) || r.unreadDefinitionFiles.includes(f)) return false;
    const folder = pageFolderOf(f);
    return !placed.has(folder) && unread.has(folder);
  });
}

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
 * Whether the page is set up as a drillthrough target, read from its `pageBinding`'s `type` alone,
 * "Binding to be used as drillthrough." in Microsoft's page schema, as PBI Inspector reads it. Every
 * drillthrough target in Desktop-saved reports carries that binding, while page.json's own `type`
 * of Drillthrough alone also marks pages that are no drillthrough target, so it is not read here.
 */
export const isDrillthroughPage = (p: Page): boolean => p.bindingType === "Drillthrough";

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
 * the input slicer, and `filterSlicer`. A slicer from AppSource is a custom visual, not one of
 * them; it is known by the saved selection it carries instead (`slicerSelection`).
 */
const SLICER_TYPES = new Set([
  "slicer",
  "advancedSlicerVisual",
  "listSlicer",
  "textSlicer",
  "filterSlicer",
]);

/**
 * Whether the visual is one of Microsoft's slicers. The Slicers fact counts these, selection or
 * not, and only these, so clearing a selection never changes its count. A custom slicer from
 * AppSource is known by the saved selection it carries (`slicerSelection`) rather than by a list of
 * type names, so the fact names it among the saved selections instead.
 */
export const isSlicer = (v: Visual): boolean => SLICER_TYPES.has(v.type);

/**
 * SLICER_SELECTION_SAVED's condition, which the Slicers fact shares: the pointer of a visual's
 * saved selection, the first `general` entry whose `filter` holds a `Where` with a condition in
 * it, or undefined when the visual opens with nothing selected. It is read on any visual type, by
 * where the selection sits rather than by a list of types: every catalog slicer keeps its
 * selection there, custom slicers from AppSource keep theirs in the same place, and in
 * Desktop-saved files every visual type that carries `general.filter` is a filtering visual. A
 * slicer's `filterConfig` entries are Filters pane filters, never the selection, and Select all
 * writes no filter, even in inverted selection mode.
 */
export function slicerSelection(v: Visual): string | undefined {
  if (!isRecord(v.json) || !isRecord(v.json.visual)) return undefined;
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
  /** The page that name resolves to; absent when no page read has that name. */
  page?: Page;
  /**
   * Set when no page read has that name but the page.json in the folder of that name could not be
   * read (`Report.unreadPages`): the page is there, and what its page.json says is not known.
   */
  unread?: true;
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
  if (name !== undefined) {
    const page = r.pages.find((p) => p.id === name);
    return {
      by: landingPageName !== undefined ? "landing" : "active",
      name,
      page,
      ...(page === undefined && r.unreadPages.includes(name) ? { unread: true as const } : {}),
    };
  }
  const first = r.pages[0];
  return first === undefined ? undefined : { by: "first", name: first.id, page: first };
}

/**
 * OPENING_PAGE_INVALID's condition, which the Opens on fact shares: a landing page that names no
 * page, or, with no landing page, an active page that names no page or a hidden one. A hidden
 * landing page is a supported design, since readers always open on it; a hidden active page is a
 * report saved while on a helper page. A page whose page.json could not be read is neither
 * missing nor known to be hidden, so it is not invalid.
 */
export const openingPageInvalid = (o: OpeningPage | undefined): boolean =>
  o !== undefined &&
  o.by !== "first" &&
  (o.page === undefined ? o.unread === undefined : o.by === "active" && isHiddenPage(o.page));

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
