import type { FieldRef } from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A JSON pointer segment, with `~` and `/` escaped as RFC 6901 says. */
export const escapePointer = (s: string): string => s.replace(/~/g, "~0").replace(/\//g, "~1");

/**
 * Where a field's source leads: the table, the schema it names if any, and, through a variation,
 * the date column and variation.
 */
type Source = Pick<FieldRef, "table" | "variation" | "noTable" | "schema">;

/** What a From entry's alias stands for: its Entity, or "" for a subquery, and its Schema. */
interface Alias {
  entity: string;
  schema?: string;
}

/** A schema name, when the node carries a non-empty one. */
const schemaOf = (node: Record<string, unknown>): { schema?: string } =>
  typeof node.Schema === "string" && node.Schema !== "" ? { schema: node.Schema } : {};

/**
 * The source of a Column, Measure, or Hierarchy, which the semanticQuery schema says is a
 * SourceRef, a PropertyVariationSource, or (for a Column or Measure) a TransformTableRef. A
 * SourceRef names its table as an Entity or through an alias a From list declares. A
 * PropertyVariationSource is a date column's variation: its own SourceRef gives the column's
 * table. A TransformTableRef names a transform's output, not a model table, so it yields nothing
 * and the reference is not collected. A SourceRef may name a Schema beside its Entity, and a From
 * entry beside its alias's Entity; a variation's source keeps what its own SourceRef names.
 */
function sourceOf(expression: unknown, aliases: ReadonlyMap<string, Alias>): Source | undefined {
  if (!isRecord(expression)) return { table: "", noTable: "noSource" };
  if (isRecord(expression.TransformTableRef)) return undefined;
  const variation = expression.PropertyVariationSource;
  if (
    isRecord(variation) &&
    typeof variation.Property === "string" &&
    typeof variation.Name === "string"
  ) {
    const inner = sourceOf(variation.Expression, aliases);
    if (!inner) return undefined;
    return { ...inner, variation: { column: variation.Property, name: variation.Name } };
  }
  const ref = expression.SourceRef;
  if (isRecord(ref) && typeof ref.Entity === "string")
    return { table: ref.Entity, ...schemaOf(ref) };
  if (isRecord(ref) && typeof ref.Source === "string") {
    const alias = aliases.get(ref.Source);
    if (alias === undefined) return { table: "", noTable: "undeclaredAlias" };
    const schema = alias.schema !== undefined ? { schema: alias.schema } : {};
    return alias.entity === ""
      ? { table: "", noTable: "nonTableAlias", ...schema }
      : { table: alias.entity, ...schema };
  }
  return { table: "", noTable: "noSource" };
}

/**
 * Every field reference under a JSON node: a visual's projections, a filter's field and its
 * condition, a bookmark's state, a page binding's parameters. Column, Measure, Aggregation, and
 * HierarchyLevel are recognised wherever they sit, so a property the schema adds later is covered
 * without a change here. A `From` list declares aliases for the object that carries it and
 * everything beneath it, which is how a filter's Where refers to its own table; a reference whose
 * source yields no table (an alias with no From in scope, an alias for a subquery, a source that
 * names nothing) has an empty table and says why in `noTable`, which the index reports as
 * unresolved. A reference whose source is a transform's output is not a model field and is left out.
 * A reference that names a Schema, in its SourceRef or in the From entry of its alias, carries it,
 * as Desktop's references to the report's own measures do (`"Schema": "extension"`). A Column whose
 * source is a Subquery, bare or under an Aggregation, is Power BI Desktop's form for a text box's
 * field value: it names a column of the subquery's result by a Select item's Name, not a model
 * field, so it is left out as a TopN filter's `In.Table` is, and its query is walked as a From
 * entry's subquery is, so every field the query reads is collected where it sits.
 */
export function collectFieldRefs(
  node: unknown,
  pointer = "",
  aliases: ReadonlyMap<string, Alias> = new Map(),
): FieldRef[] {
  const out: FieldRef[] = [];
  const push = (
    kind: FieldRef["kind"],
    source: Source,
    name: string,
    p: string,
    level?: string,
  ): void => {
    out.push({
      kind,
      table: source.table,
      name,
      ...(level !== undefined ? { level } : {}),
      ...(source.variation ? { variation: source.variation } : {}),
      ...(source.noTable ? { noTable: source.noTable } : {}),
      ...(source.schema !== undefined ? { schema: source.schema } : {}),
      pointer: p,
    });
  };
  /**
   * Walks the query of a Column (at pointer `at`) whose source is a Subquery, with the enclosing
   * aliases in scope and its own From adding and shadowing them, and says whether it did. A
   * Measure or a Hierarchy over a Subquery is not read this way: none of the Desktop-saved reports
   * surveyed writes either, so each stays a reference whose source names no model table.
   */
  const walkedSubquery = (
    column: Record<string, unknown>,
    at: string,
    scope: ReadonlyMap<string, Alias>,
  ): boolean => {
    const source = column.Expression;
    if (!isRecord(source) || !isRecord(source.Subquery)) return false;
    walk(source.Subquery.Query, `${at}/Expression/Subquery/Query`, scope);
    return true;
  };
  const walk = (n: unknown, p: string, scope: ReadonlyMap<string, Alias>): void => {
    if (Array.isArray(n)) {
      n.forEach((item, i) => walk(item, `${p}/${i}`, scope));
      return;
    }
    if (!isRecord(n)) return;
    if (Array.isArray(n.From)) {
      const next = new Map(scope);
      // A nested From shadows the outer alias of the same name whatever it declares: a subquery
      // entry names no Entity, and the alias it introduces is not the outer table.
      for (const f of n.From)
        if (isRecord(f) && typeof f.Name === "string")
          next.set(f.Name, {
            entity: typeof f.Entity === "string" ? f.Entity : "",
            ...schemaOf(f),
          });
      scope = next;
    }
    if (isRecord(n.Column) && typeof n.Column.Property === "string") {
      if (walkedSubquery(n.Column, `${p}/Column`, scope)) return;
      const source = sourceOf(n.Column.Expression, scope);
      if (source) push("column", source, n.Column.Property, p);
      return;
    }
    if (isRecord(n.Measure) && typeof n.Measure.Property === "string") {
      const source = sourceOf(n.Measure.Expression, scope);
      if (source) push("measure", source, n.Measure.Property, p);
      return;
    }
    if (isRecord(n.Aggregation) && isRecord(n.Aggregation.Expression)) {
      const inner = n.Aggregation.Expression.Column;
      if (isRecord(inner) && typeof inner.Property === "string") {
        if (walkedSubquery(inner, `${p}/Aggregation/Expression/Column`, scope)) return;
        const source = sourceOf(inner.Expression, scope);
        if (source) push("aggregation", source, inner.Property, p);
        return;
      }
    }
    const level = isRecord(n.HierarchyLevel) ? n.HierarchyLevel : undefined;
    const hierarchy = level
      ? isRecord(level.Expression)
        ? level.Expression.Hierarchy
        : undefined
      : n.Hierarchy;
    if (isRecord(hierarchy) && typeof hierarchy.Hierarchy === "string") {
      const source = sourceOf(hierarchy.Expression, scope);
      if (source)
        push(
          "hierarchyLevel",
          source,
          hierarchy.Hierarchy,
          p,
          typeof level?.Level === "string" ? level.Level : undefined,
        );
      return;
    }
    for (const [key, value] of Object.entries(n)) walk(value, `${p}/${escapePointer(key)}`, scope);
  };
  walk(node, pointer, aliases);
  return out;
}
