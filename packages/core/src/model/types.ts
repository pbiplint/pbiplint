import type { ParsedFile, TmdlNode } from "../tmdl/types.js";

export interface SourceLocation {
  file: string;
  line: number;
}

/** Fields shared by every model object. */
export interface Named {
  name: string;
  description?: string;
  /** Child `annotation` nodes by name. */
  annotations: Record<string, string>;
  location: SourceLocation;
  node?: TmdlNode;
}

export type TableKind = "table" | "calculated" | "calculationGroup";
export type ColumnKind = "data" | "calculated" | "calculatedTable";

export interface Model extends Named {
  /** Properties declared under `model`, keys lowercased. */
  props: Record<string, string | true>;
  tables: Table[];
  relationships: Relationship[];
  roles: Role[];
  perspectives: Perspective[];
  cultures: Culture[];
  expressions: NamedExpression[];
  functions: DaxFunction[];
  dataSources: DataSource[];
  files: ParsedFile[];
  /**
   * The paths under the model's root that the input reader could not read at all
   * (`LintOptions.unreadPaths`): a `.tmdl` file, or a folder written with a trailing `/`, in the
   * order given. Either could declare any table and anything under any table, so each counts as a
   * file whose parse issue can take an object and a `table` line out of the model
   * (`TmdlParseIssue.canDropObjects` and `canDropTableLine`). The input reader's notice names each
   * one, so none is a parse issue. Any other path, such as the model's .platform, declares nothing
   * and is not listed.
   */
  unreadPaths: string[];
}

export interface Table extends Named {
  kind: TableKind;
  isHidden: boolean;
  dataCategory?: string;
  columns: Column[];
  measures: Measure[];
  partitions: Partition[];
  hierarchies: Hierarchy[];
  calculationGroup?: CalculationGroup;
}

export interface Variation {
  name: string;
  relationship?: string;
  defaultHierarchy?: string;
  defaultColumn?: { table: string; column: string };
}

/**
 * An aggregation column's mapping to the detail data it summarizes, from the column's `alternateOf`
 * block, names unquoted. Power BI writes the base column qualified (`baseColumn: Sales.Amount`) and
 * a count of a table's rows as `baseTable` alone. `baseTable` is the detail table either way (a
 * bare `baseColumn` beside a `baseTable` reads as a column of it); `baseColumn` is the column's own
 * name, absent for a row count. `summarization` is lowercased (groupby, sum, count, min, max) and
 * absent when the block leaves it out, which Power BI does for groupby, the default.
 */
export interface AlternateOf {
  summarization?: string;
  baseTable?: string;
  baseColumn?: string;
}

export interface Column extends Named {
  table: Table;
  kind: ColumnKind;
  dataType?: string;
  isHidden: boolean;
  isKey: boolean;
  /** TOM default is true; TMDL only writes `isAvailableInMdx: false`. */
  isAvailableInMdx: boolean;
  formatString?: string;
  summarizeBy?: string;
  sourceColumn?: string;
  sortByColumn?: string;
  /**
   * The columns `relatedColumnDetails` names in `groupByColumn`, on the same table: a field
   * parameter's display column groups by its hidden Fields column, which the parameter needs.
   */
  groupByColumns: string[];
  dataCategory?: string;
  expression?: string;
  variations: Variation[];
  alternateOf?: AlternateOf;
  /** Whether the column has an `alternateOf` block, so is part of an aggregation table. */
  hasAlternateOf: boolean;
}

export interface Measure extends Named {
  table: Table;
  expression: string;
  formatString?: string;
  /** Raw DAX of `formatStringDefinition = ...`, quotes included. */
  formatStringDefinition?: string;
  isHidden: boolean;
  displayFolder?: string;
}

export interface Partition extends Named {
  table: Table;
  /** Lowercased word after `=` in the header: m, calculated, query, calculationgroup, entity, ... */
  sourceType: string;
  mode?: string;
  /** M, DAX, or native query text. */
  source?: string;
  dataSource?: string;
}

export interface Hierarchy extends Named {
  table: Table;
  isHidden: boolean;
  levels: Level[];
}

export interface Level extends Named {
  hierarchy: Hierarchy;
  column?: string;
}

export interface CalculationGroup extends Named {
  table: Table;
  precedence?: number;
  items: CalculationItem[];
}

export interface CalculationItem extends Named {
  table: Table;
  expression: string;
  formatStringDefinition?: string;
}

export interface Relationship extends Named {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  isActive: boolean;
  /** Lowercased: onedirection | bothdirections | automatic */
  crossFilteringBehavior: string;
  /** Lowercased: many | one | none */
  fromCardinality: string;
  toCardinality: string;
}

export interface RoleMember {
  name: string;
}

export interface TablePermission extends Named {
  role: Role;
  /** Same as `name`: the table the permission applies to. */
  table: string;
  /** DAX filter expression; undefined when the permission declares none. */
  filter?: string;
  /** Lowercased, for object-level security (`none`, `default`, ...). */
  metadataPermission?: string;
  columnPermissions: { column: string; permission: string }[];
}

export interface Role extends Named {
  modelPermission?: string;
  members: RoleMember[];
  tablePermissions: TablePermission[];
}

export interface Perspective extends Named {
  /** Names of `perspectiveTable` children. */
  tables: string[];
}

export type Culture = Named;

export interface NamedExpression extends Named {
  expression: string;
}

export interface DaxFunction extends Named {
  expression: string;
}

export interface DataSource extends Named {
  kind: "provider" | "structured";
}
