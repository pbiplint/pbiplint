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
   * Whether the issue can take an object out of the model: a line the parser skipped, which may
   * have declared one, or a line it read but the model does not hold, with everything under it.
   * False only for a `///` description that nothing claims, which loses the description and no
   * declaration. Set where the parser pushes the issue, so a rule that must not report what the
   * file may declare (BROKEN_FIELD_REFERENCE) reads this and never the reason's words.
   */
  canDropObjects: boolean;
}

export interface ParsedFile {
  file: string;
  roots: TmdlNode[];
  issues: TmdlParseIssue[];
  lineCount: number;
}
