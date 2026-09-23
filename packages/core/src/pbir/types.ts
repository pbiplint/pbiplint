import type { ParseIssue } from "../tmdl/types.js";

/** One reference to a model or report field, resolved to the table and name it carries in the JSON. */
export interface FieldRef {
  kind: "column" | "measure" | "hierarchyLevel" | "aggregation";
  table: string;
  name: string;
  level?: string;
  pointer: string;
}

/** One entry of a filter container, on the report, a page, or a visual. */
export interface ReportFilter {
  name: string;
  type?: string;
  field?: FieldRef;
  refs: FieldRef[];
  /** True when the entry carries a `filter` object, that is, a condition is set; a slicer with no selection has none. */
  applied: boolean;
  file: string;
  pointer: string;
}

/** One action a visual carries, such as a drillthrough or a page navigation on a button. */
export interface VisualAction {
  type: string;
  target?: string;
  pointer: string;
}

/** One field bound to one of a visual's roles, such as Category or Y. */
export interface VisualField {
  role: string;
  ref: FieldRef;
}

/** One visual, read from its visual.json, with the page it sits on. */
export interface Visual {
  id: string;
  page: Page;
  file: string;
  text: string;
  json: unknown;
  type: string;
  position: { x: number; y: number; z: number; width: number; height: number; tabOrder?: number };
  isHidden: boolean;
  isGroup: boolean;
  groupId?: string;
  title?: string;
  /**
   * The alt text literal, or "(expression)" when it is bound to a measure or aggregation. A
   * group's is its own, read from `visualGroup.objects` rather than the visual's container objects.
   */
  altText?: string;
  fields: VisualField[];
  /**
   * The entries in the `projections` arrays of the visual's roles, one per field in a well: a
   * column, a measure, a visual calculation, a sparkline, or an arithmetic expression is one entry
   * however many field references it holds (a visual calculation holds none), and a field bound in
   * two roles is two.
   */
  projectionCount: number;
  /**
   * Every field reference in visual.json outside the wells' projections and the filters: a role's
   * field parameters, formatting, conditional formatting, reference labels, a bound title or alt
   * text, sort, expansion states, a group's own objects, and any property Desktop adds later. Read
   * from the whole file, so a new property is covered without a code change.
   */
  propertyRefs: FieldRef[];
  showAllRoles: string[];
  filters: ReportFilter[];
  actions: VisualAction[];
  hasMobileLayout: boolean;
  annotations: Record<string, string>;
  schemaVersion?: string;
}

/** One page, read from its page.json, with the visuals beneath it. */
export interface Page {
  id: string;
  displayName: string;
  file: string;
  text: string;
  json: unknown;
  width?: number;
  height?: number;
  displayOption?: string;
  visibility?: string;
  bindingType?: string;
  bindingRefs: FieldRef[];
  filters: ReportFilter[];
  visuals: Visual[];
  annotations: Record<string, string>;
  schemaVersion?: string;
}

/** The pages folder's own pages.json: the order of the pages and which one opens. */
export interface PagesHeader {
  file?: string;
  /** The text of that pages.json, so a finding about the opening page can point at its line. */
  text?: string;
  pageOrder: string[];
  activePageName?: string;
  landingPageName?: string;
}

/** One bookmark, read from its bookmark.json, with what it captures. */
export interface Bookmark {
  id: string;
  displayName: string;
  file: string;
  text: string;
  activePage?: string;
  pages: string[];
  visuals: { page: string; visual: string }[];
  refs: FieldRef[];
  annotations: Record<string, string>;
}

/** The bookmarks folder's own bookmarks.json: the order of the bookmarks and their groups. */
export interface BookmarksHeader {
  file?: string;
  items: { name: string; children: string[] }[];
}

/** One report-level measure, defined in the report rather than in the model. */
export interface ReportMeasure {
  table: string;
  name: string;
  expression: string;
  hidden: boolean;
  file: string;
  line: number;
  annotations: Record<string, string>;
}

/** How the report names the semantic model it reads, or that it names none. */
export type DatasetReference =
  { kind: "byPath"; path: string } | { kind: "byConnection" } | { kind: "none" };

/** The report layer of one run: everything the PBIR reader found, in the order the files declare it. */
export interface Report {
  file?: string;
  /** The text of that report.json, so a report-level finding can point at a line within it. */
  text?: string;
  displayName?: string;
  schemaVersion?: string;
  themeName?: string;
  publicCustomVisuals: string[];
  filtersPane: { expanded?: boolean; visible?: boolean; hiddenInEditMode?: boolean };
  filters: ReportFilter[];
  pagesHeader: PagesHeader;
  pages: Page[];
  bookmarksHeader: BookmarksHeader;
  bookmarks: Bookmark[];
  measures: ReportMeasure[];
  datasetReference: DatasetReference;
  files: string[];
  issues: ParseIssue[];
  schemaVersions: { report?: string; page?: string; visual?: string };
}
