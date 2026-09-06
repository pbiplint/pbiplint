import type { Model, Relationship } from "../model/types.js";

export interface RelationshipIndex {
  all: Relationship[];
  /** Relationships in which the column is the from-side or the to-side. */
  forColumn(table: string, column: string): Relationship[];
  /** Relationships in which the table is on either side. */
  forTable(table: string): Relationship[];
}

const key = (table: string, column: string): string => `${table} ${column}`;

function push(map: Map<string, Relationship[]>, k: string, r: Relationship): void {
  const arr = map.get(k);
  if (!arr) map.set(k, [r]);
  else if (!arr.includes(r)) arr.push(r);
}

export function buildRelationshipIndex(model: Model): RelationshipIndex {
  const byColumn = new Map<string, Relationship[]>();
  const byTable = new Map<string, Relationship[]>();
  for (const r of model.relationships) {
    push(byColumn, key(r.fromTable, r.fromColumn), r);
    push(byColumn, key(r.toTable, r.toColumn), r);
    push(byTable, r.fromTable, r);
    push(byTable, r.toTable, r);
  }
  return {
    all: model.relationships,
    forColumn: (table, column) => byColumn.get(key(table, column)) ?? [],
    forTable: (table) => byTable.get(table) ?? [],
  };
}
