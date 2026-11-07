import { buildRelationshipIndex, type RelationshipIndex } from "../../index/relationships.js";
import { splitQualifiedName } from "../../model/build.js";
import { columnRef, measureRef, relationshipName, tableRef } from "../../model/names.js";
import type {
  AlternateOf,
  Calendar,
  CalculationGroup,
  CalculationItem,
  Column,
  Culture,
  DataSource,
  DaxFunction,
  Hierarchy,
  Level,
  Measure,
  Model,
  NamedExpression,
  Partition,
  Perspective,
  Relationship,
  Role,
  RoleMember,
  Table,
  TablePermission,
  Variation,
} from "../../model/types.js";
import { isDirectQueryTable } from "../../rules/helpers.js";
import type { TmdlNode } from "../../tmdl/types.js";
import { buildDependencyGraph, type DependencyGraph } from "./view-deps.js";
import {
  ANY_OBJECT,
  BOOLEAN,
  COLUMN_TYPES,
  DATA_SOURCE_TYPES,
  ENUMS,
  INT,
  NULLABLE_STRING,
  STRING,
  TABLE_TYPES,
  collectionOf,
  objectOf,
  teMap,
  type CollectionMember,
  type EnumType,
  type TeType,
  type TomObject,
  type TomType,
} from "./view-types.js";

export { TOM_TYPES, ENUMS, teMap } from "./view-types.js";
export type {
  CollectionMember,
  EnumType,
  MapType,
  TeMap,
  TeType,
  TomObject,
  TomType,
} from "./view-types.js";

/**
 * A property the project's files leave unset on this object, where the Tabular Object Model would
 * work the value out: a calculated column's `DataType` when its TMDL has no `dataType` line, as
 * Power BI Desktop saves most of them. The evaluator leaves such an object out of the rule and
 * counts it (spec section 6.2); the view never guesses the value.
 */
export const UNSET: unique symbol = Symbol("unset");

/** The scope names Tabular Editor CLI 0.8.1.1 accepts, as its captures and the rule file reader name them. */
export const TE_SCOPES = [
  "Model",
  "Table",
  "CalculatedTable",
  "Column",
  "DataColumn",
  "CalculatedColumn",
  "CalculatedTableColumn",
  "Measure",
  "Hierarchy",
  "Level",
  "Partition",
  "Relationship",
  "Perspective",
  "Culture",
  "ModelRole",
  "ModelRoleMember",
  "TablePermission",
  "CalculationGroup",
  "CalculationItem",
  "KPI",
  "NamedExpression",
  "ProviderDataSource",
  "StructuredDataSource",
  "Variation",
  "Calendar",
  "UserDefinedFunction",
] as const;

export interface PropertySpec {
  type: TeType;
  get(o: TomObject, view: TomView): unknown | typeof UNSET;
}

/** The view's lookups, built once with it, for the property getters. */
export interface ViewIndex {
  wrap: Map<object, TomObject>;
  kpiOf: Map<Measure, TomObject>;
  groupOf: Map<CalculationGroup, TomObject>;
  relationships: RelationshipIndex;
  table(name: string): Table | undefined;
  column(table: string, name: string): Column | undefined;
  sortedBy: Map<Column, Column[]>;
  hierarchiesUsing: Map<Column, Hierarchy[]>;
  levelsUsing: Map<Column, Level[]>;
  variationsDefaulting: Map<Column, TomObject[]>;
  variationsOf: Map<Column, TomObject[]>;
  partitionsUsing: Map<DataSource, Partition[]>;
  inPerspective: Map<Perspective, Set<string>>;
  translations: Map<Culture, Map<string, Record<string, string>>>;
  deps(): DependencyGraph;
  dependencyObjects: Map<object, TomObject[]>;
  alternateOf: Map<Column, TomObject>;
}

/** A read-only view of pbiplint's model under the Tabular Object Model's names, as Tabular Editor's rules read it. */
export interface TomView {
  readonly model: Model;
  /** The objects a rule of this scope runs on, in model order; none for a name Tabular Editor does not accept. */
  objectsOf(scope: string): TomObject[];
  /** The view object for one of the model's objects. */
  objectFor(source: object): TomObject | undefined;
  readonly index: ViewIndex;
}

interface KpiSource {
  measure: Measure;
  node?: TmdlNode;
}
interface MemberSource {
  role: Role;
  member: RoleMember;
}
interface VariationSource {
  column: Column;
  variation: Variation;
  node?: TmdlNode;
}
interface AlternateOfSource {
  column: Column;
  alternateOf: AlternateOf;
}
interface DependencySource {
  key: TomObject;
  refs: TomObject[];
}
interface ReferenceSource {
  fullyQualified: boolean;
}

const lower = (s: string): string => s.toLowerCase();
const flag = (v: string | true | undefined, dflt: boolean): boolean =>
  v === undefined ? dflt : v === true || lower(v) === "true";
const text = (v: string | true | undefined): string => (typeof v === "string" ? v : "");
const propOf = (node: TmdlNode | undefined, key: string): string | true | undefined =>
  node?.props[key];
const childObjects = (node: TmdlNode | undefined, type: string): TmdlNode[] =>
  node?.children.filter((c) => c.kind === "object" && c.type === type) ?? [];

/** An enum's value name for a word as TMDL writes it, matched without regard to case. */
function enumValue(e: EnumType, raw: string | true | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const r = lower(raw.trim());
  return e.values.find((v) => lower(v) === r);
}
const enumOr = (e: EnumType, raw: string | true | undefined, dflt: string | typeof UNSET) =>
  enumValue(e, raw) ?? (raw === undefined ? dflt : UNSET);

const key = {
  table: (t: string) => `t\u0000${lower(t)}`,
  column: (t: string, c: string) => `c\u0000${lower(t)}\u0000${lower(c)}`,
  measure: (t: string, m: string) => `m\u0000${lower(t)}\u0000${lower(m)}`,
  hierarchy: (t: string, h: string) => `h\u0000${lower(t)}\u0000${lower(h)}`,
  level: (t: string, h: string, l: string) =>
    `l\u0000${lower(t)}\u0000${lower(h)}\u0000${lower(l)}`,
};

const tableTomType = (t: Table): TomType =>
  t.kind === "calculated"
    ? "CalculatedTable"
    : t.kind === "calculationGroup"
      ? "CalculationGroupTable"
      : "Table";
const columnTomType = (c: Column): TomType =>
  c.kind === "calculated"
    ? "CalculatedColumn"
    : c.kind === "calculatedTable"
      ? "CalculatedTableColumn"
      : "DataColumn";

export function buildTomView(model: Model): TomView {
  const wrap = new Map<object, TomObject>();
  const add = (type: TomType, source: object, teName: string): TomObject => {
    const o: TomObject = { type, source, teName };
    wrap.set(source, o);
    return o;
  };

  const scopes = new Map<string, TomObject[]>(TE_SCOPES.map((s) => [lower(s), []]));
  const put = (scope: string, o: TomObject) => scopes.get(lower(scope))!.push(o);

  const kpiOf = new Map<Measure, TomObject>();
  const groupOf = new Map<CalculationGroup, TomObject>();
  const variationsOf = new Map<Column, TomObject[]>();

  put("Model", add("Model", model, model.name));
  for (const t of model.tables) {
    const type = tableTomType(t);
    const o = add(type, t, tableRef(t.name));
    put(
      type === "Table"
        ? "Table"
        : type === "CalculatedTable"
          ? "CalculatedTable"
          : "CalculationGroup",
      o,
    );
    if (t.calculationGroup)
      groupOf.set(t.calculationGroup, {
        type: "CalculationGroup",
        source: t.calculationGroup,
        teName: tableRef(t.name),
      });
    for (const c of t.columns) {
      const co = add(columnTomType(c), c, columnRef(t.name, c.name));
      put("Column", co);
      put(co.type, co);
      const variations = c.variations.map((variation) =>
        add(
          "Variation",
          {
            column: c,
            variation,
            node: childObjects(c.node, "variation").find((n) => n.name === variation.name),
          } satisfies VariationSource,
          variation.name,
        ),
      );
      variationsOf.set(c, variations);
      for (const v of variations) put("Variation", v);
    }
  }
  for (const t of model.tables)
    for (const m of t.measures) {
      put("Measure", add("Measure", m, measureRef(m.name)));
      if (m.kpiExpressions !== undefined) {
        const source: KpiSource = {
          measure: m,
          node: m.node?.children.find((c) => c.type === "kpi"),
        };
        const k: TomObject = { type: "KPI", source, teName: `${measureRef(m.name)}.KPI` };
        wrap.set(source, k);
        kpiOf.set(m, k);
        put("KPI", k);
      }
    }
  for (const t of model.tables)
    for (const h of t.hierarchies) {
      put("Hierarchy", add("Hierarchy", h, h.name));
      for (const l of h.levels) put("Level", add("Level", l, l.name));
    }
  for (const t of model.tables)
    for (const p of t.partitions) put("Partition", add("Partition", p, p.name));
  for (const r of model.relationships)
    put("Relationship", add("Relationship", r, relationshipName(r)));
  for (const p of model.perspectives) put("Perspective", add("Perspective", p, p.name));
  for (const c of model.cultures) put("Culture", add("Culture", c, c.name));
  for (const r of model.roles) put("ModelRole", add("ModelRole", r, r.name));
  for (const r of model.roles)
    for (const member of r.members)
      put(
        "ModelRoleMember",
        add("ModelRoleMember", { role: r, member } satisfies MemberSource, member.name),
      );
  for (const r of model.roles)
    for (const tp of r.tablePermissions)
      put("TablePermission", add("TablePermission", tp, tp.table));
  for (const t of model.tables)
    for (const i of t.calculationGroup?.items ?? [])
      put("CalculationItem", add("CalculationItem", i, i.name));
  for (const e of model.expressions) put("NamedExpression", add("NamedExpression", e, e.name));
  for (const d of model.dataSources) {
    const type = d.kind === "provider" ? "ProviderDataSource" : "StructuredDataSource";
    put(type, add(type, d, d.name));
  }
  for (const t of model.tables)
    for (const c of t.calendars ?? []) put("Calendar", add("Calendar", c, tableRef(c.name)));
  for (const f of model.functions) put("UserDefinedFunction", add("Function", f, f.name));

  const index = buildIndex(model, wrap, kpiOf, groupOf, variationsOf);
  return {
    model,
    objectsOf: (scope) => [...(scopes.get(lower(scope)) ?? [])],
    objectFor: (source) => wrap.get(source),
    index,
  };
}

function buildIndex(
  model: Model,
  wrap: Map<object, TomObject>,
  kpiOf: Map<Measure, TomObject>,
  groupOf: Map<CalculationGroup, TomObject>,
  variationsOf: Map<Column, TomObject[]>,
): ViewIndex {
  const tables = new Map<string, Table>();
  for (const t of model.tables) if (!tables.has(lower(t.name))) tables.set(lower(t.name), t);
  const columns = new Map<string, Column>();
  for (const t of model.tables)
    for (const c of t.columns) columns.set(key.column(t.name, c.name), c);
  const column = (table: string, name: string) => columns.get(key.column(table, name));

  const push = <K, V>(map: Map<K, V[]>, k: K, v: V) => {
    const list = map.get(k);
    if (list) list.push(v);
    else map.set(k, [v]);
  };
  const sortedBy = new Map<Column, Column[]>();
  const hierarchiesUsing = new Map<Column, Hierarchy[]>();
  const levelsUsing = new Map<Column, Level[]>();
  const variationsDefaulting = new Map<Column, TomObject[]>();
  for (const t of model.tables) {
    for (const c of t.columns) {
      if (c.sortByColumn !== undefined) {
        const target = column(t.name, c.sortByColumn);
        if (target) push(sortedBy, target, c);
      }
      for (const v of variationsOf.get(c) ?? []) {
        const d = (v.source as VariationSource).variation.defaultColumn;
        const target = d && column(d.table, d.column);
        if (target) push(variationsDefaulting, target, v);
      }
    }
    for (const h of t.hierarchies)
      for (const l of h.levels) {
        const target = l.column === undefined ? undefined : column(t.name, l.column);
        if (!target) continue;
        push(levelsUsing, target, l);
        if (!hierarchiesUsing.get(target)?.includes(h)) push(hierarchiesUsing, target, h);
      }
  }

  const partitionsUsing = new Map<DataSource, Partition[]>();
  for (const d of model.dataSources)
    partitionsUsing.set(
      d,
      model.tables.flatMap((t) => t.partitions).filter((p) => p.dataSource === d.name),
    );

  const inPerspective = new Map<Perspective, Set<string>>();
  for (const p of model.perspectives) {
    const keys = new Set<string>();
    for (const name of p.tables) keys.add(key.table(name));
    for (const pt of childObjects(p.node, "perspectivetable")) {
      const t = pt.name ?? "";
      for (const c of childObjects(pt, "perspectivecolumn")) keys.add(key.column(t, c.name ?? ""));
      for (const m of childObjects(pt, "perspectivemeasure"))
        keys.add(key.measure(t, m.name ?? ""));
      for (const h of childObjects(pt, "perspectivehierarchy"))
        keys.add(key.hierarchy(t, h.name ?? ""));
    }
    inPerspective.set(p, keys);
  }

  // Each culture's translations, read from its `translations` block: the caption, description,
  // and display folder each object is given, by object.
  const translations = new Map<Culture, Map<string, Record<string, string>>>();
  for (const c of model.cultures) {
    const byObject = new Map<string, Record<string, string>>();
    const read = (k: string, n: TmdlNode) => {
      const out: Record<string, string> = {};
      for (const p of ["caption", "description", "displayfolder"]) {
        const v = n.props[p];
        if (typeof v === "string") out[p] = v;
      }
      byObject.set(k, out);
    };
    for (const block of c.node?.children.filter((n) => n.type === "translations") ?? [])
      for (const m of childObjects(block, "model"))
        for (const t of childObjects(m, "table")) {
          const tn = t.name ?? "";
          read(key.table(tn), t);
          for (const x of childObjects(t, "column")) read(key.column(tn, x.name ?? ""), x);
          for (const x of childObjects(t, "measure")) read(key.measure(tn, x.name ?? ""), x);
          for (const h of childObjects(t, "hierarchy")) {
            read(key.hierarchy(tn, h.name ?? ""), h);
            for (const l of childObjects(h, "level"))
              read(key.level(tn, h.name ?? "", l.name ?? ""), l);
          }
        }
    translations.set(c, byObject);
  }

  let graph: DependencyGraph | undefined;
  return {
    wrap,
    kpiOf,
    groupOf,
    relationships: buildRelationshipIndex(model),
    table: (name) => tables.get(lower(name)),
    column,
    sortedBy,
    hierarchiesUsing,
    levelsUsing,
    variationsDefaulting,
    variationsOf,
    partitionsUsing,
    inPerspective,
    translations,
    deps: () =>
      (graph ??= buildDependencyGraph(model, (m) => {
        const k = kpiOf.get(m);
        return k?.source as object | undefined;
      })),
    dependencyObjects: new Map(),
    alternateOf: new Map(),
  };
}

// ---------------------------------------------------------------------------------------------
// Values

const objectIn = (view: TomView, source: object | undefined): TomObject | null =>
  (source && view.objectFor(source)) || null;
const objectsIn = (view: TomView, sources: readonly object[]): TomObject[] =>
  sources.flatMap((s) => view.objectFor(s) ?? []);

/** Tabular Editor's `GetAnnotation` and `HasAnnotation` read these: an object's annotations by name. */
export function annotationsOf(o: TomObject): Record<string, string> {
  switch (o.type) {
    case "KPI": {
      const out: Record<string, string> = {};
      for (const a of childObjects((o.source as KpiSource).node, "annotation"))
        out[a.name ?? ""] = a.value ?? "";
      return out;
    }
    case "ModelRoleMember":
    case "Variation":
    case "AlternateOf":
    case "Dependency":
    case "ObjectReference":
      return {};
    default:
      return (o.source as { annotations?: Record<string, string> }).annotations ?? {};
  }
}

/** An annotation's value, or null when the object has none of that name (matched without regard to case, as TOM matches names). */
export function getAnnotation(o: TomObject, name: string): string | null {
  const all = annotationsOf(o);
  if (Object.hasOwn(all, name)) return all[name]!;
  const k = Object.keys(all).find((n) => lower(n) === lower(name));
  return k === undefined ? null : all[k]!;
}

export const hasAnnotation = (o: TomObject, name: string): boolean =>
  getAnnotation(o, name) !== null;

function dependsOn(view: TomView, owner: object): TomObject[] {
  const cached = view.index.dependencyObjects.get(owner);
  if (cached) return cached;
  const byKey = new Map<object, DependencySource>();
  for (const d of view.index.deps().dependsOn(owner)) {
    const target = view.objectFor(d.target);
    if (!target) continue;
    let entry = byKey.get(d.target);
    if (!entry) byKey.set(d.target, (entry = { key: target, refs: [] }));
    const ref: ReferenceSource = { fullyQualified: d.fullyQualified };
    entry.refs.push({ type: "ObjectReference", source: ref, teName: target.teName });
  }
  const out = [...byKey.values()].map((s): TomObject => ({
    type: "Dependency",
    source: s,
    teName: s.key.teName,
  }));
  view.index.dependencyObjects.set(owner, out);
  return out;
}

const referencedBy = (view: TomView, target: object): TomObject[] =>
  objectsIn(view, view.index.deps().referencedBy(target));

/** Everything that reads the items, directly or through what reads them, each once. */
function deepReferencedBy(view: TomView, items: readonly unknown[]): TomObject[] {
  const seen = new Set<TomObject>();
  const queue = [...(items as TomObject[])];
  while (queue.length > 0) {
    const o = queue.shift()!;
    if (seen.has(o)) continue;
    seen.add(o);
    queue.push(...referencedBy(view, o.source as object));
  }
  return [...seen];
}

const ofTypes = (items: readonly unknown[], types: readonly TomType[]) =>
  (items as TomObject[]).filter((o) => types.includes(o.type));

const REFERENCED_BY_MEMBERS: Record<string, CollectionMember> = {
  Measures: {
    type: collectionOf(objectOf("Measure")),
    get: (items) => ofTypes(items, ["Measure"]),
  },
  Columns: {
    type: collectionOf(objectOf(...COLUMN_TYPES)),
    get: (items) => ofTypes(items, COLUMN_TYPES),
  },
  Tables: {
    type: collectionOf(objectOf(...TABLE_TYPES)),
    get: (items) => ofTypes(items, TABLE_TYPES),
  },
  AllMeasures: {
    type: collectionOf(objectOf("Measure")),
    get: (items, view) => ofTypes(deepReferencedBy(view as TomView, items), ["Measure"]),
  },
  AllColumns: {
    type: collectionOf(objectOf(...COLUMN_TYPES)),
    get: (items, view) => ofTypes(deepReferencedBy(view as TomView, items), COLUMN_TYPES),
  },
  AllTables: {
    type: collectionOf(objectOf(...TABLE_TYPES)),
    get: (items, view) => ofTypes(deepReferencedBy(view as TomView, items), TABLE_TYPES),
  },
};

const keysOfTypes = (items: readonly unknown[], types: readonly TomType[]) =>
  (items as TomObject[])
    .map((d) => (d.source as DependencySource).key)
    .filter((k) => types.includes(k.type));

const DEPENDS_ON_MEMBERS: Record<string, CollectionMember> = {
  Measures: {
    type: collectionOf(objectOf("Measure")),
    get: (items) => keysOfTypes(items, ["Measure"]),
  },
  Columns: {
    type: collectionOf(objectOf(...COLUMN_TYPES)),
    get: (items) => keysOfTypes(items, COLUMN_TYPES),
  },
  Tables: {
    type: collectionOf(objectOf(...TABLE_TYPES)),
    get: (items) => keysOfTypes(items, TABLE_TYPES),
  },
};

const REFERENCED_BY_TYPE = collectionOf(ANY_OBJECT, REFERENCED_BY_MEMBERS);
const DEPENDS_ON_TYPE = collectionOf(objectOf("Dependency"), DEPENDS_ON_MEMBERS);

// ---------------------------------------------------------------------------------------------
// Property builders

type Props = Record<string, PropertySpec>;
const p = <S>(type: TeType, get: (s: S, o: TomObject, view: TomView) => unknown): PropertySpec => ({
  type,
  get: (o, view) => get(o.source as S, o, view),
});

const TABLES = collectionOf(objectOf(...TABLE_TYPES));
const COLUMNS = collectionOf(objectOf(...COLUMN_TYPES));
const TABLE = objectOf(...TABLE_TYPES);
const COLUMN = objectOf(...COLUMN_TYPES);

const fixed = (type: TeType, value: unknown): PropertySpec => ({ type, get: () => value });
const modelProp = (): PropertySpec => ({
  type: objectOf("Model"),
  get: (_o, v) => v.objectFor(v.model),
});

/** Name, Description, ObjectType, ObjectTypeName, and Model: what every named object has. */
function named(
  objectType: string,
  objectTypeName: string | ((o: TomObject) => string),
  description = true,
): Props {
  return {
    Name: p<{ name: string }>(STRING, (s) => s.name),
    ...(description
      ? { Description: p<{ description?: string }>(STRING, (s) => s.description ?? "") }
      : {}),
    ObjectType: fixed(ENUMS.ObjectType, objectType),
    ObjectTypeName:
      typeof objectTypeName === "string"
        ? fixed(STRING, objectTypeName)
        : { type: STRING, get: (o) => objectTypeName(o) },
    Model: modelProp(),
  };
}

const MISSING_CULTURE = { throws: "the model has no culture of that name" };
const MISSING_PERSPECTIVE = { throws: "the model has no perspective of that name" };
const MISSING_ROLE = { throws: "the model has no role of that name" };
const MISSING_TABLE = { throws: "the model has no table of that name" };

/** TranslatedNames, TranslatedDescriptions, and (where `folders`) TranslatedDisplayFolders, by culture name; "" where a culture gives none. */
function translated<S>(keyOf: (s: S) => string, folders: boolean): Props {
  const map = (prop: string) =>
    p<S>({ kind: "map", value: STRING, onMissingKey: MISSING_CULTURE }, (s, _o, view) =>
      teMap(
        view.model.cultures.map((c) => [
          c.name,
          view.index.translations.get(c)?.get(keyOf(s))?.[prop] ?? "",
        ]),
      ),
    );
  return {
    TranslatedNames: map("caption"),
    TranslatedDescriptions: map("description"),
    ...(folders ? { TranslatedDisplayFolders: map("displayfolder") } : {}),
  };
}

/** InPerspective, by perspective name. */
const inPerspective = <S>(keyOf: (s: S) => string): PropertySpec =>
  p<S>({ kind: "map", value: BOOLEAN, onMissingKey: MISSING_PERSPECTIVE }, (s, _o, view) =>
    teMap(
      view.model.perspectives.map((x) => [
        x.name,
        view.index.inPerspective.get(x)?.has(keyOf(s)) ?? false,
      ]),
    ),
  );

const permissionOn = (role: Role, table: string): TablePermission | undefined =>
  role.tablePermissions.find((tp) => lower(tp.table) === lower(table));

const metadataPermission = (raw: string | undefined) =>
  enumValue(ENUMS.MetadataPermission, raw) ?? "Default";

/** The IsHidden and IsVisible pair. */
const hideable = <S extends { isHidden: boolean }>(): Props => ({
  IsHidden: p<S>(BOOLEAN, (s) => s.isHidden),
  IsVisible: p<S>(BOOLEAN, (s) => !s.isHidden),
});

const lineageTag = p<{ node?: TmdlNode }>(STRING, (s) => text(propOf(s.node, "lineagetag")));
const referencedByProp = p<object>(REFERENCED_BY_TYPE, (s, _o, view) => referencedBy(view, s));
const dependsOnProp = p<object>(DEPENDS_ON_TYPE, (s, _o, view) => dependsOn(view, s));

function tableProps(extra: Props): Props {
  return {
    ...named("Table", (o) => {
      const t = o.source as Table;
      return t.kind === "calculated"
        ? "Calculated Table"
        : t.kind === "calculationGroup"
          ? "Calculation Group Table"
          : isDirectQueryTable(t)
            ? "Table (DirectQuery)"
            : "Table";
    }),
    ...hideable<Table>(),
    DataCategory: p<Table>(STRING, (t) => t.dataCategory ?? ""),
    Columns: p<Table>(COLUMNS, (t, _o, v) => objectsIn(v, t.columns)),
    Measures: p<Table>(collectionOf(objectOf("Measure")), (t, _o, v) => objectsIn(v, t.measures)),
    Hierarchies: p<Table>(collectionOf(objectOf("Hierarchy")), (t, _o, v) =>
      objectsIn(v, t.hierarchies),
    ),
    Partitions: p<Table>(collectionOf(objectOf("Partition")), (t, _o, v) =>
      objectsIn(v, t.partitions),
    ),
    Calendars: p<Table>(collectionOf(objectOf("Calendar")), (t, _o, v) =>
      objectsIn(v, t.calendars ?? []),
    ),
    UsedInRelationships: p<Table>(collectionOf(objectOf("Relationship")), (t, _o, v) =>
      objectsIn(v, v.index.relationships.forTable(t.name)),
    ),
    RowLevelSecurity: p<Table>(
      { kind: "map", value: STRING, onMissingKey: MISSING_ROLE },
      (t, _o, v) =>
        teMap(v.model.roles.map((r) => [r.name, permissionOn(r, t.name)?.filter ?? ""])),
    ),
    ObjectLevelSecurity: p<Table>(
      { kind: "map", value: ENUMS.MetadataPermission, onMissingKey: MISSING_ROLE },
      (t, _o, v) =>
        teMap(
          v.model.roles.map((r) => [
            r.name,
            metadataPermission(permissionOn(r, t.name)?.metadataPermission),
          ]),
        ),
    ),
    InPerspective: inPerspective<Table>((t) => key.table(t.name)),
    ...translated<Table>((t) => key.table(t.name), false),
    ReferencedBy: referencedByProp,
    DaxObjectName: p<Table>(STRING, (t) => tableRef(t.name)),
    DaxObjectFullName: p<Table>(STRING, (t) => tableRef(t.name)),
    DaxTableName: p<Table>(STRING, (t) => tableRef(t.name)),
    SourceExpression: p<Table>(NULLABLE_STRING, (t) => t.refreshPolicy?.sourceExpression ?? null),
    ShowAsVariationsOnly: p<Table>(BOOLEAN, (t) =>
      flag(propOf(t.node, "showasvariationsonly"), false),
    ),
    IsPrivate: p<Table>(BOOLEAN, (t) => flag(propOf(t.node, "isprivate"), false)),
    LineageTag: lineageTag,
    ...extra,
  };
}

function columnProps(objectTypeName: string, columnType: string, extra: Props): Props {
  return {
    ...named("Column", objectTypeName),
    ...hideable<Column>(),
    Table: p<Column>(TABLE, (c, _o, v) => objectIn(v, c.table)),
    // Never guessed: no `dataType` line leaves the type to the engine (spec section 6.2).
    DataType: p<Column>(ENUMS.DataType, (c) => enumOr(ENUMS.DataType, c.dataType, UNSET)),
    Type: fixed(ENUMS.ColumnType, columnType),
    DisplayFolder: p<Column>(STRING, (c) => text(propOf(c.node, "displayfolder"))),
    FormatString: p<Column>(STRING, (c) => c.formatString ?? ""),
    DataCategory: p<Column>(STRING, (c) => c.dataCategory ?? ""),
    // TOM's default is Default, which TMDL leaves out.
    SummarizeBy: p<Column>(ENUMS.AggregateFunction, (c) =>
      enumOr(ENUMS.AggregateFunction, c.summarizeBy, "Default"),
    ),
    IsKey: p<Column>(BOOLEAN, (c) => c.isKey),
    IsAvailableInMDX: p<Column>(BOOLEAN, (c) => c.isAvailableInMdx),
    IsNullable: p<Column>(BOOLEAN, (c) => flag(propOf(c.node, "isnullable"), true)),
    IsUnique: p<Column>(BOOLEAN, (c) => flag(propOf(c.node, "isunique"), false)),
    SortByColumn: p<Column>(COLUMN, (c, _o, v) =>
      c.sortByColumn === undefined
        ? null
        : objectIn(v, v.index.column(c.table.name, c.sortByColumn)),
    ),
    UsedInSortBy: p<Column>(COLUMNS, (c, _o, v) => objectsIn(v, v.index.sortedBy.get(c) ?? [])),
    UsedInHierarchies: p<Column>(collectionOf(objectOf("Hierarchy")), (c, _o, v) =>
      objectsIn(v, v.index.hierarchiesUsing.get(c) ?? []),
    ),
    UsedInLevels: p<Column>(collectionOf(objectOf("Level")), (c, _o, v) =>
      objectsIn(v, v.index.levelsUsing.get(c) ?? []),
    ),
    UsedInRelationships: p<Column>(collectionOf(objectOf("Relationship")), (c, _o, v) =>
      objectsIn(v, v.index.relationships.forColumn(c.table.name, c.name)),
    ),
    UsedInVariations: p<Column>(collectionOf(objectOf("Variation")), (c, _o, v) => [
      ...(v.index.variationsDefaulting.get(c) ?? []),
    ]),
    Variations: p<Column>(collectionOf(objectOf("Variation")), (c, _o, v) => [
      ...(v.index.variationsOf.get(c) ?? []),
    ]),
    AlternateOf: p<Column>(objectOf("AlternateOf"), (c, o, v) => {
      if (!c.alternateOf) return null;
      let a = v.index.alternateOf.get(c);
      if (!a) {
        const source: AlternateOfSource = { column: c, alternateOf: c.alternateOf };
        a = { type: "AlternateOf", source, teName: o.teName };
        v.index.alternateOf.set(c, a);
      }
      return a;
    }),
    ObjectLevelSecurity: p<Column>(
      { kind: "map", value: ENUMS.MetadataPermission, onMissingKey: MISSING_ROLE },
      (c, _o, v) =>
        teMap(
          v.model.roles.map((r) => [
            r.name,
            metadataPermission(
              permissionOn(r, c.table.name)?.columnPermissions.find(
                (cp) => lower(cp.column) === lower(c.name),
              )?.permission,
            ),
          ]),
        ),
    ),
    InPerspective: inPerspective<Column>((c) => key.column(c.table.name, c.name)),
    ...translated<Column>((c) => key.column(c.table.name, c.name), true),
    ReferencedBy: referencedByProp,
    DaxObjectName: p<Column>(STRING, (c) => `[${c.name.replace(/\]/g, "]]")}]`),
    DaxObjectFullName: p<Column>(STRING, (c) => columnRef(c.table.name, c.name)),
    DaxTableName: p<Column>(STRING, (c) => tableRef(c.table.name)),
    LineageTag: lineageTag,
    ...extra,
  };
}

const kpiProp = (prop: string) => p<KpiSource>(STRING, (k) => text(propOf(k.node, prop)));

/**
 * Every property and collection a rule may read, by object type: those Microsoft's ruleset and
 * the survey's rules read, and the common ones the Tabular Object Model and Tabular Editor give
 * each type. A name missing here for a type is one Tabular Editor does not have there either, or
 * one a project's files do not hold (UNKNOWN_PROPERTIES lists those with the reason); the
 * evaluator stops a rule that reads one, naming the nearest property (`nearestProperty`).
 *
 * This table is also the source the custom rules reference is generated from (pull request F), so
 * each entry's type is the one a rule author sees.
 */
export const PROPERTIES: Record<TomType, Record<string, PropertySpec>> = {
  Model: {
    ...named("Model", "Model"),
    Tables: p<Model>(TABLES, (m, _o, v) => objectsIn(v, m.tables)),
    Relationships: p<Model>(collectionOf(objectOf("Relationship")), (m, _o, v) =>
      objectsIn(v, m.relationships),
    ),
    Roles: p<Model>(collectionOf(objectOf("ModelRole")), (m, _o, v) => objectsIn(v, m.roles)),
    Perspectives: p<Model>(collectionOf(objectOf("Perspective")), (m, _o, v) =>
      objectsIn(v, m.perspectives),
    ),
    Cultures: p<Model>(collectionOf(objectOf("Culture")), (m, _o, v) => objectsIn(v, m.cultures)),
    Expressions: p<Model>(collectionOf(objectOf("NamedExpression")), (m, _o, v) =>
      objectsIn(v, m.expressions),
    ),
    DataSources: p<Model>(collectionOf(objectOf(...DATA_SOURCE_TYPES)), (m, _o, v) =>
      objectsIn(v, m.dataSources),
    ),
    Functions: p<Model>(collectionOf(objectOf("Function")), (m, _o, v) =>
      objectsIn(v, m.functions),
    ),
    CalculationGroups: p<Model>(collectionOf(objectOf("CalculationGroupTable")), (m, _o, v) =>
      objectsIn(
        v,
        m.tables.filter((t) => t.kind === "calculationGroup"),
      ),
    ),
    AllColumns: p<Model>(COLUMNS, (m, _o, v) =>
      objectsIn(
        v,
        m.tables.flatMap((t) => t.columns),
      ),
    ),
    AllMeasures: p<Model>(collectionOf(objectOf("Measure")), (m, _o, v) =>
      objectsIn(
        v,
        m.tables.flatMap((t) => t.measures),
      ),
    ),
    AllHierarchies: p<Model>(collectionOf(objectOf("Hierarchy")), (m, _o, v) =>
      objectsIn(
        v,
        m.tables.flatMap((t) => t.hierarchies),
      ),
    ),
    AllLevels: p<Model>(collectionOf(objectOf("Level")), (m, _o, v) =>
      objectsIn(
        v,
        m.tables.flatMap((t) => t.hierarchies.flatMap((h) => h.levels)),
      ),
    ),
    AllPartitions: p<Model>(collectionOf(objectOf("Partition")), (m, _o, v) =>
      objectsIn(
        v,
        m.tables.flatMap((t) => t.partitions),
      ),
    ),
    AllCalculationItems: p<Model>(collectionOf(objectOf("CalculationItem")), (m, _o, v) =>
      objectsIn(
        v,
        m.tables.flatMap((t) => t.calculationGroup?.items ?? []),
      ),
    ),
    Culture: p<Model>(STRING, (m) => text(m.props.culture)),
    SourceQueryCulture: p<Model>(STRING, (m) => text(m.props.sourcequeryculture)),
    Collation: p<Model>(STRING, (m) => text(m.props.collation)),
    // TOM's default mode for a model is Import.
    DefaultMode: p<Model>(ENUMS.ModeType, (m) =>
      enumOr(ENUMS.ModeType, m.props.defaultmode, "Import"),
    ),
    DefaultPowerBIDataSourceVersion: p<Model>(ENUMS.PowerBIDataSourceVersion, (m) =>
      enumOr(ENUMS.PowerBIDataSourceVersion, m.props.defaultpowerbidatasourceversion, UNSET),
    ),
    DiscourageImplicitMeasures: p<Model>(BOOLEAN, (m) =>
      flag(m.props.discourageimplicitmeasures, false),
    ),
  },

  Table: tableProps({}),
  CalculatedTable: tableProps({
    Expression: p<Table>(STRING, (t) =>
      t.partitions
        .filter((x) => x.sourceType === "calculated")
        .map((x) => x.source ?? "")
        .join("\n"),
    ),
    DependsOn: dependsOnProp,
  }),
  CalculationGroupTable: tableProps({
    CalculationItems: p<Table>(collectionOf(objectOf("CalculationItem")), (t, _o, v) =>
      objectsIn(v, t.calculationGroup?.items ?? []),
    ),
    CalculationGroup: p<Table>(objectOf("CalculationGroup"), (t, _o, v) =>
      t.calculationGroup ? (v.index.groupOf.get(t.calculationGroup) ?? null) : null,
    ),
    // TOM's default precedence is 0.
    CalculationGroupPrecedence: p<Table>(INT, (t) => t.calculationGroup?.precedence ?? 0),
  }),

  DataColumn: columnProps("Column", "Data", {
    SourceColumn: p<Column>(STRING, (c) => c.sourceColumn ?? ""),
  }),
  CalculatedColumn: columnProps("Calculated Column", "Calculated", {
    Expression: p<Column>(STRING, (c) => c.expression ?? ""),
    DependsOn: dependsOnProp,
  }),
  CalculatedTableColumn: columnProps("Calculated Table Column", "CalculatedTableColumn", {
    SourceColumn: p<Column>(STRING, (c) => c.sourceColumn ?? ""),
  }),

  Measure: {
    ...named("Measure", "Measure"),
    ...hideable<Measure>(),
    Table: p<Measure>(TABLE, (m, _o, v) => objectIn(v, m.table)),
    Expression: p<Measure>(STRING, (m) => m.expression),
    FormatString: p<Measure>(STRING, (m) => m.formatString ?? ""),
    FormatStringExpression: p<Measure>(STRING, (m) => m.formatStringDefinition ?? ""),
    DisplayFolder: p<Measure>(STRING, (m) => m.displayFolder ?? ""),
    DataCategory: p<Measure>(STRING, (m) => text(propOf(m.node, "datacategory"))),
    // The engine works a measure's type out from its DAX; TMDL rarely writes it.
    DataType: p<Measure>(ENUMS.DataType, (m) =>
      enumOr(ENUMS.DataType, propOf(m.node, "datatype"), UNSET),
    ),
    KPI: p<Measure>(objectOf("KPI"), (m, _o, v) => v.index.kpiOf.get(m) ?? null),
    InPerspective: inPerspective<Measure>((m) => key.measure(m.table.name, m.name)),
    ...translated<Measure>((m) => key.measure(m.table.name, m.name), true),
    ReferencedBy: referencedByProp,
    DependsOn: dependsOnProp,
    DaxObjectName: p<Measure>(STRING, (m) => measureRef(m.name)),
    DaxObjectFullName: p<Measure>(STRING, (m) => measureRef(m.name)),
    DaxTableName: p<Measure>(STRING, (m) => tableRef(m.table.name)),
    LineageTag: lineageTag,
  },

  KPI: {
    Name: { type: STRING, get: (o) => o.teName },
    Description: kpiProp("description"),
    ObjectType: fixed(ENUMS.ObjectType, "KPI"),
    ObjectTypeName: fixed(STRING, "KPI"),
    Model: modelProp(),
    Measure: p<KpiSource>(objectOf("Measure"), (k, _o, v) => objectIn(v, k.measure)),
    TargetExpression: kpiProp("targetexpression"),
    StatusExpression: kpiProp("statusexpression"),
    TrendExpression: kpiProp("trendexpression"),
    TargetFormatString: kpiProp("targetformatstring"),
    TargetDescription: kpiProp("targetdescription"),
    StatusDescription: kpiProp("statusdescription"),
    TrendDescription: kpiProp("trenddescription"),
    StatusGraphic: kpiProp("statusgraphic"),
    TrendGraphic: kpiProp("trendgraphic"),
    DependsOn: dependsOnProp,
  },

  Hierarchy: {
    ...named("Hierarchy", "Hierarchy"),
    ...hideable<Hierarchy>(),
    Table: p<Hierarchy>(TABLE, (h, _o, v) => objectIn(v, h.table)),
    DisplayFolder: p<Hierarchy>(STRING, (h) => text(propOf(h.node, "displayfolder"))),
    Levels: p<Hierarchy>(collectionOf(objectOf("Level")), (h, _o, v) => objectsIn(v, h.levels)),
    InPerspective: inPerspective<Hierarchy>((h) => key.hierarchy(h.table.name, h.name)),
    ...translated<Hierarchy>((h) => key.hierarchy(h.table.name, h.name), true),
    LineageTag: lineageTag,
  },

  Level: {
    ...named("Level", "Level"),
    Hierarchy: p<Level>(objectOf("Hierarchy"), (l, _o, v) => objectIn(v, l.hierarchy)),
    Table: p<Level>(TABLE, (l, _o, v) => objectIn(v, l.hierarchy.table)),
    Column: p<Level>(COLUMN, (l, _o, v) =>
      l.column === undefined ? null : objectIn(v, v.index.column(l.hierarchy.table.name, l.column)),
    ),
    Ordinal: p<Level>(INT, (l) => l.hierarchy.levels.indexOf(l)),
    ...translated<Level>((l) => key.level(l.hierarchy.table.name, l.hierarchy.name, l.name), false),
    LineageTag: lineageTag,
  },

  Partition: {
    ...named("Partition", "Partition"),
    Table: p<Partition>(TABLE, (x, _o, v) => objectIn(v, x.table)),
    SourceType: p<Partition>(ENUMS.PartitionSourceType, (x) =>
      enumOr(ENUMS.PartitionSourceType, x.sourceType, UNSET),
    ),
    Mode: p<Partition>(ENUMS.ModeType, (x) => enumOr(ENUMS.ModeType, x.mode, UNSET)),
    // Null where the partition has no expression at all (a calculation group's), as in TOM.
    Expression: p<Partition>(NULLABLE_STRING, (x) => x.source ?? null),
    Query: p<Partition>(NULLABLE_STRING, (x) => x.source ?? null),
    DataSource: p<Partition>(objectOf(...DATA_SOURCE_TYPES), (x, _o, v) =>
      x.dataSource === undefined
        ? null
        : objectIn(
            v,
            v.model.dataSources.find((d) => d.name === x.dataSource),
          ),
    ),
  },

  Relationship: {
    ...named("Relationship", "Relationship", false),
    FromColumn: p<Relationship>(COLUMN, (r, _o, v) =>
      objectIn(v, v.index.column(r.fromTable, r.fromColumn)),
    ),
    ToColumn: p<Relationship>(COLUMN, (r, _o, v) =>
      objectIn(v, v.index.column(r.toTable, r.toColumn)),
    ),
    FromTable: p<Relationship>(TABLE, (r, _o, v) => objectIn(v, v.index.table(r.fromTable))),
    ToTable: p<Relationship>(TABLE, (r, _o, v) => objectIn(v, v.index.table(r.toTable))),
    FromCardinality: p<Relationship>(ENUMS.RelationshipEndCardinality, (r) =>
      enumOr(ENUMS.RelationshipEndCardinality, r.fromCardinality, UNSET),
    ),
    ToCardinality: p<Relationship>(ENUMS.RelationshipEndCardinality, (r) =>
      enumOr(ENUMS.RelationshipEndCardinality, r.toCardinality, UNSET),
    ),
    CrossFilteringBehavior: p<Relationship>(ENUMS.CrossFilteringBehavior, (r) =>
      enumOr(ENUMS.CrossFilteringBehavior, r.crossFilteringBehavior, UNSET),
    ),
    // TOM's defaults: one direction, date and time, no referential integrity assumed.
    SecurityFilteringBehavior: p<Relationship>(ENUMS.SecurityFilteringBehavior, (r) =>
      enumOr(
        ENUMS.SecurityFilteringBehavior,
        propOf(r.node, "securityfilteringbehavior"),
        "OneDirection",
      ),
    ),
    JoinOnDateBehavior: p<Relationship>(ENUMS.DateTimeRelationshipBehavior, (r) =>
      enumOr(
        ENUMS.DateTimeRelationshipBehavior,
        propOf(r.node, "joinondatebehavior"),
        "DateAndTime",
      ),
    ),
    RelyOnReferentialIntegrity: p<Relationship>(BOOLEAN, (r) =>
      flag(propOf(r.node, "relyonreferentialintegrity"), false),
    ),
    IsActive: p<Relationship>(BOOLEAN, (r) => r.isActive),
  },

  Perspective: named("Perspective", "Perspective"),
  Culture: named("Culture", "Translation", false),

  ModelRole: {
    ...named("Role", "Role"),
    Members: p<Role>(collectionOf(objectOf("ModelRoleMember")), (r, _o, v) =>
      v.objectsOf("ModelRoleMember").filter((m) => (m.source as MemberSource).role === r),
    ),
    TablePermissions: p<Role>(collectionOf(objectOf("TablePermission")), (r, _o, v) =>
      objectsIn(v, r.tablePermissions),
    ),
    ModelPermission: p<Role>(ENUMS.ModelPermission, (r) =>
      enumOr(ENUMS.ModelPermission, r.modelPermission, UNSET),
    ),
    RowLevelSecurity: p<Role>(
      { kind: "map", value: STRING, onMissingKey: MISSING_TABLE },
      (r, _o, v) =>
        teMap(v.model.tables.map((t) => [t.name, permissionOn(r, t.name)?.filter ?? ""])),
    ),
  },

  ModelRoleMember: {
    Name: p<MemberSource>(STRING, (s) => s.member.name),
    MemberName: p<MemberSource>(STRING, (s) => s.member.name),
    ObjectType: fixed(ENUMS.ObjectType, "RoleMember"),
    ObjectTypeName: fixed(STRING, "Role Member"),
    Model: modelProp(),
    Role: p<MemberSource>(objectOf("ModelRole"), (s, _o, v) => objectIn(v, s.role)),
  },

  TablePermission: {
    ...named("TablePermission", "Table Permission"),
    Table: p<TablePermission>(TABLE, (tp, _o, v) => objectIn(v, v.index.table(tp.table))),
    Role: p<TablePermission>(objectOf("ModelRole"), (tp, _o, v) => objectIn(v, tp.role)),
    Expression: p<TablePermission>(STRING, (tp) => tp.filter ?? ""),
    FilterExpression: p<TablePermission>(STRING, (tp) => tp.filter ?? ""),
    MetadataPermission: p<TablePermission>(ENUMS.MetadataPermission, (tp) =>
      metadataPermission(tp.metadataPermission),
    ),
    DependsOn: dependsOnProp,
  },

  CalculationItem: {
    ...named("CalculationItem", "Calculation Item"),
    Expression: p<CalculationItem>(STRING, (i) => i.expression),
    FormatStringExpression: p<CalculationItem>(STRING, (i) => i.formatStringDefinition ?? ""),
    CalculationGroup: p<CalculationItem>(objectOf("CalculationGroupTable"), (i, _o, v) =>
      objectIn(v, i.table),
    ),
    Table: p<CalculationItem>(objectOf("CalculationGroupTable"), (i, _o, v) =>
      objectIn(v, i.table),
    ),
    Ordinal: p<CalculationItem>(INT, (i) => {
      const raw = propOf(i.node, "ordinal");
      return typeof raw === "string" && /^-?\d+$/.test(raw.trim()) ? Number(raw) : UNSET;
    }),
    DependsOn: dependsOnProp,
  },

  NamedExpression: {
    ...named("Expression", "Shared Expression"),
    Expression: p<NamedExpression>(STRING, (e) => e.expression),
  },

  ProviderDataSource: {
    ...named("DataSource", "Data Source"),
    Type: fixed(ENUMS.DataSourceType, "Provider"),
    ConnectionString: p<DataSource>(STRING, (d) => text(propOf(d.node, "connectionstring"))),
    UsedByPartitions: p<DataSource>(collectionOf(objectOf("Partition")), (d, _o, v) =>
      objectsIn(v, v.index.partitionsUsing.get(d) ?? []),
    ),
  },
  StructuredDataSource: {
    ...named("DataSource", "Data Source"),
    Type: fixed(ENUMS.DataSourceType, "Structured"),
    UsedByPartitions: p<DataSource>(collectionOf(objectOf("Partition")), (d, _o, v) =>
      objectsIn(v, v.index.partitionsUsing.get(d) ?? []),
    ),
  },

  Variation: {
    Name: p<VariationSource>(STRING, (s) => s.variation.name),
    Description: p<VariationSource>(STRING, (s) => s.node?.description ?? ""),
    ObjectType: fixed(ENUMS.ObjectType, "Variation"),
    ObjectTypeName: fixed(STRING, "Variation"),
    Model: modelProp(),
    Column: p<VariationSource>(COLUMN, (s, _o, v) => objectIn(v, s.column)),
    IsDefault: p<VariationSource>(BOOLEAN, (s) => flag(propOf(s.node, "isdefault"), false)),
    Relationship: p<VariationSource>(objectOf("Relationship"), (s, _o, v) =>
      s.variation.relationship === undefined
        ? null
        : objectIn(
            v,
            v.model.relationships.find((r) => r.name === s.variation.relationship),
          ),
    ),
    DefaultHierarchy: p<VariationSource>(objectOf("Hierarchy"), (s, _o, v) => {
      if (s.variation.defaultHierarchy === undefined) return null;
      const { table, column: name } = splitQualifiedName(s.variation.defaultHierarchy);
      return objectIn(
        v,
        v.index.table(table)?.hierarchies.find((h) => lower(h.name) === lower(name)),
      );
    }),
    DefaultColumn: p<VariationSource>(COLUMN, (s, _o, v) => {
      const d = s.variation.defaultColumn;
      return d ? objectIn(v, v.index.column(d.table, d.column)) : null;
    }),
  },

  Calendar: {
    ...named("Calendar", "Calendar"),
    Table: p<Calendar>(TABLE, (c, _o, v) => objectIn(v, c.table)),
    DaxObjectName: p<Calendar>(STRING, (c) => tableRef(c.name)),
    DaxObjectFullName: p<Calendar>(STRING, (c) => tableRef(c.name)),
  },

  Function: {
    ...named("Function", "Function"),
    Expression: p<DaxFunction>(STRING, (f) => f.expression),
    DependsOn: dependsOnProp,
  },

  CalculationGroup: {
    Description: p<CalculationGroup>(STRING, (g) => g.description ?? ""),
    ObjectType: fixed(ENUMS.ObjectType, "CalculationGroup"),
    ObjectTypeName: fixed(STRING, "Calculation Group"),
    Model: modelProp(),
    // TOM's default precedence is 0.
    Precedence: p<CalculationGroup>(INT, (g) => g.precedence ?? 0),
    CalculationItems: p<CalculationGroup>(collectionOf(objectOf("CalculationItem")), (g, _o, v) =>
      objectsIn(v, g.items),
    ),
    Table: p<CalculationGroup>(objectOf("CalculationGroupTable"), (g, _o, v) =>
      objectIn(v, g.table),
    ),
  },

  AlternateOf: {
    Summarization: p<AlternateOfSource>(ENUMS.SummarizationType, (a) =>
      enumOr(ENUMS.SummarizationType, a.alternateOf.summarization, "GroupBy"),
    ),
    BaseTable: p<AlternateOfSource>(TABLE, (a, _o, v) =>
      a.alternateOf.baseTable === undefined
        ? null
        : objectIn(v, v.index.table(a.alternateOf.baseTable)),
    ),
    BaseColumn: p<AlternateOfSource>(COLUMN, (a, _o, v) =>
      a.alternateOf.baseTable === undefined || a.alternateOf.baseColumn === undefined
        ? null
        : objectIn(v, v.index.column(a.alternateOf.baseTable, a.alternateOf.baseColumn)),
    ),
    Column: p<AlternateOfSource>(COLUMN, (a, _o, v) => objectIn(v, a.column)),
  },

  Dependency: {
    Key: p<DependencySource>(ANY_OBJECT, (d) => d.key),
    Value: p<DependencySource>(collectionOf(objectOf("ObjectReference")), (d) => d.refs),
  },

  ObjectReference: {
    FullyQualified: p<ReferenceSource>(BOOLEAN, (r) => r.fullyQualified),
  },
};

const STATISTICS =
  "needs statistics from a live model that a project's files do not hold; run the rule in Tabular Editor against a deployed model";
const SERVER_STATE = "is kept by the server for a deployed model and is not in a project's files";

/**
 * Names pbiplint knows it cannot answer from a project's files, with the reason a rule that reads
 * one reports. Keys are property names, and annotation names a rule passes to `GetAnnotation`
 * (Microsoft's ruleset reads annotations a script writes from a live model's statistics).
 */
export const UNKNOWN_PROPERTIES: Record<string, string> = {
  Vertipaq_Cardinality: STATISTICS,
  Vertipaq_RowCount: STATISTICS,
  Vertipaq_RIViolationInvalidRows: STATISTICS,
  Vertipaq_TableSize: STATISTICS,
  Vertipaq_ColumnSize: STATISTICS,
  Vertipaq_TotalSize: STATISTICS,
  LongLengthRowCount: STATISTICS,
  DateTimeWithHourMinSec: STATISTICS,
  State: SERVER_STATE,
  ErrorMessage: SERVER_STATE,
  RefreshedTime: SERVER_STATE,
  ModifiedTime: SERVER_STATE,
  StructureModifiedTime: SERVER_STATE,
};

/** The reason pbiplint cannot answer a name, if it is one it knows: any `Vertipaq_` annotation is. */
export function unknownReason(name: string): string | undefined {
  if (Object.hasOwn(UNKNOWN_PROPERTIES, name)) return UNKNOWN_PROPERTIES[name];
  return lower(name).startsWith("vertipaq_") ? STATISTICS : undefined;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * A known property close to a name the type does not have, for the reason a rule that reads it
 * gives: the same name in another case first, then one a small misspelling away. `Visible`, which
 * rules write for a measure though Tabular Editor has no such property, gives `IsHidden`.
 */
export function nearestProperty(type: TomType, name: string): string | undefined {
  const known = Object.keys(PROPERTIES[type]);
  if (lower(name) === "visible" && known.includes("IsHidden")) return "IsHidden";
  const sameCase = known.find((k) => lower(k) === lower(name));
  if (sameCase) return sameCase;
  const limit = name.length <= 4 ? 1 : name.length <= 8 ? 2 : 3;
  let best: string | undefined;
  let bestDistance = limit + 1;
  for (const k of known) {
    const d = editDistance(lower(k), lower(name));
    if (d < bestDistance) [best, bestDistance] = [k, d];
  }
  return best;
}
