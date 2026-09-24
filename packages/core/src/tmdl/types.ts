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
  text: string;
  reason: string;
}

/** A line of a TMDL file the parser could not use. */
export interface TmdlParseIssue extends ParseIssue {
  /**
   * Whether the issue can take an object, or a property the model reads, out of the model: a line
   * the parser skipped, which may have declared either, or a line at the root that the model does
   * not read the lines under, such as a misspelt `table` or a property or an annotation that lost
   * its tabs. False only for a `///` description that nothing claims, which loses the description
   * and no declaration. Set where the parser pushes the issue, so a rule that must not report what
   * the file may declare (BROKEN_FIELD_REFERENCE) reads this and never the reason's words.
   */
  canDropObjects: boolean;
  /**
   * Whether the issue can take a table's declaration line with it: it sits on a line at the root
   * that could be one, a line the parser could not make out or a declaration or flag whose type
   * TMDL does not declare at the root, or on a `table` line whose only indentation is spaces, or it
   * is a code fence left open that read a line at the root into its expression. A property, an
   * expression with no name, and an annotation with lines under it cannot be a `table` line and
   * are not marked. TMDL lets a table's declaration sit in more than one file, so a file with such
   * an issue may declare a table its roots do not show. Set where the parser pushes the issue, as
   * `canDropObjects` is, and never true where that is false.
   */
  canDropTableLine: boolean;
}

export interface ParsedFile {
  file: string;
  roots: TmdlNode[];
  issues: TmdlParseIssue[];
  lineCount: number;
}
