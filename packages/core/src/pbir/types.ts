import type { ParseIssue } from "../tmdl/types.js";

/** One reference to a model or report field, resolved to the table and name it carries in the JSON. */
export interface FieldRef {
  kind: "column" | "measure" | "hierarchyLevel" | "aggregation";
  table: string;
  name: string;
  level?: string;
  /**
   * Set when the field's source is a date column's variation (a PropertyVariationSource), the way
   * Power BI Desktop binds its auto date/time hierarchy: `table` is the date column's table,
   * `column` the date column, and `name` the variation. The field itself (`name` above) is then
   * on the table the variation leads to, such as Desktop's local date table.
   */
  variation?: { column: string; name: string };
  /**
   * Why `table` is empty, when it is: an alias no From list in scope declares, an alias whose
   * From entry names no model table (a subquery, say), or a source that names no table at all.
   */
  noTable?: "undeclaredAlias" | "nonTableAlias" | "noSource";
  /**
   * The schema the reference names, when it names one: in the semanticQuery schema's words, "the
   * name of the schema containing the referenced entity", read from the SourceRef or from the
   * From entry its alias names. Power BI Desktop writes `"extension"` in every reference to a
   * measure defined in the report's reportExtensions.json; a reference to a model field names none.
   */
  schema?: string;
  pointer: string;
}

/** One entry of a filter container, on the report, a page, or a visual. */
export interface ReportFilter {
  name: string;
  type?: string;
  field?: FieldRef;
  refs: FieldRef[];
  /**
   * True when the entry carries a `filter` object, that is, a condition is set. A slicer's own
   * selection is not one of these: Desktop saves it in the slicer's `general` objects.
   */
  applied: boolean;
  file: string;
  pointer: string;
}

/**
 * One action a visual carries, one `visualLink` entry with a `type`, such as a page navigation or
 * a drillthrough on a button, a shape, or an image.
 */
export interface VisualAction {
  /** The type literal as written: `PageNavigation`, `Drillthrough`, `Bookmark`, `Back`, `WebUrl`, ... */
  type: string;
  /** False only when the entry's `show` literal is `false`, that is, the action is switched off. */
  on: boolean;
  /**
   * The destination, unquoted: the literal of the property that belongs to the type
   * (`navigationSection`, `drillthroughSection`, `bookmark`, `webUrl`, `qna`). Absent when that
   * property is absent, empty, or not a literal. Desktop keeps the previous type's property when
   * an author changes the type, so another type's property is never read.
   */
  target?: string;
  /** Set when that property is an expression other than a literal: a destination set by conditional formatting. */
  conditional?: true;
  /** The pointer of that property when the entry has it, else of the entry's `properties`. */
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
  /** A group's display name, as its `visualGroup` records it; a visual has none. */
  displayName?: string;
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
  /**
   * page.json's own `type`, in Microsoft's page schema the page's "specific usage": `Tooltip`,
   * "Page to be used as tooltip.", or `Drillthrough`, "Page to be used as drillthrough." It is
   * apart from `bindingType`, which is read from `pageBinding`; Desktop-saved reports mark most
   * tooltip pages by this alone, with no `pageBinding`. A stub page has none.
   */
  type?: string;
  bindingType?: string;
  bindingRefs: FieldRef[];
  filters: ReportFilter[];
  visuals: Visual[];
  /**
   * The folder names of the visuals in this page's folder whose visual.json could not be read.
   * Power BI Desktop names a visual's folder after the visual's `name` (Learn's PBIR naming
   * convention; every one of 13,026 visuals in Desktop-saved files), so these are the names of
   * visuals the page has that pbiplint could not read. Kept on the page, not the report, because a
   * visual.json is joined to its page by folder here, and a page's `name` can differ from its
   * folder after a rename.
   */
  unreadVisuals: string[];
  /**
   * Whether a mobile.json that was read sits in this page's folder, under a visual's folder, which
   * gives the page a mobile layout (decision 10). Read from the mobile.json files themselves, so a
   * mobile layout whose visual.json could not be read still counts.
   */
  hasMobileLayout: boolean;
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

/**
 * One bookmark, read from its bookmark.json, with what it captures. It carries no annotations:
 * Microsoft's bookmark schema has no place for one, so a rule on a bookmark is turned off in config.
 */
export interface Bookmark {
  id: string;
  displayName: string;
  file: string;
  text: string;
  activePage?: string;
  /** The keys of `sections`: the pages it captures. Desktop writes one, the active page. */
  pages: string[];
  /** Each `visualContainers` key of each section, with its pointer; groups are captured apart. */
  visuals: { page: string; visual: string; pointer: string }[];
  refs: FieldRef[];
}

/** The bookmarks folder's own bookmarks.json: the order of the bookmarks and their groups. */
export interface BookmarksHeader {
  file?: string;
  items: { name: string; children: string[] }[];
}

/**
 * One report-level measure, defined in the report rather than in the model. It carries no
 * annotations: pbiplint reads no ignore on a report measure, so a rule on one is turned off in
 * config.
 */
export interface ReportMeasure {
  table: string;
  name: string;
  expression: string;
  hidden: boolean;
  file: string;
  line: number;
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
  /**
   * What became of definition/reportExtensions.json: `absent` when the input holds none, `read`
   * when it parsed to an object and its measures are in `measures`, `unread` when it did not (a
   * merge conflict, invalid JSON, or a document that is not an object, which PARSE_ISSUE reports),
   * so `measures` says nothing of what the file defines.
   */
  extensions: "absent" | "read" | "unread";
  datasetReference: DatasetReference;
  files: string[];
  issues: ParseIssue[];
  /**
   * The files under definition/ that the PBIR format defines and that could not be read (a merge
   * conflict, invalid JSON, or a document that is not an object, each a PARSE_ISSUE), in path
   * order. Whatever such a file says is missing from this report, so a rule whose findings depend
   * on one is skipped while it is listed, through the predicate its `skipWhenUnread` names.
   * definition.pbir, the .platform, and the .pbip are not part of the definition folder, and a
   * JSON file of the author's own is not part of the report, so none of them is listed.
   */
  unreadDefinitionFiles: string[];
  /**
   * The folder names of the pages whose page.json could not be read. Desktop names a page's folder
   * after its `name` (713 of 714 pages in Desktop-saved files; a rename by hand keeps the folder),
   * so a rule that looks a page up by name reads this before it says no such page exists. A page
   * of these with a visual that was read is also in `pages`, as a stub named by its folder.
   */
  unreadPages: string[];
  /**
   * The names of the bookmarks whose bookmark file could not be read, from the file name
   * `<name>.bookmark.json`, which Desktop gives every bookmark (576 of 576 in Desktop-saved files).
   */
  unreadBookmarks: string[];
  schemaVersions: { report?: string; page?: string; visual?: string };
}
