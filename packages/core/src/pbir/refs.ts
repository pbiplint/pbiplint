import type { FieldRef } from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A JSON pointer segment, with `~` and `/` escaped as RFC 6901 says. */
export const escapePointer = (s: string): string => s.replace(/~/g, "~0").replace(/\//g, "~1");

/** The table a SourceRef names: its Entity, or the alias its Source points at within the enclosing filter. */
function entityOf(expression: unknown, aliases: ReadonlyMap<string, string>): string {
  const ref = isRecord(expression) ? expression.SourceRef : undefined;
  if (!isRecord(ref)) return "";
  if (typeof ref.Entity === "string") return ref.Entity;
  if (typeof ref.Source === "string") return aliases.get(ref.Source) ?? "";
  return "";
}

/**
 * Every field reference under a JSON node: a visual's projections, a filter's field and its
 * condition, a bookmark's state, a page binding's parameters. Column, Measure, Aggregation, and
 * HierarchyLevel are recognised wherever they sit, so a property the schema adds later is covered
 * without a change here. A `From` list declares aliases for the object that carries it and
 * everything beneath it, which is how a filter's Where refers to its own table; an alias with no
 * From in scope yields a reference with an empty table, which the index reports as unresolved.
 */
export function collectFieldRefs(
  node: unknown,
  pointer = "",
  aliases: ReadonlyMap<string, string> = new Map(),
): FieldRef[] {
  const out: FieldRef[] = [];
  const walk = (n: unknown, p: string, scope: ReadonlyMap<string, string>): void => {
    if (Array.isArray(n)) {
      n.forEach((item, i) => walk(item, `${p}/${i}`, scope));
      return;
    }
    if (!isRecord(n)) return;
    if (Array.isArray(n.From)) {
      const next = new Map(scope);
      for (const f of n.From)
        if (isRecord(f) && typeof f.Name === "string" && typeof f.Entity === "string")
          next.set(f.Name, f.Entity);
      scope = next;
    }
    if (isRecord(n.Column) && typeof n.Column.Property === "string") {
      out.push({
        kind: "column",
        table: entityOf(n.Column.Expression, scope),
        name: n.Column.Property,
        pointer: p,
      });
      return;
    }
    if (isRecord(n.Measure) && typeof n.Measure.Property === "string") {
      out.push({
        kind: "measure",
        table: entityOf(n.Measure.Expression, scope),
        name: n.Measure.Property,
        pointer: p,
      });
      return;
    }
    if (isRecord(n.Aggregation) && isRecord(n.Aggregation.Expression)) {
      const inner = n.Aggregation.Expression.Column;
      if (isRecord(inner) && typeof inner.Property === "string") {
        out.push({
          kind: "aggregation",
          table: entityOf(inner.Expression, scope),
          name: inner.Property,
          pointer: p,
        });
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
      out.push({
        kind: "hierarchyLevel",
        table: entityOf(hierarchy.Expression, scope),
        name: hierarchy.Hierarchy,
        ...(typeof level?.Level === "string" ? { level: level.Level } : {}),
        pointer: p,
      });
      return;
    }
    for (const [key, value] of Object.entries(n)) walk(value, `${p}/${escapePointer(key)}`, scope);
  };
  walk(node, pointer, aliases);
  return out;
}
