/**
 * The types a Tabular Editor rule reads values as: what the model view (view.ts) declares for each
 * property, and what the evaluator checks an expression against. They follow the .NET types the
 * Tabular Object Model gives its properties, by name, in the Microsoft.AnalysisServices.Tabular
 * namespace (https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular).
 */

/**
 * The object types of the view, by the class names Tabular Editor gives them, since its error
 * messages name them (`No property or field 'Precedence' exists in type 'CalculationGroupTable'`).
 * The last four are parts reached only through a property: a calculation group table's
 * `CalculationGroup`, a column's `AlternateOf`, and an entry of `DependsOn` with the references in
 * it.
 */
export const TOM_TYPES = [
  "Model",
  "Table",
  "CalculatedTable",
  "CalculationGroupTable",
  "DataColumn",
  "CalculatedColumn",
  "CalculatedTableColumn",
  "Measure",
  "KPI",
  "Hierarchy",
  "Level",
  "Partition",
  "Relationship",
  "Perspective",
  "Culture",
  "ModelRole",
  "ModelRoleMember",
  "TablePermission",
  "CalculationItem",
  "NamedExpression",
  "ProviderDataSource",
  "StructuredDataSource",
  "Variation",
  "Calendar",
  "Function",
  "CalculationGroup",
  "AlternateOf",
  "Dependency",
  "ObjectReference",
] as const;

export type TomType = (typeof TOM_TYPES)[number];

export const TABLE_TYPES: readonly TomType[] = [
  "Table",
  "CalculatedTable",
  "CalculationGroupTable",
];
export const COLUMN_TYPES: readonly TomType[] = [
  "DataColumn",
  "CalculatedColumn",
  "CalculatedTableColumn",
];
export const DATA_SOURCE_TYPES: readonly TomType[] = ["ProviderDataSource", "StructuredDataSource"];

/** An object of the view: its type, the pbiplint model object behind it, and its name as Tabular Editor writes it. */
export interface TomObject {
  type: TomType;
  source: unknown;
  teName: string;
}

/** A .NET enum: its type name and its value names, which is how a rule compares and prints them. */
export interface EnumType {
  kind: "enum";
  name: string;
  values: readonly string[];
}

/**
 * A string-keyed indexer such as `TranslatedNames["fr-FR"]` or `InPerspective["Sales"]`. Its keys
 * are names of model objects (cultures, perspectives, roles, tables), matched as the Tabular
 * Object Model matches names, without regard to case. Enumerating it gives its values, as
 * Tabular Editor's indexers do (`RowLevelSecurity.Any(it.Length > 0)`).
 */
export interface MapType {
  kind: "map";
  value: TeType;
  /** What `map[key]` does for a key that names nothing: gives a value, or fails the rule. */
  onMissingKey: { value: unknown } | { throws: string };
}

/**
 * A member a collection has beyond the collection methods the evaluator gives every collection
 * (`Any`, `Count`, `Where`, ...): `ReferencedBy.AllMeasures`, `DependsOn.Columns`.
 */
export interface CollectionMember {
  type: TeType;
  get(items: readonly unknown[], view: unknown): unknown;
}

export type TeType =
  | { kind: "string" }
  | { kind: "boolean" }
  | { kind: "int" }
  | { kind: "long" }
  | { kind: "double" }
  | { kind: "decimal" }
  | EnumType
  /** A view object of one of these types (`"any"`: any type), or null where there is none. */
  | { kind: "object"; of: readonly TomType[] | "any" }
  | { kind: "collection"; of: TeType; members?: Record<string, CollectionMember> }
  | MapType
  /** A value that may be null, where the Tabular Object Model gives null rather than a default. */
  | { kind: "nullable"; of: TeType };

/** A map's value at run time: its entries in model order, and a lookup by key. */
export interface TeMap {
  readonly entries: readonly (readonly [string, unknown])[];
  lookup(key: string): { found: true; value: unknown } | { found: false };
}

export function teMap(entries: readonly (readonly [string, unknown])[]): TeMap {
  const byKey = new Map<string, unknown>();
  for (const [k, v] of entries) if (!byKey.has(k.toLowerCase())) byKey.set(k.toLowerCase(), v);
  return {
    entries,
    lookup: (key) => {
      const k = key.toLowerCase();
      return byKey.has(k) ? { found: true, value: byKey.get(k) } : { found: false };
    },
  };
}

export const STRING: TeType = { kind: "string" };
export const BOOLEAN: TeType = { kind: "boolean" };
export const INT: TeType = { kind: "int" };
export const NULLABLE_STRING: TeType = { kind: "nullable", of: STRING };
export const objectOf = (...of: readonly TomType[]): TeType => ({ kind: "object", of });
export const ANY_OBJECT: TeType = { kind: "object", of: "any" };
export const collectionOf = (of: TeType, members?: Record<string, CollectionMember>): TeType =>
  members ? { kind: "collection", of, members } : { kind: "collection", of };

const enumType = (name: string, values: readonly string[]): EnumType => ({
  kind: "enum",
  name,
  values,
});

/** The enums the view's properties take, with the value names the Tabular Object Model documents. */
export const ENUMS = {
  DataType: enumType("DataType", [
    "Automatic",
    "String",
    "Int64",
    "Double",
    "DateTime",
    "Decimal",
    "Boolean",
    "Binary",
    "Unknown",
    "Variant",
  ]),
  AggregateFunction: enumType("AggregateFunction", [
    "Default",
    "None",
    "Sum",
    "Min",
    "Max",
    "Count",
    "Average",
    "DistinctCount",
  ]),
  CrossFilteringBehavior: enumType("CrossFilteringBehavior", [
    "OneDirection",
    "BothDirections",
    "Automatic",
  ]),
  RelationshipEndCardinality: enumType("RelationshipEndCardinality", ["None", "One", "Many"]),
  SecurityFilteringBehavior: enumType("SecurityFilteringBehavior", [
    "OneDirection",
    "BothDirections",
    "None",
  ]),
  DateTimeRelationshipBehavior: enumType("DateTimeRelationshipBehavior", [
    "DateAndTime",
    "DatePartOnly",
  ]),
  PartitionSourceType: enumType("PartitionSourceType", [
    "Query",
    "Calculated",
    "None",
    "M",
    "Entity",
    "PolicyRange",
    "CalculationGroup",
    "Inferred",
    "Parquet",
  ]),
  ModeType: enumType("ModeType", [
    "Import",
    "DirectQuery",
    "Default",
    "Push",
    "Dual",
    "DirectLake",
  ]),
  ColumnType: enumType("ColumnType", ["Data", "Calculated", "RowNumber", "CalculatedTableColumn"]),
  DataSourceType: enumType("DataSourceType", ["Provider", "Structured"]),
  MetadataPermission: enumType("MetadataPermission", ["Default", "None", "Read"]),
  ModelPermission: enumType("ModelPermission", [
    "None",
    "Read",
    "ReadRefresh",
    "Refresh",
    "Administrator",
  ]),
  PowerBIDataSourceVersion: enumType("PowerBIDataSourceVersion", [
    "PowerBI_V1",
    "PowerBI_V2",
    "PowerBI_V3",
  ]),
  SummarizationType: enumType("SummarizationType", ["GroupBy", "Sum", "Count", "Min", "Max"]),
  /** Tabular Editor's object types, as `ObjectType` prints and `Key.ObjectType = "Column"` compares. */
  ObjectType: enumType("ObjectType", [
    "Model",
    "DataSource",
    "Table",
    "Column",
    "Partition",
    "Relationship",
    "Measure",
    "Hierarchy",
    "Level",
    "KPI",
    "Culture",
    "Perspective",
    "Role",
    "RoleMember",
    "TablePermission",
    "Variation",
    "Expression",
    "CalculationGroup",
    "CalculationItem",
    "Calendar",
    "Function",
  ]),
} as const;
