import type { TeBinaryOp, TeNumberKind, TeUnaryOp } from "./ast.js";

/**
 * The operators and keywords of a Tabular Editor rule expression, as tables: the lexer reads its
 * operator spellings from here, the parser its keywords and the operators at each level, and the
 * custom rules reference prints them with their meanings (pull request F). Word spellings (`or`,
 * `and`, `mod`, `not`) are written in lower case and matched without regard to case, as Dynamic
 * LINQ matches them. The meanings are joined on in pure calls, so a bundle that runs rules but
 * never prints the reference leaves them out.
 */

/** What an operator does: a binary or unary op of the tree, or a piece of the syntax around values. */
export type TeOperatorOp =
  TeBinaryOp | TeUnaryOp | "conditional" | "member" | "index" | "call" | "separator" | "it";

export interface TeOperator {
  op: TeOperatorOp;
  /** Every way to write it; a pair such as `?` and `:` or `[` and `]` is written around values. */
  spellings: readonly string[];
  /** 1 binds loosest (the conditional operator), 9 tightest (member access, calls, indexers). */
  precedence: number;
  meaning: string;
}

/** Every operator, loosest first, without its meaning. Within a level, operators run left to right. */
export const OPERATOR_SYNTAX: readonly Omit<TeOperator, "meaning">[] = [
  { op: "conditional", spellings: ["?", ":"], precedence: 1 },
  { op: "coalesce", spellings: ["??"], precedence: 2 },
  { op: "or", spellings: ["||", "or"], precedence: 3 },
  { op: "and", spellings: ["&&", "and"], precedence: 4 },
  { op: "eq", spellings: ["==", "="], precedence: 5 },
  { op: "ne", spellings: ["!=", "<>"], precedence: 5 },
  { op: "lt", spellings: ["<"], precedence: 5 },
  { op: "gt", spellings: [">"], precedence: 5 },
  { op: "le", spellings: ["<="], precedence: 5 },
  { op: "ge", spellings: [">="], precedence: 5 },
  { op: "add", spellings: ["+"], precedence: 6 },
  { op: "sub", spellings: ["-"], precedence: 6 },
  { op: "concat", spellings: ["&"], precedence: 6 },
  { op: "mul", spellings: ["*"], precedence: 7 },
  { op: "div", spellings: ["/"], precedence: 7 },
  { op: "mod", spellings: ["%", "mod"], precedence: 7 },
  { op: "not", spellings: ["!", "not"], precedence: 8 },
  { op: "negate", spellings: ["-"], precedence: 8 },
  { op: "member", spellings: ["."], precedence: 9 },
  { op: "index", spellings: ["[", "]"], precedence: 9 },
  { op: "call", spellings: ["(", ")"], precedence: 9 },
  { op: "separator", spellings: [","], precedence: 9 },
  { op: "it", spellings: ["$"], precedence: 9 },
];

const OPERATOR_MEANINGS: Record<TeOperatorOp, string> = {
  conditional: "`test ? then : otherwise`: the second value when the test is true, else the third.",
  coalesce: "The left value, or the right one when the left is null.",
  or: "True when either side is true; the right side runs only when the left is not true.",
  and: "True when both sides are true; the right side runs only when the left is not false.",
  eq: "Equal: strings with case, enum values by name, objects by identity.",
  ne: "Not equal, the opposite of `==`.",
  lt: "Less than: numbers, characters, enum values in order, strings in culture order.",
  gt: "Greater than, ordered as `<` orders.",
  le: "Less than or equal, ordered as `<` orders.",
  ge: "Greater than or equal, ordered as `<` orders.",
  add: "Adds two numbers, or joins two strings (null counts as empty).",
  sub: "Subtracts one number from another.",
  concat: "Joins two values as text, turning each into a string first.",
  mul: "Multiplies two numbers.",
  div: "Divides; two whole numbers give a whole number, rounded toward zero.",
  mod: "The remainder after dividing, with the sign of the left side.",
  not: "True when the value is false, and false when it is true.",
  negate: "The number with its sign changed.",
  member: "Reads a property or calls a method of the value before it, as in `Table.Name`.",
  index: 'Reads one element by position, or an indexer by name, as in `TranslatedNames["fr-FR"]`.',
  call: "Calls a method with its arguments, or groups part of an expression to run first.",
  separator: "Separates the arguments of a call or an index.",
  it: "The object the rule runs on, the same as `it`.",
};

/** Every operator, loosest first, with what it means. */
export const TE_OPERATORS: readonly TeOperator[] = /* @__PURE__ */ OPERATOR_SYNTAX.map((o) => ({
  ...o,
  meaning: OPERATOR_MEANINGS[o.op],
}));

/**
 * Spellings the lexer reads that no operator here runs, so the parser can say what it found: the
 * arrow of a named lambda (`x => ...`), which Tabular Editor does not run, and a lone `|`.
 */
export const TE_LEXED_ONLY: readonly string[] = ["=>", "|"];

export interface TeKeyword {
  name: string;
  meaning: string;
}

/** Words with a meaning of their own. None is read as a property; `@it` names a property `it`. */
export const KEYWORD_NAMES = [
  "true",
  "false",
  "null",
  "it",
  "outerIt",
  "current",
  "iif",
  "not",
  "and",
  "or",
  "mod",
] as const;

const KEYWORD_MEANINGS: Record<(typeof KEYWORD_NAMES)[number], string> = {
  true: "The Boolean value true.",
  false: "The Boolean value false.",
  null: "No value, as a property the model leaves empty gives.",
  it: "The object the rule runs on; inside a condition such as `Any(...)`, the element being tested.",
  outerIt: "Inside a condition, the value `it` was just outside it, one level up.",
  current: "The object the rule runs on, at any depth of conditions.",
  iif: "`iif(test, then, otherwise)`: the same as `test ? then : otherwise`.",
  not: "The word form of `!`.",
  and: "The word form of `&&`.",
  or: "The word form of `||`.",
  mod: "The word form of `%`.",
};

/** Every keyword, with what it means. */
export const TE_KEYWORDS: readonly TeKeyword[] = /* @__PURE__ */ KEYWORD_NAMES.map((name) => ({
  name,
  meaning: KEYWORD_MEANINGS[name],
}));

/** The quote that starts and ends a string; doubled inside one, it is a quote. */
export const STRING_QUOTE = '"';
/** The quote that starts and ends a character; doubled inside one, it is that quote. */
export const CHAR_QUOTE = "'";
/** Written before a name, it makes the name a property even when it is a keyword or a type. */
export const NAME_ESCAPE = "@";

/**
 * The suffixes a number may end with, in upper case (the lexer reads either case), and the type
 * each gives. `L`, `U`, `UL` and `LU` need a whole number.
 */
export const NUMBER_SUFFIXES: Readonly<Record<string, TeNumberKind>> = {
  L: "long",
  U: "uint",
  UL: "ulong",
  LU: "ulong",
  F: "float",
  D: "double",
  M: "decimal",
};

/** The number types a suffix gives that need a whole number. */
export const WHOLE_NUMBER_KINDS: readonly TeNumberKind[] = ["int", "uint", "long", "ulong"];

/** Each number type by its .NET name, as the reference prints it. */
export const NUMBER_TYPE_NAMES: Readonly<Record<TeNumberKind, string>> = {
  int: "Int32",
  uint: "UInt32",
  long: "Int64",
  ulong: "UInt64",
  float: "Single",
  double: "Double",
  decimal: "Decimal",
};

export interface TeLiteral {
  /** An example, written as a rule writes it. */
  written: string;
  /** The type it gives: `String`, `Char`, a number type's .NET name, or `name` for `@name`. */
  type: string;
  meaning: string;
}

/**
 * How to write each kind of value in a rule expression, with an example the lexer reads to the
 * type given, from the constants above. Built in a pure call, so a bundle that runs rules but
 * never prints the reference leaves it out.
 */
function literals(): TeLiteral[] {
  const q = STRING_QUOTE;
  const c = CHAR_QUOTE;
  const out: TeLiteral[] = [
    {
      written: `${q}Sales${q}`,
      type: "String",
      meaning: `Text between ${q} quotes.`,
    },
    {
      written: `${q}say ${q}${q}hi${q}${q}${q}`,
      type: "String",
      meaning: `A quote inside a string is doubled, so this one is say ${q}hi${q}. There are no backslash escapes: a backslash is itself, so ${q}\\d${q} is a backslash and a d.`,
    },
    {
      written: `${c}a${c}`,
      type: "Char",
      meaning: `Exactly one character between ${c} quotes; a ${c} inside one is doubled, as ${c}${c}${c}${c}.`,
    },
    {
      written: "42",
      type: NUMBER_TYPE_NAMES.int,
      meaning: `A whole number is ${NUMBER_TYPE_NAMES.int}, or ${NUMBER_TYPE_NAMES.uint}, ${NUMBER_TYPE_NAMES.long} or ${NUMBER_TYPE_NAMES.ulong}, the first it fits.`,
    },
    {
      written: "1.5",
      type: NUMBER_TYPE_NAMES.double,
      meaning: `A number with a decimal point is ${NUMBER_TYPE_NAMES.double}.`,
    },
    {
      written: "2e3",
      type: NUMBER_TYPE_NAMES.double,
      meaning: `A number with an exponent is ${NUMBER_TYPE_NAMES.double}.`,
    },
  ];
  for (const [suffix, kind] of Object.entries(NUMBER_SUFFIXES)) {
    const whole = WHOLE_NUMBER_KINDS.includes(kind);
    out.push({
      written: `${whole ? "10" : "1.5"}${suffix}`,
      type: NUMBER_TYPE_NAMES[kind],
      meaning: `The suffix ${suffix} (or ${suffix.toLowerCase()}) makes the number ${NUMBER_TYPE_NAMES[kind]}${whole ? "; it needs a whole number" : ""}.`,
    });
  }
  out.push({
    written: `${NAME_ESCAPE}it`,
    type: "name",
    meaning: `${NAME_ESCAPE} before a name makes it a property even when it is a keyword or a type name, so ${NAME_ESCAPE}it is a property named it.`,
  });
  return out;
}

/** How each kind of value is written. */
export const TE_LITERALS: readonly TeLiteral[] = /* @__PURE__ */ literals();

/** The operators at one level, by spelling, for the parser. */
export function operatorsAt<Op extends TeOperatorOp>(precedence: number): Record<string, Op> {
  const ops: Record<string, Op> = {};
  for (const o of OPERATOR_SYNTAX)
    if (o.precedence === precedence) for (const s of o.spellings) ops[s] = o.op as Op;
  return ops;
}
