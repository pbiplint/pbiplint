import type { LintFile } from "../engine/lint.js";
import type { Diagnostic } from "../project/types.js";
import { lineOfPointer, newerMajor, newerThan, readJson, schemaFamilyOf } from "./json.js";
import { collectFieldRefs, escapePointer } from "./refs.js";
import type {
  Bookmark,
  DatasetReference,
  Page,
  Report,
  ReportFilter,
  ReportMeasure,
  Visual,
  VisualAction,
  VisualField,
} from "./types.js";

/**
 * The newest version Microsoft publishes of each schema family this reader reads (in
 * github.com/microsoft/json-schemas, under fabric/item/report/definition). A file on a newer minor
 * or patch version is read as that family's known shape without a notice: Power BI Desktop saves
 * versions Microsoft has not published, such as visualContainer 2.10.0 to 2.12.0. Only a newer
 * major version, which may change the shape, is a diagnostic, so nobody mistakes what pbiplint
 * could not know for clean. Unknown properties are ignored either way.
 */
export const KNOWN_SCHEMAS: Readonly<Record<string, string>> = {
  report: "3.3.0",
  page: "2.1.0",
  visualContainer: "2.9.0",
  pagesMetadata: "1.1.0",
  bookmarksMetadata: "1.0.0",
  bookmark: "2.1.0",
  reportExtension: "1.0.0",
  visualContainerMobileState: "2.4.0",
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

/**
 * A formatting property's literal value with its quotes removed: `'Total Sales'` is `Total Sales`
 * (a doubled quote inside is one quote), `true` stays `true`, `18D` stays `18D`. Undefined when
 * the property is missing or is bound to an expression rather than a literal.
 */
export function literal(prop: unknown): string | undefined {
  if (!isRecord(prop) || !isRecord(prop.expr) || !isRecord(prop.expr.Literal)) return undefined;
  const v = prop.expr.Literal.Value;
  if (typeof v !== "string") return undefined;
  return v.length >= 2 && v.startsWith("'") && v.endsWith("'")
    ? v.slice(1, -1).replace(/''/g, "'")
    : v;
}

/** True when the property is an expression that is not a literal, such as a measure binding. */
const isBoundExpression = (prop: unknown): boolean =>
  isRecord(prop) && isRecord(prop.expr) && !("Literal" in prop.expr);

/**
 * The property that holds each action type's destination, keyed by the type in lower case, since
 * the type is matched without regard to case. Microsoft's capability data spells the types
 * `PageNavigation`, `Drillthrough`, `Bookmark`, `WebUrl`, and `Qna`; the others name no target.
 */
const ACTION_TARGETS: ReadonlyMap<string, string> = new Map([
  ["pagenavigation", "navigationSection"],
  ["drillthrough", "drillthroughSection"],
  ["bookmark", "bookmark"],
  ["weburl", "webUrl"],
  ["qna", "qna"],
]);

/** `annotations: [{ name, value }]` as the record every Ignorable carries. */
function annotationsOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(v)) return out;
  for (const a of v)
    if (isRecord(a) && typeof a.name === "string")
      out[a.name] = typeof a.value === "string" ? a.value : JSON.stringify(a.value ?? "");
  return out;
}

function filtersOf(filterConfig: unknown, file: string, pointer: string): ReportFilter[] {
  if (!isRecord(filterConfig) || !Array.isArray(filterConfig.filters)) return [];
  return filterConfig.filters.flatMap((f, i): ReportFilter[] => {
    if (!isRecord(f)) return [];
    const p = `${pointer}/filters/${i}`;
    const field = collectFieldRefs(f.field, `${p}/field`)[0];
    return [
      {
        name: str(f.name) ?? String(i),
        type: str(f.type),
        ...(field ? { field } : {}),
        refs: collectFieldRefs(f, p),
        applied: isRecord(f.filter),
        file,
        pointer: p,
      },
    ];
  });
}

/** The `datasetReference` of a read definition.pbir: which model the report reads, and how. */
export function datasetReferenceOf(json: unknown): DatasetReference {
  const ref = isRecord(json) && isRecord(json.datasetReference) ? json.datasetReference : undefined;
  if (!ref) return { kind: "none" };
  if (isRecord(ref.byPath) && typeof ref.byPath.path === "string")
    return { kind: "byPath", path: ref.byPath.path };
  if (isRecord(ref.byConnection)) return { kind: "byConnection" };
  return { kind: "none" };
}

function readReportJson(
  report: Report,
  file: string,
  text: string,
  json: Record<string, unknown>,
  version?: string,
): void {
  report.file = file;
  report.text = text;
  report.schemaVersion = version;
  report.schemaVersions.report = version;
  const themes = isRecord(json.themeCollection) ? json.themeCollection : {};
  const custom = isRecord(themes.customTheme) ? str(themes.customTheme.name) : undefined;
  const base = isRecord(themes.baseTheme) ? str(themes.baseTheme.name) : undefined;
  report.themeName = custom ?? base;
  report.publicCustomVisuals = Array.isArray(json.publicCustomVisuals)
    ? json.publicCustomVisuals.filter((v): v is string => typeof v === "string")
    : [];
  const pane =
    isRecord(json.objects) &&
    Array.isArray(json.objects.outspacePane) &&
    isRecord(json.objects.outspacePane[0]) &&
    isRecord(json.objects.outspacePane[0].properties)
      ? json.objects.outspacePane[0].properties
      : {};
  const bool = (v: string | undefined): boolean | undefined =>
    v === "true" ? true : v === "false" ? false : undefined;
  report.filtersPane = {
    expanded: bool(literal(pane.expanded)),
    visible: bool(literal(pane.visible)),
    hiddenInEditMode:
      isRecord(json.settings) && typeof json.settings.filterPaneHiddenInEditMode === "boolean"
        ? json.settings.filterPaneHiddenInEditMode
        : undefined,
  };
  report.filters = filtersOf(json.filterConfig, file, "/filterConfig");
}

function buildPage(
  id: string,
  file: string,
  text: string,
  json: Record<string, unknown>,
  version?: string,
): Page {
  const binding = isRecord(json.pageBinding) ? json.pageBinding : undefined;
  return {
    id: str(json.name) ?? id,
    displayName: str(json.displayName) ?? id,
    file,
    text,
    json,
    width: num(json.width),
    height: num(json.height),
    displayOption: str(json.displayOption),
    visibility: str(json.visibility),
    type: str(json.type),
    bindingType: binding ? str(binding.type) : undefined,
    bindingRefs: binding ? collectFieldRefs(binding.parameters, "/pageBinding/parameters") : [],
    filters: filtersOf(json.filterConfig, file, "/filterConfig"),
    visuals: [],
    annotations: annotationsOf(json.annotations),
    schemaVersion: version,
  };
}

/** A page whose page.json is missing or unreadable, so its visuals still have a page to name. */
const stubPage = (id: string): Page => ({
  id,
  displayName: id,
  file: `definition/pages/${id}/page.json`,
  text: "",
  json: undefined,
  bindingRefs: [],
  filters: [],
  visuals: [],
  annotations: {},
});

/** A projection's `field` and what lies beneath it, which is exactly what a visual's `fields` read. */
const PROJECTION_FIELD = /^\/visual\/query\/queryState\/[^/]+\/projections\/\d+\/field(\/|$)/;

/**
 * Whether a reference at this pointer in visual.json is already read into the visual's `fields` or
 * `filters`. Everything else, a field parameter in a role included, is a property reference.
 */
const readElsewhere = (pointer: string): boolean =>
  PROJECTION_FIELD.test(pointer) ||
  pointer === "/filterConfig" ||
  pointer.startsWith("/filterConfig/");

function buildVisual(
  page: Page,
  id: string,
  file: string,
  text: string,
  json: Record<string, unknown>,
  version: string | undefined,
  hasMobileLayout: boolean,
): Visual {
  const pos = isRecord(json.position) ? json.position : {};
  const visual = isRecord(json.visual) ? json.visual : {};
  const query =
    isRecord(visual.query) && isRecord(visual.query.queryState) ? visual.query.queryState : {};
  const fields: VisualField[] = [];
  const showAllRoles: string[] = [];
  let projectionCount = 0;
  for (const [role, state] of Object.entries(query)) {
    if (!isRecord(state)) continue;
    if (state.showAll === true) showAllRoles.push(role);
    if (!Array.isArray(state.projections)) continue;
    state.projections.forEach((proj, i) => {
      if (!isRecord(proj)) return;
      projectionCount++;
      const pointer = `/visual/query/queryState/${escapePointer(role)}/projections/${i}/field`;
      for (const ref of collectFieldRefs(proj.field, pointer)) fields.push({ role, ref });
    });
  }
  const vco = isRecord(visual.visualContainerObjects) ? visual.visualContainerObjects : {};
  const properties = (entry: unknown): Record<string, unknown> | undefined =>
    isRecord(entry) && isRecord(entry.properties) ? entry.properties : undefined;
  /** The alt text in a `general` array: a literal that is not empty, or "(expression)" when bound. */
  const altTextIn = (general: unknown): string | undefined => {
    let found: string | undefined;
    if (Array.isArray(general))
      for (const entry of general) {
        const props = properties(entry);
        if (!props || !("altText" in props)) continue;
        const value = literal(props.altText);
        if (value !== undefined && value !== "") found = value;
        else if (isBoundExpression(props.altText)) found = "(expression)";
      }
    return found;
  };
  // A group's container has no `visual`; the group keeps its own alt text in its own objects.
  const group = isRecord(json.visualGroup) ? json.visualGroup : undefined;
  const altText = group
    ? altTextIn(isRecord(group.objects) ? group.objects.general : undefined)
    : altTextIn(vco.general);
  const actions: VisualAction[] = [];
  if (Array.isArray(vco.visualLink))
    vco.visualLink.forEach((entry, i) => {
      const props = properties(entry);
      const type = props ? literal(props.type) : undefined;
      if (!props || type === undefined) return;
      const at = `/visual/visualContainerObjects/visualLink/${i}/properties`;
      // Only the type's own property: one another type left behind is not the destination.
      const key = ACTION_TARGETS.get(type.toLowerCase());
      const prop = key === undefined ? undefined : props[key];
      const target = literal(prop);
      actions.push({
        type,
        on: literal(props.show) !== "false",
        ...(target ? { target } : {}),
        ...(isBoundExpression(prop) ? { conditional: true as const } : {}),
        pointer: prop === undefined ? at : `${at}/${key}`,
      });
    });
  const title = Array.isArray(vco.title) ? literal(properties(vco.title[0])?.text) : undefined;
  const propertyRefs = collectFieldRefs(json).filter((r) => !readElsewhere(r.pointer));
  return {
    id: str(json.name) ?? id,
    page,
    file,
    text,
    json,
    type: str(visual.visualType) ?? (group ? "visualGroup" : "unknown"),
    position: {
      x: num(pos.x) ?? 0,
      y: num(pos.y) ?? 0,
      z: num(pos.z) ?? 0,
      width: num(pos.width) ?? 0,
      height: num(pos.height) ?? 0,
      ...(num(pos.tabOrder) !== undefined ? { tabOrder: num(pos.tabOrder) } : {}),
    },
    isHidden: json.isHidden === true,
    isGroup: group !== undefined,
    ...(str(json.parentGroupName) !== undefined ? { groupId: str(json.parentGroupName) } : {}),
    ...(group && str(group.displayName) !== undefined
      ? { displayName: str(group.displayName) }
      : {}),
    ...(title !== undefined ? { title } : {}),
    ...(altText !== undefined ? { altText } : {}),
    fields,
    projectionCount,
    propertyRefs,
    showAllRoles,
    filters: filtersOf(json.filterConfig, file, "/filterConfig"),
    actions,
    hasMobileLayout,
    annotations: annotationsOf(json.annotations),
    schemaVersion: version,
  };
}

function buildBookmark(
  id: string,
  file: string,
  text: string,
  json: Record<string, unknown>,
): Bookmark {
  const state = isRecord(json.explorationState) ? json.explorationState : {};
  const sections = isRecord(state.sections) ? state.sections : {};
  const visuals: Bookmark["visuals"] = [];
  for (const [page, section] of Object.entries(sections))
    if (isRecord(section) && isRecord(section.visualContainers))
      for (const visual of Object.keys(section.visualContainers))
        visuals.push({
          page,
          visual,
          pointer: `/explorationState/sections/${escapePointer(page)}/visualContainers/${escapePointer(visual)}`,
        });
  return {
    id: str(json.name) ?? id,
    displayName: str(json.displayName) ?? id,
    file,
    text,
    ...(str(state.activeSection) !== undefined ? { activePage: str(state.activeSection) } : {}),
    pages: Object.keys(sections),
    visuals,
    refs: collectFieldRefs(state, "/explorationState"),
  };
}

function readExtensions(
  file: string,
  text: string,
  json: Record<string, unknown>,
): ReportMeasure[] {
  const out: ReportMeasure[] = [];
  if (!Array.isArray(json.entities)) return out;
  json.entities.forEach((entity, ei) => {
    if (!isRecord(entity) || typeof entity.name !== "string" || !Array.isArray(entity.measures))
      return;
    // Held outside the inner closure, which the narrowing of a parameter's property does not reach.
    const table = entity.name;
    entity.measures.forEach((m, mi) => {
      if (!isRecord(m) || typeof m.name !== "string") return;
      out.push({
        table,
        name: m.name,
        expression: str(m.expression) ?? "",
        hidden: m.hidden === true,
        file,
        line: lineOfPointer(text, `/entities/${ei}/measures/${mi}`),
      });
    });
  });
  return out;
}

const PAGE_FILE = /^definition\/pages\/([^/]+)\/page\.json$/;
const VISUAL_FILE = /^definition\/pages\/([^/]+)\/visuals\/([^/]+)\/visual\.json$/;
const MOBILE_FILE = /^definition\/pages\/([^/]+)\/visuals\/([^/]+)\/mobile\.json$/;
const BOOKMARK_FILE = /^definition\/bookmarks\/([^/]+)\.bookmark\.json$/;
/** The files under definition/ that Learn's PBIR folder table names, besides the four above. */
const DEFINITION_FILES: ReadonlySet<string> = new Set([
  "definition/version.json",
  "definition/report.json",
  "definition/reportExtensions.json",
  "definition/pages/pages.json",
  "definition/bookmarks/bookmarks.json",
]);

/**
 * Whether the PBIR format defines the file: definition.pbir, the report's .platform, the project's
 * .pbip, and the files Learn's PBIR folder table names under definition/. Microsoft publishes a
 * schema for each, with an object root; any other JSON under definition/ is the author's own.
 */
const definedByPbir = (path: string): boolean =>
  path.endsWith("definition.pbir") ||
  path.endsWith(".platform") ||
  path.endsWith(".pbip") ||
  DEFINITION_FILES.has(path) ||
  [PAGE_FILE, VISUAL_FILE, MOBILE_FILE, BOOKMARK_FILE].some((re) => re.test(path));

/**
 * Builds the report object model from the report's files (paths relative to the .Report folder).
 * Unknown properties are ignored, every schema version seen is read the same way, a file that
 * cannot be read is an issue and the rest still builds. Pages come out in pageOrder, matched on
 * each page.json's `name`, then any page the header does not list, by folder; visuals in file
 * order within a page.
 */
export function buildReport(files: LintFile[]): { report: Report; diagnostics: Diagnostic[] } {
  const report: Report = {
    publicCustomVisuals: [],
    filtersPane: {},
    filters: [],
    pagesHeader: { pageOrder: [] },
    pages: [],
    bookmarksHeader: { items: [] },
    bookmarks: [],
    measures: [],
    extensions: "absent",
    datasetReference: { kind: "none" },
    files: [],
    issues: [],
    schemaVersions: {},
  };
  const diagnostics: Diagnostic[] = [];
  const reportedFamilies = new Set<string>();
  const pagesByFolder = new Map<string, Page>();
  const visuals: {
    pageId: string;
    id: string;
    file: string;
    text: string;
    json: Record<string, unknown>;
    version?: string;
  }[] = [];
  const mobile = new Set<string>();
  const highest = (current: string | undefined, seen: string | undefined): string | undefined =>
    seen === undefined
      ? current
      : current === undefined || newerThan(seen, current)
        ? seen
        : current;

  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path, "en"))) {
    report.files.push(f.path);
    // Unread until it parses to an object below, so a file that fails on the way is not taken
    // for one that defines no measures.
    if (f.path === "definition/reportExtensions.json") report.extensions = "unread";
    const read = readJson(f.path, f.text, { objectRoot: definedByPbir(f.path) });
    report.issues.push(...read.issues);
    if (read.json === undefined) continue;
    const family = schemaFamilyOf(read.schema);
    const version = read.schemaVersion;
    if (
      family &&
      version &&
      // An own property only: a family named `constructor` or `toString` is not a known one.
      Object.hasOwn(KNOWN_SCHEMAS, family) &&
      newerMajor(version, KNOWN_SCHEMAS[family]!) &&
      !reportedFamilies.has(family)
    ) {
      reportedFamilies.add(family);
      diagnostics.push({
        kind: "schema-newer-than-known",
        path: f.path,
        message: `${f.path} uses ${family} schema ${version}, a newer major version than the ${KNOWN_SCHEMAS[family]} this version of pbiplint knows; properties it does not know are ignored`,
      });
    }
    const json = read.json;
    if (f.path.endsWith("definition.pbir")) {
      report.datasetReference = datasetReferenceOf(json);
      continue;
    }
    // Only a file the PBIR format does not define can hold something other than an object here,
    // and nothing below reads one.
    if (!isRecord(json)) continue;
    let m: RegExpExecArray | null;
    if (f.path.endsWith(".platform")) {
      if (isRecord(json.metadata) && json.metadata.type === "Report")
        report.displayName = str(json.metadata.displayName);
    } else if (f.path === "definition/report.json") {
      readReportJson(report, f.path, f.text, json, version);
    } else if (f.path === "definition/pages/pages.json") {
      report.pagesHeader = {
        file: f.path,
        text: f.text,
        pageOrder: Array.isArray(json.pageOrder)
          ? json.pageOrder.filter((p): p is string => typeof p === "string")
          : [],
        ...(str(json.activePageName) !== undefined
          ? { activePageName: str(json.activePageName) }
          : {}),
        ...(str(json.landingPageName) !== undefined
          ? { landingPageName: str(json.landingPageName) }
          : {}),
      };
    } else if ((m = PAGE_FILE.exec(f.path))) {
      const page = buildPage(m[1]!, f.path, f.text, json, version);
      pagesByFolder.set(m[1]!, page);
      report.schemaVersions.page = highest(report.schemaVersions.page, version);
    } else if ((m = VISUAL_FILE.exec(f.path))) {
      visuals.push({ pageId: m[1]!, id: m[2]!, file: f.path, text: f.text, json, version });
      report.schemaVersions.visual = highest(report.schemaVersions.visual, version);
    } else if ((m = MOBILE_FILE.exec(f.path))) {
      mobile.add(`${m[1]}/${m[2]}`);
    } else if (f.path === "definition/bookmarks/bookmarks.json") {
      report.bookmarksHeader = {
        file: f.path,
        items: Array.isArray(json.items)
          ? json.items.flatMap((item) =>
              isRecord(item) && typeof item.name === "string"
                ? [
                    {
                      name: item.name,
                      // A group lists its bookmarks by name (bookmarksMetadata 1.0.0).
                      children: Array.isArray(item.children)
                        ? item.children.filter((c): c is string => typeof c === "string")
                        : [],
                    },
                  ]
                : [],
            )
          : [],
      };
    } else if ((m = BOOKMARK_FILE.exec(f.path))) {
      report.bookmarks.push(buildBookmark(m[1]!, f.path, f.text, json));
    } else if (f.path === "definition/reportExtensions.json") {
      report.extensions = "read";
      report.measures.push(...readExtensions(f.path, f.text, json));
    }
  }
  for (const v of visuals) {
    let page = pagesByFolder.get(v.pageId);
    if (!page) {
      page = stubPage(v.pageId);
      pagesByFolder.set(v.pageId, page);
    }
    page.visuals.push(
      buildVisual(page, v.id, v.file, v.text, v.json, v.version, mobile.has(`${v.pageId}/${v.id}`)),
    );
  }
  // pageOrder names a page by its page.json `name`, as bookmarks and actions do. A rename can set
  // the name apart from the folder (Learn: Desktop keeps the folder), which only joins a
  // visual.json to its page, above.
  const byFolder = [...pagesByFolder.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([, page]) => page);
  const listed = new Set<Page>();
  for (const name of report.pagesHeader.pageOrder) {
    const page = byFolder.find((p) => p.id === name && !listed.has(p));
    if (page) listed.add(page);
  }
  report.pages = [...listed, ...byFolder.filter((p) => !listed.has(p))];
  return { report, diagnostics };
}
