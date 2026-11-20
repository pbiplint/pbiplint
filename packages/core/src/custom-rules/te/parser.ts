import { LIMITS } from "../limits.js";
import type { TeBinaryOp, TeExpr, TeTypeRef, TeUnaryOp } from "./ast.js";
import { lex, TeSyntaxError, type TeToken } from "./lexer.js";
import { KEYWORD_NAMES, operatorsAt } from "./syntax.js";

/**
 * The .NET types an expression may name, keyed by lowercase spelling: Dynamic LINQ's predefined
 * types and their C# aliases, `Math`, `Convert`, and the types Tabular Editor adds that rules call
 * statically. Dynamic LINQ matches type names ignoring case, which is why `RegEx` and `Regex` both
 * work. Enum names that are also properties (`DataType`, `CrossFilteringBehavior`) are not here:
 * `DataType.ToString()` reads the property, so the evaluator decides those.
 */
const TYPE_NAMES = [
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
];
/** The C# aliases Dynamic LINQ accepts for its predefined types. */
const ALIASES: Record<string, string> = {
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
};

/**
 * Each type name an expression may write, with its spellings: the name, then a C# alias that is
 * not the name in another case (`int` for `Int32`; `double` is `Double` already).
 */
export const TE_TYPES: readonly { name: string; spellings: readonly string[] }[] = TYPE_NAMES.map(
  (name) => ({
    name,
    spellings: [
      name,
      ...Object.keys(ALIASES).filter(
        (a) => ALIASES[a] === name && a.toLowerCase() !== name.toLowerCase(),
      ),
    ],
  }),
);

const TYPES = new Map<string, string>(
  TE_TYPES.flatMap((t) => t.spellings.map((s): [string, string] => [s.toLowerCase(), t.name])),
);

/**
 * Collection methods whose arguments are lambda bodies, as the parser reads them (matched ignoring
 * case). `Contains`, `Take`, `Skip` and the like take values, so they are not here. The parser
 * knows more than the evaluator runs, so a rule calling one it does not run is told so by name.
 */
export const TE_LAMBDA_METHODS: readonly string[] = [
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
];
const LAMBDA_METHODS = new Set(TE_LAMBDA_METHODS.map((m) => m.toLowerCase()));

/** Words with a meaning of their own, matched ignoring case; none of them is a property name. */
const KEYWORDS = new Set<string>(KEYWORD_NAMES.map((k) => k.toLowerCase()));

/** The binary operators at each level, by spelling, from the syntax table. */
const COALESCE = operatorsAt<TeBinaryOp>(2);
const OR = operatorsAt<TeBinaryOp>(3);
const AND = operatorsAt<TeBinaryOp>(4);
const EQUALITY = operatorsAt<TeBinaryOp>(5);
const ADDITIVE = operatorsAt<TeBinaryOp>(6);
const MULTIPLICATIVE = operatorsAt<TeBinaryOp>(7);
const UNARY = operatorsAt<TeUnaryOp>(8);

/**
 * Why a rule with a named lambda parameter (`Columns.Any(c => c.IsHidden)`) cannot run; the
 * message adds where the arrow is, then `NAMED_LAMBDA_HINT`.
 */
export const NAMED_LAMBDA_REASON =
  "a named lambda parameter ('x => ...'), which Tabular Editor does not run";
export const NAMED_LAMBDA_HINT = "write the body with 'it' instead";

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
      throw new TeSyntaxError(`${NAMED_LAMBDA_REASON},`, t.start, undefined, NAMED_LAMBDA_HINT);
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
    return this.level(COALESCE, () => this.or());
  }
  private or(): TeExpr {
    return this.level(OR, () => this.and());
  }
  private and(): TeExpr {
    return this.level(AND, () => this.comparison());
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
    const key = t.type === "op" ? t.text : this.keyword(t);
    const op = key === undefined ? undefined : UNARY[key];
    if (op !== undefined) {
      this.enter(t.start);
      const spelling = this.take();
      const operand = this.unary();
      this.depth--;
      return {
        kind: "unary",
        op,
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
