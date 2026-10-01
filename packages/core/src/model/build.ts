import { unquoteName } from "../tmdl/quote.js";
import type { ParsedFile, TmdlNode } from "../tmdl/types.js";
import type {
  AlternateOf,
  Calendar,
  CalculationGroup,
  CalculationItem,
  Column,
  DataSource,
  Hierarchy,
  Level,
  Measure,
  Model,
  Named,
  Partition,
  Perspective,
  Relationship,
  Role,
  SourceLocation,
  Table,
  TablePermission,
  Variation,
} from "./types.js";

const str = (v: string | true | undefined): string | undefined =>
  typeof v === "string" ? v : undefined;
const flag = (v: string | true | undefined): boolean =>
  v === true || (typeof v === "string" && v.toLowerCase() === "true");
const lower = (v: string | true | undefined): string | undefined => str(v)?.toLowerCase();
const loc = (n: TmdlNode): SourceLocation => ({ file: n.file, line: n.line });
const objects = (n: TmdlNode, type: string): TmdlNode[] =>
  n.children.filter((c) => c.kind === "object" && c.type === type);

function annotationsOf(n: TmdlNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of objects(n, "annotation")) out[c.name!] = c.value ?? "";
  return out;
}

function named(n: TmdlNode, name = n.name ?? ""): Named {
  return {
    name,
    description: n.description,
    annotations: annotationsOf(n),
    location: loc(n),
    node: n,
  };
}

/** Split `Table.Column` or `'Some Table'.'Some Column'` into its unquoted parts. */
export function splitQualifiedName(ref: string): { table: string; column: string } {
  const m = /^('(?:[^']|'')*'|[^.]+)\.('(?:[^']|'')*'|.+)$/.exec(ref.trim());
  return m
    ? { table: unquoteName(m[1]!), column: unquoteName(m[2]!) }
    : { table: "", column: unquoteName(ref) };
}

/**
 * A column's `alternateOf` block. A qualified `baseColumn` is split into its table and column; a
 * bare one is a column of the block's `baseTable`.
 */
function readAlternateOf(c: TmdlNode): AlternateOf | undefined {
  const block = c.children.find((ch) => ch.type === "alternateof");
  if (!block) return undefined;
  const baseTable = str(block.props.basetable);
  const baseColumn = str(block.props.basecolumn);
  const qualified = baseColumn === undefined ? undefined : splitQualifiedName(baseColumn);
  return {
    summarization: lower(block.props.summarization),
    baseTable: qualified?.table || (baseTable === undefined ? undefined : unquoteName(baseTable)),
    baseColumn: qualified?.column,
  };
}

function buildColumn(c: TmdlNode, table: Table): Column {
  const p = c.props;
  const variations: Variation[] = objects(c, "variation").map((v) => {
    const dc = str(v.props.defaultcolumn);
    return {
      name: v.name!,
      relationship: str(v.props.relationship),
      defaultHierarchy: str(v.props.defaulthierarchy),
      defaultColumn: dc ? splitQualifiedName(dc) : undefined,
    };
  });
  const sortBy = str(p.sortbycolumn);
  const groupByColumns = c.children
    .filter((ch) => ch.type === "relatedcolumndetails")
    .flatMap((d) => d.children.filter((g) => g.kind === "prop" && g.type === "groupbycolumn"))
    .flatMap((g) => (g.value === undefined ? [] : [unquoteName(g.value)]));
  const alternateOf = readAlternateOf(c);
  return {
    ...named(c),
    table,
    kind: "data",
    dataType: str(p.datatype),
    isHidden: flag(p.ishidden),
    isKey: flag(p.iskey),
    isAvailableInMdx: p.isavailableinmdx === undefined ? true : flag(p.isavailableinmdx),
    formatString: str(p.formatstring),
    summarizeBy: str(p.summarizeby),
    sourceColumn: str(p.sourcecolumn),
    sortByColumn: sortBy === undefined ? undefined : unquoteName(sortBy),
    groupByColumns,
    dataCategory: str(p.datacategory),
    expression: c.value,
    variations,
    alternateOf,
    hasAlternateOf: alternateOf !== undefined,
  };
}

function buildMeasure(x: TmdlNode, table: Table): Measure {
  const p = x.props;
  const kpi = x.children.find((c) => c.type === "kpi")?.props;
  return {
    ...named(x),
    table,
    expression: x.value ?? "",
    formatString: str(p.formatstring),
    formatStringDefinition: str(p.formatstringdefinition),
    kpiExpressions:
      kpi &&
      [kpi.targetexpression, kpi.statusexpression, kpi.trendexpression]
        .map(str)
        .filter((e): e is string => e !== undefined),
    isHidden: flag(p.ishidden),
    displayFolder: str(p.displayfolder),
  };
}

function buildPartition(pt: TmdlNode, table: Table): Partition {
  const sourceNode = pt.children.find((ch) => ch.type === "source" && ch.kind === "flag");
  const ds = str(sourceNode?.props.datasource);
  return {
    ...named(pt),
    table,
    sourceType: (pt.value ?? "").trim().toLowerCase(),
    mode: lower(pt.props.mode),
    source: str(pt.props.source) ?? str(sourceNode?.props.query),
    dataSource: ds === undefined ? undefined : unquoteName(ds),
  };
}

function buildHierarchy(h: TmdlNode, table: Table): Hierarchy {
  const hierarchy: Hierarchy = { ...named(h), table, isHidden: flag(h.props.ishidden), levels: [] };
  for (const l of objects(h, "level")) {
    const col = str(l.props.column);
    const level: Level = {
      ...named(l),
      hierarchy,
      column: col === undefined ? undefined : unquoteName(col),
    };
    hierarchy.levels.push(level);
  }
  return hierarchy;
}

function buildCalculationGroup(cg: TmdlNode, table: Table): CalculationGroup {
  const precedence = str(cg.props.precedence);
  const group: CalculationGroup = {
    ...named(cg, table.name),
    table,
    precedence: precedence === undefined ? undefined : Number(precedence),
    items: [],
  };
  for (const ci of objects(cg, "calculationitem")) {
    const item: CalculationItem = {
      ...named(ci),
      table,
      expression: ci.value ?? "",
      formatStringDefinition: str(ci.props.formatstringdefinition),
    };
    group.items.push(item);
  }
  return group;
}

/** The prop lines under a `calendarColumnGroup` that name a column of the calendar's table. */
const CALENDAR_COLUMN_PROPS = new Set(["primarycolumn", "associatedcolumn", "column"]);

function buildCalendar(cal: TmdlNode, table: Table): Calendar {
  const columns: string[] = [];
  for (const group of cal.children)
    if (group.type === "calendarcolumngroup")
      for (const p of group.children)
        if (p.kind === "prop" && CALENDAR_COLUMN_PROPS.has(p.type) && p.value !== undefined)
          columns.push(unquoteName(p.value));
  return { ...named(cal), table, columns };
}

function buildTable(r: TmdlNode, model: Model): void {
  let t = model.tables.find((x) => x.name === r.name);
  if (!t) {
    t = {
      ...named(r),
      kind: "table",
      isHidden: flag(r.props.ishidden),
      dataCategory: str(r.props.datacategory),
      columns: [],
      measures: [],
      partitions: [],
      hierarchies: [],
      calendars: [],
    };
    model.tables.push(t);
  } else {
    // Partial declaration of an existing table: merge flags and fill blanks.
    if (flag(r.props.ishidden)) t.isHidden = true;
    t.dataCategory ??= str(r.props.datacategory);
    t.description ??= r.description;
    Object.assign(t.annotations, annotationsOf(r));
  }
  for (const c of r.children) {
    if (c.kind === "object" && c.type === "column") t.columns.push(buildColumn(c, t));
    else if (c.kind === "object" && c.type === "measure") t.measures.push(buildMeasure(c, t));
    else if (c.kind === "object" && c.type === "partition") t.partitions.push(buildPartition(c, t));
    else if (c.kind === "object" && c.type === "hierarchy")
      t.hierarchies.push(buildHierarchy(c, t));
    else if (c.kind === "object" && c.type === "calendar")
      (t.calendars ??= []).push(buildCalendar(c, t));
    else if (c.type === "calculationgroup") {
      const group = buildCalculationGroup(c, t);
      const first = t.calculationGroup;
      // A later part's block adds its items and fills blanks, as a later part of the table does.
      if (first) {
        first.precedence ??= group.precedence;
        first.description ??= group.description;
        Object.assign(first.annotations, group.annotations);
        first.items.push(...group.items);
      } else t.calculationGroup = group;
    }
  }
}

function buildRelationship(r: TmdlNode): Relationship {
  const p = r.props;
  const from = splitQualifiedName(str(p.fromcolumn) ?? "");
  const to = splitQualifiedName(str(p.tocolumn) ?? "");
  return {
    ...named(r),
    fromTable: from.table,
    fromColumn: from.column,
    toTable: to.table,
    toColumn: to.column,
    isActive: p.isactive === undefined ? true : flag(p.isactive),
    crossFilteringBehavior: lower(p.crossfilteringbehavior) ?? "onedirection",
    fromCardinality: lower(p.fromcardinality) ?? "many",
    toCardinality: lower(p.tocardinality) ?? "one",
  };
}

function buildRole(r: TmdlNode): Role {
  const role: Role = {
    ...named(r),
    modelPermission: lower(r.props.modelpermission),
    members: r.children
      .filter((c) => c.kind === "object" && c.type.endsWith("member"))
      .map((c) => ({ name: c.name! })),
    tablePermissions: [],
  };
  for (const tp of objects(r, "tablepermission")) {
    const permission: TablePermission = {
      ...named(tp),
      role,
      table: tp.name!,
      filter: tp.value,
      metadataPermission: lower(tp.props.metadatapermission),
      columnPermissions: objects(tp, "columnpermission").map((cp) => ({
        column: cp.name!,
        permission: (cp.value ?? "").trim().toLowerCase(),
      })),
    };
    role.tablePermissions.push(permission);
  }
  return role;
}

function finalizeKinds(model: Model): void {
  for (const t of model.tables) {
    if (t.calculationGroup) t.kind = "calculationGroup";
    else if (t.partitions.some((p) => p.sourceType === "calculated")) t.kind = "calculated";
    else t.kind = "table";
    for (const c of t.columns)
      c.kind =
        c.expression !== undefined
          ? "calculated"
          : t.kind === "calculated"
            ? "calculatedTable"
            : "data";
  }
}

/**
 * The order the CLI's walk meets two files in (packages/cli/src/walk.ts): each folder's entries by
 * localeCompare(…, "en"), and a folder's files where its name sorts. So paths compare segment by
 * segment: "tables/Sales.tmdl" comes before "tables.old/Sales.tmdl", though "tables.old" sorts
 * before "tables/Sales.tmdl" as a whole path. Two names that comparison calls equal ("Café" with
 * é, and with e and a combining accent) fall back to their code units, so the order never depends
 * on the order the files came in. Keep in step with the browser's walkOrder
 * (packages/web/src/input/project-files.ts), which has no such fallback.
 */
function walkOrder(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    const [x, y] = [as[i]!, bs[i]!];
    if (x !== y) return x.localeCompare(y, "en") || (x < y ? -1 : 1);
  }
  return as.length - bs.length;
}

/**
 * The model's own declarations in a parsed file, in line order: each line at its root, and each
 * line TMDL reads as if it sat there (#137), directly under a `model` at the root or under a
 * `model` under a `database` at the root, which follow that `model`
 * (https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview#indentation). A model under
 * anything else, such as a culture's translations or a TMDL script's `createOrReplace`, is not the
 * model's. The parser checks each of these lines as it checks the root (tmdl/parse.ts), so a line
 * among them that the model does not read is a parse issue. Anything that looks for where the
 * model declares something reads a file through this, as `buildModel` does.
 */
export function modelDeclarations(f: ParsedFile): TmdlNode[] {
  const declared = (n: TmdlNode): boolean => n.kind === "object" || n.kind === "flag";
  const isModel = (n: TmdlNode): boolean => n.type === "model" && declared(n);
  const out: TmdlNode[] = [];
  for (const r of f.roots) {
    out.push(r);
    const models = isModel(r)
      ? [r]
      : r.type === "database" && declared(r)
        ? r.children.filter(isModel)
        : [];
    for (const m of models) {
      if (m !== r) out.push(m);
      out.push(...m.children);
    }
  }
  return out;
}

/** One of the model's own declarations (`modelDeclarations`). */
function readDeclaration(r: TmdlNode, model: Model): void {
  if (r.kind === "ref" || r.kind === "prop" || r.kind === "expr") return;
  // Keep the cases in step with MODELED in tmdl/root-types.ts.
  switch (r.type) {
    case "model":
      readModel(r, model);
      break;
    case "annotation":
      // One with lines under it lost its tabs, as a column's annotation does, and is a parse
      // issue: its value is not the model's, and a `pbiplint.ignore` there must not quiet a rule.
      if (r.name && r.children.length === 0) model.annotations[r.name] = r.value ?? "";
      break;
    case "table":
      buildTable(r, model);
      break;
    case "relationship":
      model.relationships.push(buildRelationship(r));
      break;
    case "role":
      model.roles.push(buildRole(r));
      break;
    case "perspective": {
      const p: Perspective = {
        ...named(r),
        tables: objects(r, "perspectivetable").map((t) => t.name!),
      };
      model.perspectives.push(p);
      break;
    }
    case "cultureinfo":
      model.cultures.push(named(r));
      break;
    case "expression":
      model.expressions.push({ ...named(r), expression: r.value ?? "" });
      break;
    case "function":
      model.functions.push({ ...named(r), expression: r.value ?? "" });
      break;
    case "datasource": {
      const ds: DataSource = {
        ...named(r),
        kind: (r.value ?? "").trim().toLowerCase() === "provider" ? "provider" : "structured",
      };
      model.dataSources.push(ds);
      break;
    }
    default:
      // The other words in NOT_MODELED in tmdl/root-types.ts: kept in files, not modeled. A
      // database's model is among the declarations after it. Any other declaration of a type TMDL
      // does not declare where it sits is a parse issue.
      break;
  }
}

/**
 * A declaration of the model. TMDL lets it sit in more than one file, as a table's does, and one
 * under the database is merged with the one at the root of model.tmdl: its properties, annotations,
 * and description join the model's, and the last one read gives the model its name and place. The
 * lines under it follow it among the model's own declarations.
 */
function readModel(r: TmdlNode, model: Model): void {
  Object.assign(model, named(r, r.name ?? "Model"), {
    description: r.description ?? model.description,
    annotations: model.annotations,
    props: { ...model.props, ...r.props },
  });
}

/**
 * The model the parsed files declare, read in the order the CLI's walk meets them whatever order
 * they are given in, since that order reaches the results: a table declared in two files takes
 * the first one's place, and a bare column name resolves on the first other table that has it.
 * `unreadPaths` are the paths under the model's root the input reader could not read
 * (`LintOptions.unreadPaths`, relative to the root as a file's own path is); the model keeps each
 * `.tmdl` file and folder among them as `Model.unreadPaths`.
 */
export function buildModel(given: ParsedFile[], unreadPaths: readonly string[] = []): Model {
  const files = [...given].sort((a, b) => walkOrder(a.file, b.file));
  const model: Model = {
    name: "Model",
    annotations: {},
    location: { file: "", line: 0 },
    props: {},
    tables: [],
    relationships: [],
    roles: [],
    perspectives: [],
    cultures: [],
    expressions: [],
    functions: [],
    dataSources: [],
    files,
    unreadPaths: unreadPaths.filter((p) => p.endsWith(".tmdl") || p.endsWith("/")),
  };
  for (const f of files) for (const r of modelDeclarations(f)) readDeclaration(r, model);
  finalizeKinds(model);
  return model;
}
