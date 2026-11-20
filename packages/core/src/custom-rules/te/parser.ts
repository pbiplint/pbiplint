import { LIMITS } from "../limits.js";
import type { TeBinaryOp, TeExpr, TeTypeRef } from "./ast.js";
import { lex, TeSyntaxError, type TeToken } from "./lexer.js";

/**
 * The .NET types an expression may name, keyed by lowercase spelling: Dynamic LINQ's predefined
 * types and their C# aliases, `Math`, `Convert`, and the types Tabular Editor adds that rules call
 * statically. Dynamic LINQ matches type names ignoring case, which is why `RegEx` and `Regex` both
 * work. Enum names that are also properties (`DataType`, `CrossFilteringBehavior`) are not here:
 * `DataType.ToString()` reads the property, so the evaluator decides those.
 */
const TYPES = new Map<string, string>(
  [
    ...[
      "Object",
      "Boolean",
      "Char",
      "String",
      "SByte",
      "Byte",
      "Int16",
      "UInt16",
      "Int32",
      "UInt32",
      "Int64",
      "UInt64",
      "Single",
      "Double",
      "Decimal",
      "DateTime",
      "DateTimeOffset",
      "TimeSpan",
      "Guid",
      "Math",
      "Convert",
      "Regex",
      "StringComparison",
    ].map((t): [string, string] => [t, t]),
    ...Object.entries({
      object: "Object",
      bool: "Boolean",
      char: "Char",
      string: "String",
      sbyte: "SByte",
      byte: "Byte",
      short: "Int16",
      ushort: "UInt16",
      int: "Int32",
      uint: "UInt32",
      long: "Int64",
      ulong: "UInt64",
      float: "Single",
      double: "Double",
      decimal: "Decimal",
    }),
  ].map(([k, v]) => [k.toLowerCase(), v]),
);

/**
 * Collection methods whose arguments are lambda bodies, matched ignoring case. `Contains`, `Take`,
 * `Skip` and the like take values, so they are not here.
 */
const LAMBDA_METHODS = new Set(
  [
    "All",
    "Any",
    "Average",
    "Count",
    "LongCount",
    "First",
    "FirstOrDefault",
    "Last",
    "LastOrDefault",
    "Single",
    "SingleOrDefault",
    "Max",
    "Min",
    "Sum",
    "Where",
    "Select",
    "SelectMany",
    "OrderBy",
    "OrderByDescending",
    "ThenBy",
    "ThenByDescending",
    "TakeWhile",
    "SkipWhile",
    "GroupBy",
    "DistinctBy",
  ].map((m) => m.toLowerCase()),
);

/** Words with a meaning of their own, matched ignoring case; none of them is a property name. */
const KEYWORDS = new Set([
  "true",
  "false",
  "null",
  "it",
  "outerit",
  "current",
  "iif",
  "not",
  "and",
  "or",
  "mod",
]);

const EQUALITY: Record<string, TeBinaryOp> = {
  "=": "eq",
  "==": "eq",
  "!=": "ne",
  "<>": "ne",
  "<": "lt",
  ">": "gt",
  "<=": "le",
  ">=": "ge",
};
const ADDITIVE: Record<string, TeBinaryOp> = { "+": "add", "-": "sub", "&": "concat" };
const MULTIPLICATIVE: Record<string, TeBinaryOp> = {
  "*": "mul",
  "/": "div",
  "%": "mod",
  mod: "mod",
};

const count = (n: number) => n.toLocaleString("en-US");

/** How a token reads in a message: one token at most, and never a string's contents. */
function describe(t: TeToken): string {
  switch (t.type) {
    case "end":
      return "the end of the expression";
    case "string":
      return "a string";
    case "char":
      return "a character literal";
    case "number":
      return `'${clip(t.text)}'`;
    case "ident":
      return `'${clip(t.text)}'`;
    case "op":
      return `'${t.text}'`;
  }
}
const clip = (s: string) => (s.length > 24 ? `${s.slice(0, 24)}...` : s);

/**
 * Parses a Tabular Editor rule expression to a tree, or says why it cannot, naming the position
 * (1-based) and what was expected. Precedence, lowest first: `?:`, `??`, `or ||`, `and &&`, the
 * comparisons (`= == != <> < > <= >=`, one level as in Dynamic LINQ), `+ - &`, `* / % mod`, unary
 * `not ! -`, then member access, calls and indexers. Length is held to `LIMITS.expressionChars` and
 * nesting to `LIMITS.nesting`, so a hostile expression is refused before it can exhaust the stack.
 */
export function parseTeExpression(text: string): { expr: TeExpr } | { error: string } {
  if (text.length > LIMITS.expressionChars) {
    return {
      error: `the expression is longer than the limit of ${count(LIMITS.expressionChars)} characters`,
    };
  }
  try {
    const p = new Parser(lex(text));
    const expr = p.expression();
    p.expectEnd();
    return { expr };
  } catch (e) {
    if (e instanceof TeSyntaxError) return { error: e.message };
    throw e;
  }
}

class Parser {
  private i = 0;
  private depth = 0;

  constructor(private readonly tokens: TeToken[]) {}

  private get t(): TeToken {
    return this.tokens[this.i]!;
  }
  private peek(k = 1): TeToken {
    return this.tokens[Math.min(this.i + k, this.tokens.length - 1)]!;
  }
  private isOp(text: string, t: TeToken = this.t): boolean {
    return t.type === "op" && t.text === text;
  }
  /** The token as an unescaped keyword, in lowercase, or undefined. */
  private keyword(t: TeToken = this.t): string | undefined {
    if (t.type !== "ident" || t.escaped) return undefined;
    const k = t.text.toLowerCase();
    return KEYWORDS.has(k) ? k : undefined;
  }

  private fail(expected: string): never {
    const t = this.t;
    if (this.isOp("=>")) {
      throw new TeSyntaxError(
        "a named lambda parameter ('x => ...'), which Tabular Editor does not run,",
        t.start,
        undefined,
        "write the body with 'it' instead",
      );
    }
    throw new TeSyntaxError(`expected ${expected}`, t.start, describe(t));
  }
  private expectOp(text: string): TeToken {
    if (!this.isOp(text)) this.fail(`'${text}'`);
    return this.tokens[this.i++]!;
  }
  expectEnd(): void {
    if (this.t.type !== "end") this.fail("an operator or the end of the expression");
  }

  private enter(at: number): void {
    if (++this.depth > LIMITS.nesting) {
      throw new TeSyntaxError(`the expression nests deeper than ${LIMITS.nesting} levels`, at);
    }
  }

  /** A whole expression: the conditional operator, the lowest level. */
  expression(): TeExpr {
    this.enter(this.t.start);
    const test = this.coalesce();
    let result = test;
    if (this.isOp("?")) {
      this.i++;
      const then = this.expression();
      this.expectOp(":");
      const otherwise = this.expression();
      result = {
        kind: "conditional",
        form: "?:",
        test,
        then,
        else: otherwise,
        start: test.start,
        end: otherwise.end,
      };
    }
    this.depth--;
    return result;
  }

  private coalesce(): TeExpr {
    let left = this.or();
    while (this.isOp("??")) {
      const spelling = this.take();
      const right = this.or();
      left = {
        kind: "binary",
        op: "coalesce",
        spelling,
        left,
        right,
        start: left.start,
        end: right.end,
      };
    }
    return left;
  }

  private or(): TeExpr {
    let left = this.and();
    while (this.isOp("||") || this.keyword() === "or") {
      const spelling = this.take();
      const right = this.and();
      left = { kind: "binary", op: "or", spelling, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private and(): TeExpr {
    let left = this.comparison();
    while (this.isOp("&&") || this.keyword() === "and") {
      const spelling = this.take();
      const right = this.comparison();
      left = {
        kind: "binary",
        op: "and",
        spelling,
        left,
        right,
        start: left.start,
        end: right.end,
      };
    }
    return left;
  }

  private comparison(): TeExpr {
    return this.level(EQUALITY, () => this.additive());
  }
  private additive(): TeExpr {
    return this.level(ADDITIVE, () => this.multiplicative());
  }
  private multiplicative(): TeExpr {
    return this.level(MULTIPLICATIVE, () => this.unary());
  }

  /** One left-to-right binary level whose operators are in `ops` (word operators by lowercase). */
  private level(ops: Record<string, TeBinaryOp>, next: () => TeExpr): TeExpr {
    let left = next();
    for (;;) {
      const t = this.t;
      const key = t.type === "op" ? t.text : this.keyword(t);
      const op = key === undefined ? undefined : ops[key];
      if (op === undefined) return left;
      const spelling = this.take();
      const right = next();
      left = { kind: "binary", op, spelling, left, right, start: left.start, end: right.end };
    }
  }

  /** Consumes the current token and returns it as written. */
  private take(): string {
    const t = this.tokens[this.i++]!;
    return t.type === "op" || t.type === "ident" ? t.text : "";
  }

  private unary(): TeExpr {
    const t = this.t;
    const word = this.keyword(t) === "not";
    if (word || this.isOp("!") || this.isOp("-")) {
      this.enter(t.start);
      const spelling = this.take();
      const operand = this.unary();
      this.depth--;
      return {
        kind: "unary",
        op: spelling === "-" ? "negate" : "not",
        spelling,
        operand,
        start: t.start,
        end: operand.end,
      };
    }
    return this.postfix(this.primary());
  }

  /** Member access, calls and indexers after a primary, left to right. */
  private postfix(expr: TeExpr): TeExpr {
    for (;;) {
      if (this.isOp(".")) {
        this.i++;
        expr = this.memberOrCall(expr);
      } else if (this.isOp("[")) {
        const args = this.list("[", "]");
        expr = { kind: "index", target: expr, args: args.items, start: expr.start, end: args.end };
      } else {
        return expr;
      }
    }
  }

  /** After a `.`: a member name, then a call if `(` follows. */
  private memberOrCall(target: TeExpr | TeTypeRef): TeExpr {
    const name = this.t;
    if (name.type !== "ident") this.fail("a member name");
    this.i++;
    if (this.isOp("(")) return this.call(target, name.text, target.start);
    return { kind: "member", target, name: name.text, start: target.start, end: name.end };
  }

  private call(target: TeExpr | TeTypeRef | null, name: string, start: number): TeExpr {
    const args = this.list("(", ")");
    const lambda = target?.kind !== "type" && LAMBDA_METHODS.has(name.toLowerCase());
    const items = lambda
      ? args.items.map((body): TeExpr => ({
          kind: "lambdaBody",
          body,
          start: body.start,
          end: body.end,
        }))
      : args.items;
    return { kind: "call", target, name, args: items, start, end: args.end };
  }

  /** A bracketed, comma-separated list of expressions. */
  private list(open: string, close: string): { items: TeExpr[]; end: number } {
    this.expectOp(open);
    const items: TeExpr[] = [];
    if (!this.isOp(close)) {
      for (;;) {
        items.push(this.expression());
        if (this.isOp(",")) {
          this.i++;
          continue;
        }
        if (!this.isOp(close)) this.fail(`',' or '${close}'`);
        break;
      }
    }
    const end = this.expectOp(close).end;
    return { items, end };
  }

  private primary(): TeExpr {
    const t = this.t;
    const { start, end } = t;
    switch (t.type) {
      case "string":
      case "char":
        this.i++;
        return { kind: "literal", type: t.type, value: t.value, start, end };
      case "number":
        this.i++;
        return {
          kind: "literal",
          type: "number",
          numberKind: t.numberKind,
          value: t.value,
          text: t.text,
          start,
          end,
        };
      case "op":
        if (t.text === "(") {
          this.i++;
          const expr = this.expression();
          const close = this.expectOp(")");
          return { kind: "paren", expr, start, end: close.end };
        }
        if (t.text === "$") {
          this.i++;
          return { kind: "scope", which: "it", start, end };
        }
        return this.fail("an expression");
      case "end":
        return this.fail("an expression");
      case "ident":
        return this.name(t);
    }
  }

  private name(t: TeToken & { type: "ident" }): TeExpr {
    const { start, end } = t;
    const k = this.keyword(t);
    if (k !== undefined) {
      switch (k) {
        case "true":
        case "false":
          this.i++;
          return { kind: "literal", type: "boolean", value: k === "true", start, end };
        case "null":
          this.i++;
          return { kind: "literal", type: "null", value: null, start, end };
        case "it":
        case "outerit":
        case "current":
          this.i++;
          return { kind: "scope", which: k === "outerit" ? "outerIt" : k, start, end };
        case "iif":
          return this.iif(t);
        default:
          // `and`, `or`, `not` (here only after a unary), `mod`: an operator where a value belongs.
          return this.fail("an expression");
      }
    }
    const type = t.escaped ? undefined : TYPES.get(t.text.toLowerCase());
    this.i++;
    if (type !== undefined) {
      const ref: TeTypeRef = { kind: "type", name: type, written: t.text, start, end };
      if (this.isOp(".")) {
        this.i++;
        return this.memberOrCall(ref);
      }
      if (this.isOp("(")) {
        const args = this.list("(", ")");
        return { kind: "convert", type: ref, args: args.items, start, end: args.end };
      }
      throw new TeSyntaxError(`expected '.' or '(' after the type name '${clip(t.text)}'`, start);
    }
    if (this.isOp("(")) return this.call(null, t.text, start);
    return { kind: "ident", name: t.text, start, end };
  }

  private iif(t: TeToken): TeExpr {
    this.i++;
    if (!this.isOp("(")) this.fail("'(' after iif");
    const args = this.list("(", ")");
    const [test, then, otherwise] = args.items;
    if (args.items.length !== 3 || !test || !then || !otherwise) {
      throw new TeSyntaxError(
        `iif takes three arguments (a test, then two values), and this one has ${args.items.length}`,
        t.start,
      );
    }
    return {
      kind: "conditional",
      form: "iif",
      test,
      then,
      else: otherwise,
      start: t.start,
      end: args.end,
    };
  }
}
