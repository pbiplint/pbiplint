import type { Language, Parser } from "@microsoft/powerquery-parser";
import type { NamedExpression, Partition, SourceLocation, Table } from "../model/types.js";
import type { ParseIssue } from "../tmdl/types.js";
import type { MPosition } from "./parse.js";

/**
 * One M expression the model holds, as Power Query's Queries pane names it (v3 spec, sections 5.1
 * and 6.3): a partition's or a refresh policy's query by its table's name, a shared expression by
 * its own. `valueLine` is the TMDL line of the M's first line; M line n is TMDL line valueLine + n.
 * `ast` and `nodeIdMapCollection` are set when the M parsed.
 */
export interface MQuery {
  kind: "partition" | "expression" | "refreshPolicy";
  name: string;
  owner: Partition | NamedExpression | Table;
  text: string;
  file: string;
  valueLine: number;
  ast?: Language.Ast.TNode;
  nodeIdMapCollection?: Parser.NodeIdMap.Collection;
}

/** M that does not parse, at the TMDL line and column the parser stopped at. */
export interface MParseIssue extends ParseIssue {
  column: number;
}

/** Every M expression in the model, read once per lint, and where a place in one sits in its file. */
export interface MIndex {
  queries: MQuery[];
  issues: MParseIssue[];
  /** The TMDL file, line, and 1-based column of a place in a query's M. */
  locate(q: MQuery, at: MPosition): SourceLocation;
  /**
   * `text`, the TMDL file's line `line`, with every code unit hidden that masking the whole file or
   * the line alone would hide (v3 spec, section 7, amended October 27, 2026). When `text` is not
   * that line of the file, only the line's own masking applies.
   */
  maskedLine(file: string, line: number, text: string): string;
}
