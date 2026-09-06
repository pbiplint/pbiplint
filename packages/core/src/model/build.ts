import { unquoteName } from "../tmdl/quote.js";
import type { ParsedFile, TmdlNode } from "../tmdl/types.js";
import type {
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
    dataCategory: str(p.datacategory),
    expression: c.value,
    variations,
    hasAlternateOf: c.children.some((ch) => ch.type === "alternateof"),
  };
}

function buildMeasure(x: TmdlNode, table: Table): Measure {
  const p = x.props;
  return {
    ...named(x),
    table,
    expression: x.value ?? "",
    formatString: str(p.formatstring),
    formatStringDefinition: str(p.formatstringdefinition),
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
    else if (c.type === "calculationgroup") t.calculationGroup = buildCalculationGroup(c, t);
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

export function buildModel(files: ParsedFile[]): Model {
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
  };
  for (const f of files) {
    for (const r of f.roots) {
      if (r.kind === "ref" || r.kind === "prop" || r.kind === "expr") continue;
      switch (r.type) {
        case "model":
          Object.assign(model, named(r, r.name ?? "Model"), {
            annotations: { ...model.annotations, ...annotationsOf(r) },
            props: r.props,
          });
          break;
        case "annotation":
          if (r.name) model.annotations[r.name] = r.value ?? "";
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
          break; // database, queryGroup, extendedProperty, unknown: kept in files, not modeled
      }
    }
  }
  finalizeKinds(model);
  return model;
}
