/**
 * The tree a Tabular Editor rule expression parses to. Rule expressions are Dynamic LINQ, as
 * System.Linq.Dynamic.Core reads it for Tabular Editor 3, over the Tabular Object Model. Every node
 * keeps where it sits in the expression text (`start` inclusive, `end` exclusive, in UTF-16 code
 * units), so the evaluator can name a position when a rule cannot run.
 */
export interface TeSpan {
  start: number;
  end: number;
}

/**
 * The .NET type a number literal takes. An integer with no suffix takes the first of `int`, `uint`,
 * `long`, `ulong` that holds it; a real with no suffix is a `double`. Suffixes: `L` long, `U` uint,
 * `UL` or `LU` ulong, `F` float, `D` double, `M` decimal, in either case.
 */
export type TeNumberKind = "int" | "uint" | "long" | "ulong" | "float" | "double" | "decimal";

export type TeLiteral = TeSpan & { kind: "literal" } & (
    | { type: "string"; value: string }
    /** A single-quoted literal: always exactly one UTF-16 code unit. */
    | { type: "char"; value: string }
    | {
        type: "number";
        numberKind: TeNumberKind;
        /** The value as a JavaScript number; exact for `int`, `uint` and `double`. */
        value: number;
        /** The literal as written, without its suffix, for `long`, `ulong` and `decimal` precision. */
        text: string;
      }
    | { type: "boolean"; value: boolean }
    | { type: "null"; value: null }
  );

/** A name with no receiver: a property of `it`, or an enum's name when a member follows. Case as written. */
export interface TeIdent extends TeSpan {
  kind: "ident";
  name: string;
}

/**
 * `it` (or `$`): the object the innermost lambda body is running on, or the rule's object outside any.
 * `outerIt`: the object one lambda level up. `current`: the rule's object, at any depth.
 */
export interface TeScopeRef extends TeSpan {
  kind: "scope";
  which: "it" | "outerIt" | "current";
}

/**
 * A .NET type named in the expression, only ever the receiver of a static member or call, or the
 * type of a conversion. Never a value on its own.
 */
export interface TeTypeRef extends TeSpan {
  kind: "type";
  /** The .NET name (`String`, `Char`, `Int64`, `Regex`, `Math`, `Convert`, `StringComparison`, ...). */
  name: string;
  /** The name as the rule wrote it (`string`, `RegEx`, ...). */
  written: string;
}

export interface TeMember extends TeSpan {
  kind: "member";
  target: TeExpr | TeTypeRef;
  name: string;
}

export interface TeCall extends TeSpan {
  kind: "call";
  /** The receiver; a type for a static call; `null` for a call with none, which runs on `it`. */
  target: TeExpr | TeTypeRef | null;
  name: string;
  /** A collection method's arguments arrive wrapped in `lambdaBody`. */
  args: TeExpr[];
}

/**
 * An argument of a collection method (`Any`, `Where`, `Count`, ...), evaluated once per element with
 * `it` rebound to the element and `outerIt` to the object it was before.
 */
export interface TeLambdaBody extends TeSpan {
  kind: "lambdaBody";
  body: TeExpr;
}

/** `target[args]`: `Partitions[0]`, `InPerspective["Sales"]`. */
export interface TeIndex extends TeSpan {
  kind: "index";
  target: TeExpr;
  args: TeExpr[];
}

/** `Type(args)`: a conversion such as `char(9)`. */
export interface TeConvert extends TeSpan {
  kind: "convert";
  type: TeTypeRef;
  args: TeExpr[];
}

export type TeUnaryOp = "not" | "negate";

export interface TeUnary extends TeSpan {
  kind: "unary";
  op: TeUnaryOp;
  /** As written: `not`, `!`, `-`. */
  spelling: string;
  operand: TeExpr;
}

export type TeBinaryOp =
  | "coalesce"
  | "or"
  | "and"
  | "eq"
  | "ne"
  | "lt"
  | "gt"
  | "le"
  | "ge"
  | "add"
  | "sub"
  /** `&`: string concatenation of any two operands. */
  | "concat"
  | "mul"
  | "div"
  | "mod";

export interface TeBinary extends TeSpan {
  kind: "binary";
  op: TeBinaryOp;
  /** As written: `<>` or `!=`, `and` or `&&`, `%` or `mod`, ... */
  spelling: string;
  left: TeExpr;
  right: TeExpr;
}

/** `iif(test, then, else)` or `test ? then : else`. */
export interface TeConditional extends TeSpan {
  kind: "conditional";
  form: "iif" | "?:";
  test: TeExpr;
  then: TeExpr;
  else: TeExpr;
}

/** Parentheses, kept so a position can point at the whole group. */
export interface TeParen extends TeSpan {
  kind: "paren";
  expr: TeExpr;
}

export type TeExpr =
  | TeLiteral
  | TeIdent
  | TeScopeRef
  | TeMember
  | TeCall
  | TeLambdaBody
  | TeIndex
  | TeConvert
  | TeUnary
  | TeBinary
  | TeConditional
  | TeParen;
