import type { Column, Model } from "../model/types.js";

export interface UsageIndex {
  /** Another column in the same table sorts by this column. */
  usedInSortBy(c: Column): boolean;
  /** A hierarchy level in the same table uses this column. */
  usedInHierarchies(c: Column): boolean;
  /** A variation anywhere names this column as its default column. */
  usedInVariations(c: Column): boolean;
}

const key = (table: string, column: string): string => `${table} ${column}`;

export function buildUsageIndex(model: Model): UsageIndex {
  const sortTargets = new Set<string>();
  const levelColumns = new Set<string>();
  const variationDefaults = new Set<string>();
  for (const t of model.tables) {
    for (const c of t.columns) {
      if (c.sortByColumn !== undefined) sortTargets.add(key(t.name, c.sortByColumn));
      for (const v of c.variations)
        if (v.defaultColumn)
          variationDefaults.add(key(v.defaultColumn.table, v.defaultColumn.column));
    }
    for (const h of t.hierarchies)
      for (const l of h.levels) if (l.column !== undefined) levelColumns.add(key(t.name, l.column));
  }
  return {
    usedInSortBy: (c) => sortTargets.has(key(c.table.name, c.name)),
    usedInHierarchies: (c) => levelColumns.has(key(c.table.name, c.name)),
    usedInVariations: (c) => variationDefaults.has(key(c.table.name, c.name)),
  };
}
