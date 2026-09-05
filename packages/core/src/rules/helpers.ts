import { columnRef, measureRef, relationshipName, tableRef } from "../model/names.js";
import type {
  CalculationItem,
  Column,
  DataSource,
  Hierarchy,
  Level,
  Measure,
  Model,
  NamedExpression,
  Partition,
  Perspective,
  Relationship,
  Role,
  Table,
  TablePermission,
} from "../model/types.js";
import type { ObjectType, RuleFinding } from "./types.js";

export const allColumns = (m: Model): Column[] => m.tables.flatMap((t) => t.columns);
export const allMeasures = (m: Model): Measure[] => m.tables.flatMap((t) => t.measures);
export const allPartitions = (m: Model): Partition[] => m.tables.flatMap((t) => t.partitions);
export const allHierarchies = (m: Model): Hierarchy[] => m.tables.flatMap((t) => t.hierarchies);
export const allLevels = (m: Model): Level[] => allHierarchies(m).flatMap((h) => h.levels);
export const allCalculationItems = (m: Model): CalculationItem[] =>
  m.tables.flatMap((t) => t.calculationGroup?.items ?? []);
export const allTablePermissions = (m: Model): TablePermission[] =>
  m.roles.flatMap((r) => r.tablePermissions);

export const dataType = (c: Column): string => (c.dataType ?? "").toLowerCase();
export const isNumericType = (c: Column): boolean =>
  ["int64", "decimal", "double"].includes(dataType(c));
export const hiddenOrTableHidden = (c: Column): boolean => c.isHidden || c.table.isHidden;
export const isBlank = (s: string | undefined): boolean => s === undefined || s.trim() === "";
/** Tabular Editor labels a table by its first partition's mode; DirectQuery tables are what several rules test for. */
export const isDirectQueryTable = (t: Table): boolean =>
  t.kind === "table" && t.partitions[0]?.mode === "directquery";

export const tableObjectType = (t: Table): ObjectType =>
  t.kind === "calculated"
    ? "CalculatedTable"
    : t.kind === "calculationGroup"
      ? "CalculationGroupTable"
      : "Table";
export const columnObjectType = (c: Column): ObjectType =>
  c.kind === "calculated"
    ? "CalculatedColumn"
    : c.kind === "calculatedTable"
      ? "CalculatedTableColumn"
      : "Column";

/** Finding factories. Object names follow Tabular Editor's display names (see the plan's naming table). */
export const finding = {
  model: (m: Model): RuleFinding => ({
    objectType: "Model",
    objectName: "Model",
    location: m.location,
    object: m,
  }),
  table: (t: Table): RuleFinding => ({
    objectType: tableObjectType(t),
    objectName: tableRef(t.name),
    location: t.location,
    object: t,
  }),
  column: (c: Column): RuleFinding => ({
    objectType: columnObjectType(c),
    objectName: columnRef(c.table.name, c.name),
    location: c.location,
    object: c,
  }),
  measure: (x: Measure): RuleFinding => ({
    objectType: "Measure",
    objectName: measureRef(x.name),
    location: x.location,
    object: x,
  }),
  partition: (p: Partition): RuleFinding => ({
    objectType: "Partition",
    objectName: p.name,
    location: p.location,
    detail: `table ${tableRef(p.table.name)}`,
    object: p,
  }),
  relationship: (r: Relationship): RuleFinding => ({
    objectType: "Relationship",
    objectName: relationshipName(r),
    location: r.location,
    object: r,
  }),
  role: (r: Role): RuleFinding => ({
    objectType: "Role",
    objectName: r.name,
    location: r.location,
    object: r,
  }),
  tablePermission: (tp: TablePermission): RuleFinding => ({
    objectType: "TablePermission",
    objectName: tp.table,
    location: tp.location,
    detail: `role ${tp.role.name}`,
    object: tp,
  }),
  perspective: (p: Perspective): RuleFinding => ({
    objectType: "Perspective",
    objectName: p.name,
    location: p.location,
    object: p,
  }),
  hierarchy: (h: Hierarchy): RuleFinding => ({
    objectType: "Hierarchy",
    objectName: h.name,
    location: h.location,
    detail: `table ${tableRef(h.table.name)}`,
    object: h,
  }),
  level: (l: Level): RuleFinding => ({
    objectType: "Level",
    objectName: l.name,
    location: l.location,
    detail: `hierarchy ${l.hierarchy.name} in ${tableRef(l.hierarchy.table.name)}`,
    object: l,
  }),
  calculationItem: (i: CalculationItem): RuleFinding => ({
    objectType: "CalculationItem",
    objectName: i.name,
    location: i.location,
    detail: `calculation group ${tableRef(i.table.name)}`,
    object: i,
  }),
  expression: (e: NamedExpression): RuleFinding => ({
    objectType: "NamedExpression",
    objectName: e.name,
    location: e.location,
    object: e,
  }),
  dataSource: (d: DataSource): RuleFinding => ({
    objectType: "DataSource",
    objectName: d.name,
    location: d.location,
    object: d,
  }),
};

export interface NamedObject {
  finding: RuleFinding;
  name: string;
  description?: string;
}

/** Every object of the given types, in model order, for rules that only look at names or descriptions. */
export function namedObjects(m: Model, types: ObjectType[]): NamedObject[] {
  const want = new Set(types);
  const out: NamedObject[] = [];
  const push = (f: RuleFinding, name: string, description?: string) => {
    if (want.has(f.objectType)) out.push({ finding: f, name, description });
  };
  push(finding.model(m), m.name, m.description);
  for (const t of m.tables) {
    push(finding.table(t), t.name, t.description);
    for (const c of t.columns) push(finding.column(c), c.name, c.description);
    for (const x of t.measures) push(finding.measure(x), x.name, x.description);
    for (const h of t.hierarchies) {
      push(finding.hierarchy(h), h.name, h.description);
      for (const l of h.levels) push(finding.level(l), l.name, l.description);
    }
    for (const p of t.partitions) push(finding.partition(p), p.name, p.description);
    for (const i of t.calculationGroup?.items ?? [])
      push(finding.calculationItem(i), i.name, i.description);
  }
  for (const r of m.relationships) push(finding.relationship(r), r.name, r.description);
  for (const r of m.roles) {
    push(finding.role(r), r.name, r.description);
    for (const tp of r.tablePermissions) push(finding.tablePermission(tp), tp.name, tp.description);
  }
  for (const p of m.perspectives) push(finding.perspective(p), p.name, p.description);
  for (const e of m.expressions) push(finding.expression(e), e.name, e.description);
  for (const d of m.dataSources) push(finding.dataSource(d), d.name, d.description);
  return out;
}
