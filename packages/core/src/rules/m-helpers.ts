import type { Language } from "@microsoft/powerquery-parser";
import { stepOf } from "../m/ast.js";
import type { MIndex, MQuery } from "../m/types.js";
import { tableRef } from "../model/names.js";
import type { NamedExpression, Partition, Table } from "../model/types.js";
import { finding } from "./helpers.js";
import type { RuleFinding } from "./types.js";

/**
 * The query as Power Query's Queries pane names it (v3 spec, section 6.3): `query 'Sales'`, with
 * the partition's name after it when its table has more than one M partition, which Desktop does
 * not write but a hand-edited model can hold.
 */
export function queryLabel(q: MQuery): string {
  const query = `query ${tableRef(q.name)}`;
  if (q.kind !== "partition") return query;
  const p = q.owner as Partition;
  const mPartitions = p.table.partitions.filter((x) => x.sourceType === "m");
  return mPartitions.length > 1 ? `${query}, partition ${tableRef(p.name)}` : query;
}

/** The object a query's finding names: its partition, its shared expression, or the table whose refresh policy holds it. */
function ownerFinding(q: MQuery): RuleFinding {
  if (q.kind === "partition") return finding.partition(q.owner as Partition);
  if (q.kind === "expression") return finding.expression(q.owner as NamedExpression);
  return finding.table(q.owner as Table);
}

/**
 * A finding on one node of a query (v3 spec, sections 6 and 9.1): on the query's owner, at the
 * TMDL line and column of the node's first token, with a detail that names the query, the step
 * that holds the node when there is one, and then `what`.
 */
export function mFinding(
  m: MIndex,
  q: MQuery,
  node: Language.Ast.TNode,
  what: string,
): RuleFinding {
  const step = stepOf(q, node);
  return {
    ...ownerFinding(q),
    location: m.locate(q, node.tokenRange.positionStart),
    detail: `${queryLabel(q)}${step === undefined ? "" : `, step ${tableRef(step)}`}: ${what}`,
  };
}
