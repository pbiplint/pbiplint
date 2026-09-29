export type TmdlNodeKind = "object" | "prop" | "flag" | "ref" | "expr";

/** One line of TMDL and everything indented beneath it. `type` and `props` keys are lowercased. */
export interface TmdlNode {
  kind: TmdlNodeKind;
  /** Object type (`table`, `column`), property key (`datatype`), flag (`ishidden`), or ref target type. */
  type: string;
  /** Unquoted object name, for `object` and `ref` nodes. */
  name?: string;
  /** Property value (unquoted) for `prop`; expression text for `expr` and for `object` nodes declared with `=`. */
  value?: string;
  /**
   * The file line of the value's first line, on a node whose value is read after `=` (an `expr`
   * node, or an `object` node declared with `=`): the header's own line for an inline value, the
   * first non-blank line of an indented block, the line after the header for a code fence, closed
   * or not. Every line of the value is a line of the file, in order (a blank line inside it is
   * kept as an empty line), so an offset into `value` lies on this line plus the line breaks
   * before it.
   */
  valueLine?: number;
  /** Child properties, flags, and expressions by lowercased key. Flags are `true`. */
  props: Record<string, string | true>;
  children: TmdlNode[];
  /** Joined `///` lines that preceded the declaration. */
  description?: string;
  file: string;
  line: number;
  indent: number;
}

export interface ParseIssue {
  file: string;
  line: number;
  /**
   * The line the issue is on, as PARSE_ISSUE quotes it. A TMDL issue quotes its whole line; a
   * JSON issue at most 120 characters of it, since a minified document is one line (readJson).
   */
  text: string;
  reason: string;
}

/** A line of a TMDL file the parser could not use. */
export interface TmdlParseIssue extends ParseIssue {
  /**
   * Whether the issue can take an object, or a property the model reads, out of the model: a line
   * the parser skipped, which may have declared either, or a line at the root, or directly under
   * the model (#137), that the model does not read the lines under, such as a misspelt `table` or
   * a property or an annotation that lost its tabs. False only for a `///` description that
   * nothing claims, which loses the description and no declaration. Set where the parser pushes
   * the issue, so a rule that must not report what the file may declare (BROKEN_FIELD_REFERENCE)
   * reads this and never the reason's words.
   */
  canDropObjects: boolean;
  /**
   * Whether the issue can take a table's declaration line with it: it sits on a line at the root,
   * or directly under the model (#137), that could be one, a line the parser could not make out or
   * a declaration or flag whose type TMDL does not declare there; on a line whose word is `table`
   * however it is indented or written (spaces, a stray tab, tabs and spaces, `table: Sales`,
   * `table = Sales`); on the first line of a file that has lost its own declaration's line, an
   * orphan before any root; or it is a code fence left open that read such a line into its
   * expression. Any other property, expression with no name, or annotation with lines under it
   * cannot be a `table` line and is not marked. TMDL lets a table's declaration sit in more than
   * one file, so a file with such an issue may declare a table its declarations do not show. Set
   * where the parser pushes the issue, as `canDropObjects` is, and never true where that is false.
   */
  canDropTableLine: boolean;
}

export interface ParsedFile {
  file: string;
  roots: TmdlNode[];
  issues: TmdlParseIssue[];
  lineCount: number;
}
