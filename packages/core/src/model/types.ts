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
  dataCategory?: string;
  expression?: string;
  variations: Variation[];
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
