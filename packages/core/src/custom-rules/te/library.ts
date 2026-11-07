import { compilePattern, isMatch, type Budget } from "./regex.js";
import { teTokens } from "./tokens.js";
import {
  ENUMS,
  PROPERTIES,
  UNSET,
  getAnnotation,
  hasAnnotation,
  type EnumType,
  type TeMap,
  type TomObject,
  type TomView,
} from "./view.js";

/**
 * What a custom rule can call, and the values it computes with (custom rules spec, section 6.1).
 * Tabular Editor runs rules as Dynamic LINQ over .NET, so the methods, static members, and
 * enums here follow .NET's, and each value keeps the .NET type that decides how an operator treats
 * it. This table is the second source the custom rules reference is generated from (pull request
 * F, beside the model view's `PROPERTIES`), so every entry says in a line what it does.
 *
 * Values, as the evaluator holds them:
 * - .NET `String`: a JavaScript string. `Char`: a `TeChar`.
 * - `Int32` and `Int64`: a JavaScript number that stays a whole number. `Double` and `Decimal`:
 *   a `TeReal`, so `7 / 2` divides as integers and `7 / 2.0` does not. A decimal is held as a
 *   double; no probe tells the two apart.
 * - `Boolean`: a JavaScript boolean. `null`: null.
 * - An enum value: a `TeEnum`, so it prints and compares by name.
 * - A model object: the view's `TomObject`. A collection: an array. An indexer such as
 *   `TranslatedNames`: the view's `TeMap`. A `Tokenize()` token: the `TeDaxToken` from tokens.ts.
 */

// ---------------------------------------------------------------------------------------------
// Values

/** A .NET `Char`: one UTF-16 code unit. */
export class TeChar {
  constructor(readonly code: number) {}
}

/** A .NET `Double` or `Decimal`. */
export class TeReal {
  constructor(
    readonly value: number,
    readonly kind: "double" | "decimal" = "double",
  ) {}
}

/** A value of a .NET enum, by its name. */
export class TeEnum {
  constructor(
    readonly type: EnumType,
    readonly name: string,
  ) {}
}

/**
 * A .NET exception or a type error while a rule runs: it stops the rule for the project (spec
 * section 6.7). The message names the cause from the rule's own text, never the model's.
 */
export class TeFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeFailure";
  }
}

/** Thrown when an `UNSET` value is read: the object is left out of the rule and counted. */
export class TeUnset extends Error {
  constructor() {
    super("unset");
    this.name = "TeUnset";
  }
}

/** A lambda argument (`Any(IsHidden)`): runs its body with `it` the element. */
export type TeLambda = (item: unknown) => unknown;

/** What a library entry needs from the evaluator while it runs. */
export interface TeRuntime {
  readonly view: TomView;
  /** The rule's budget, which regular expressions spend too. */
  readonly budget: Budget;
  /** Spends steps of the budget; throws `LimitReached` when it is spent. */
  spend(steps: number): void;
  /** A collection's elements: an array's, an indexer's values, or a string's characters. */
  items(collection: unknown): readonly unknown[];
}

const enumType = (name: string, values: readonly string[]): EnumType => ({
  kind: "enum",
  name,
  values,
});

/** .NET's `StringComparison`, which `IndexOf`, `Contains`, `StartsWith` and others take. */
export const STRING_COMPARISON = enumType("StringComparison", [
  "CurrentCulture",
  "CurrentCultureIgnoreCase",
  "InvariantCulture",
  "InvariantCultureIgnoreCase",
  "Ordinal",
  "OrdinalIgnoreCase",
]);

/** .NET's `RegexOptions`, the third argument of `RegEx.IsMatch`. */
export const REGEX_OPTIONS = enumType("RegexOptions", [
  "None",
  "IgnoreCase",
  "Multiline",
  "ExplicitCapture",
  "Compiled",
  "Singleline",
  "IgnorePatternWhitespace",
  "RightToLeft",
  "ECMAScript",
  "CultureInvariant",
  "NonBacktracking",
]);

export const isInt = (v: unknown): v is number => typeof v === "number";
const isNumeric = (v: unknown): boolean =>
  typeof v === "number" || v instanceof TeReal || v instanceof TeChar;
const numberOf = (v: unknown): number =>
  typeof v === "number" ? v : v instanceof TeReal ? v.value : (v as TeChar).code;

/** Whether a value is a model object of the view. */
export function isTomObject(v: unknown): v is TomObject {
  return (
    typeof v === "object" &&
    v !== null &&
    "teName" in v &&
    "source" in v &&
    typeof (v as { type?: unknown }).type === "string"
  );
}

/** Whether a value is an indexer such as `TranslatedNames`. */
export function isTeMap(v: unknown): v is TeMap {
  return typeof v === "object" && v !== null && "lookup" in v && "entries" in v;
}

/** Whether a value is a `Tokenize()` token. */
export function isToken(v: unknown): v is { Type: string; Text: string; Next: unknown } {
  return typeof v === "object" && v !== null && "Type" in v && "Text" in v && "Next" in v;
}

/** The .NET type name of a value, for a reason. */
export function typeName(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return "String";
  if (typeof v === "boolean") return "Boolean";
  if (typeof v === "number") return "Int32";
  if (v instanceof TeReal) return v.kind === "decimal" ? "Decimal" : "Double";
  if (v instanceof TeChar) return "Char";
  if (v instanceof TeEnum) return v.type.name;
  if (isTomObject(v)) return v.type;
  if (isToken(v)) return "DaxToken";
  if (Array.isArray(v) || isTeMap(v)) return "collection";
  return "object";
}

/** "a String", "an Int32". */
const an = (word: string) => `${/^[AEIOU]/i.test(word) ? "an" : "a"} ${word}`;

/** A .NET `char` turned into a one-character string. */
const str = (c: TeChar): string => String.fromCharCode(c.code);

// ---------------------------------------------------------------------------------------------
// Text helpers with .NET's meanings

/**
 * Upper- or lower-cases one character at a time, keeping any character whose case mapping would
 * change the length, as .NET's `ToUpper` does (`ß` stays `ß`, where JavaScript gives `SS`).
 */
function mapCase(s: string, upper: boolean): string {
  let out = "";
  for (const c of s) {
    if (c.length > 1) {
      out += c;
      continue;
    }
    const m = upper ? c.toUpperCase() : c.toLowerCase();
    out += m.length === 1 ? m : c;
  }
  return out;
}
const upper = (s: string) => mapCase(s, true);
const lower = (s: string) => mapCase(s, false);

/** .NET's `char.IsWhiteSpace`. */
export const isWhiteSpaceCode = (c: number): boolean =>
  (c >= 9 && c <= 13) ||
  c === 0x20 ||
  c === 0x85 ||
  c === 0xa0 ||
  /\p{Z}/u.test(String.fromCharCode(c));

const charIs = (re: RegExp) => (c: number) => re.test(String.fromCharCode(c));
const CHAR_TESTS = {
  IsLetter: charIs(/\p{L}/u),
  IsDigit: charIs(/\p{Nd}/u),
  IsLetterOrDigit: charIs(/[\p{L}\p{Nd}]/u),
  IsUpper: charIs(/\p{Lu}/u),
  IsLower: charIs(/\p{Ll}/u),
  IsControl: charIs(/\p{Cc}/u),
  IsPunctuation: charIs(/\p{P}/u),
  IsNumber: charIs(/\p{N}/u),
  IsSymbol: charIs(/\p{S}/u),
  IsSeparator: charIs(/\p{Z}/u),
};

function trimWith(s: string, start: boolean, end: boolean): string {
  let a = 0;
  let b = s.length;
  if (start) while (a < b && isWhiteSpaceCode(s.charCodeAt(a))) a++;
  if (end) while (b > a && isWhiteSpaceCode(s.charCodeAt(b - 1))) b--;
  return s.slice(a, b);
}

/**
 * Culture-aware string ordering, for `<`, `>`, `CompareTo` and `String.Compare`. Tabular Editor
 * compares strings with the current culture (`"a" < "B"` is true, which an ordinal compare would
 * call false); pbiplint fixes the culture to `en-US` so a run gives the same answer everywhere.
 */
const COLLATOR = new Intl.Collator("en-US");
export const cultureCompare = (a: string, b: string): number => Math.sign(COLLATOR.compare(a, b));

/** The value of a `StringComparison` argument, given as the enum or as its name in a string. */
function comparisonOf(v: unknown): string {
  const name = v instanceof TeEnum ? v.name : String(v);
  const found = STRING_COMPARISON.values.find((n) => n.toLowerCase() === name.toLowerCase());
  if (!found) throw new TeFailure("a `StringComparison` argument names no such value");
  return found;
}
const ignoresCase = (comparison: string) => comparison.endsWith("IgnoreCase");

/** Throws .NET's `ArgumentNullException` for a null string argument. */
function notNull(v: unknown, method: string): string {
  if (v === null || v === undefined) throw new TeFailure(`\`${method}\` was given null`);
  return v as string;
}

/** `IndexOf` and `LastIndexOf`, ordinal or ordinal ignoring case, as the probes showed. */
function indexOf(
  self: string,
  value: string,
  from: number | undefined,
  comparison: string,
  last: boolean,
  method: string,
): number {
  if (from !== undefined && (from < 0 || from > self.length))
    throw new TeFailure(`\`${method}\` was given a start index outside the string`);
  const [s, v] = ignoresCase(comparison) ? [upper(self), upper(value)] : [self, value];
  if (last) return value === "" ? self.length : s.lastIndexOf(v);
  return s.indexOf(v, from ?? 0);
}

function matches(self: string, value: string, comparison: string, how: "starts" | "ends" | "has") {
  const [s, v] = ignoresCase(comparison) ? [upper(self), upper(value)] : [self, value];
  return how === "starts" ? s.startsWith(v) : how === "ends" ? s.endsWith(v) : s.includes(v);
}

// ---------------------------------------------------------------------------------------------
// Numbers

/** Rounds half to even, as .NET's `Math.Round` and `Convert.ToInt32` do. */
function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const INT32 = { min: -2_147_483_648, max: 2_147_483_647 };
// Int64's range, as near as a double holds it.
const INT64 = { min: -(2 ** 63), max: 2 ** 63 - 1 };

function toInteger(v: unknown, range: { min: number; max: number }, method: string): number {
  if (v === null || v === undefined) return 0;
  let n: number;
  if (typeof v === "string") {
    if (!/^\s*[+-]?\d+\s*$/.test(v))
      throw new TeFailure(`\`${method}\` was given a string that is not a whole number`);
    n = Number(v.trim());
  } else if (typeof v === "boolean") n = v ? 1 : 0;
  else if (typeof v === "number") n = v;
  else if (v instanceof TeReal) n = roundHalfEven(v.value);
  else if (v instanceof TeChar) n = v.code;
  else throw new TeFailure(`\`${method}\` cannot convert ${an(typeName(v))}`);
  if (!Number.isFinite(n) || n < range.min || n > range.max)
    throw new TeFailure(`\`${method}\` was given a number too large for its type`);
  return n === 0 ? 0 : n;
}

function toReal(v: unknown, kind: "double" | "decimal", method: string): TeReal {
  if (v === null || v === undefined) return new TeReal(0, kind);
  if (typeof v === "string") {
    const t = v.trim().replace(/,/g, "");
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t))
      throw new TeFailure(`\`${method}\` was given a string that is not a number`);
    return new TeReal(Number(t), kind);
  }
  if (typeof v === "boolean") return new TeReal(v ? 1 : 0, kind);
  if (typeof v === "number" || v instanceof TeReal) return new TeReal(numberOf(v), kind);
  throw new TeFailure(`\`${method}\` cannot convert ${an(typeName(v))}`);
}

/** A double as .NET prints it: the shortest text that reads back the same. */
function realToString(r: TeReal): string {
  const x = r.value;
  if (Number.isNaN(x)) return "NaN";
  if (x === Infinity) return "∞";
  if (x === -Infinity) return "-∞";
  if (Object.is(x, -0)) return "-0";
  return String(x).replace(
    /e([+-])(\d+)$/,
    (_m, sign: string, digits: string) => `E${sign}${digits.padStart(2, "0")}`,
  );
}

/** A value as .NET's `ToString()` and `Convert.ToString` print it. */
export function teToString(v: unknown, view?: TomView): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v === 0 ? 0 : v);
  if (v instanceof TeReal) return realToString(v);
  if (v instanceof TeChar) return str(v);
  if (v instanceof TeEnum) return v.name;
  if (isToken(v)) return v.Text;
  if (isTomObject(v) && view) {
    const name = PROPERTIES[v.type].Name?.get(v, view);
    return typeof name === "string" ? name : v.teName;
  }
  throw new TeFailure(`\`ToString\` cannot print ${an(typeName(v))}`);
}

/** Two numbers combined as .NET would: a whole number when both are, else a double. */
function numeric(a: unknown, b: unknown, f: (x: number, y: number) => number): number | TeReal {
  const real = a instanceof TeReal || b instanceof TeReal;
  const r = f(numberOf(a), numberOf(b));
  if (real) {
    const kind =
      (a instanceof TeReal && a.kind === "decimal") || (b instanceof TeReal && b.kind === "decimal")
        ? "decimal"
        : "double";
    return new TeReal(r, kind);
  }
  return r;
}

// ---------------------------------------------------------------------------------------------
// Equality and ordering

/** Whether an enum value and a string name the same value; a string naming none is a type error. */
function enumEqualsString(e: TeEnum, s: string): boolean {
  const named = e.type.values.find((n) => n.toLowerCase() === s.toLowerCase());
  if (named === undefined)
    throw new TeFailure(`compares ${an(e.type.name)} with a string that names none of its values`);
  return named === e.name;
}

/** .NET's `==` as Dynamic LINQ applies it: strings ordinally, enums by name, objects by identity. */
export function teEquals(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined)
    return (a ?? null) === (b ?? null);
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (isNumeric(a) && isNumeric(b)) return numberOf(a) === numberOf(b);
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  if (a instanceof TeEnum && b instanceof TeEnum) {
    if (a.type.name !== b.type.name)
      throw new TeFailure(`compares ${an(a.type.name)} with ${an(b.type.name)}`);
    return a.name === b.name;
  }
  if (a instanceof TeEnum && typeof b === "string") return enumEqualsString(a, b);
  if (b instanceof TeEnum && typeof a === "string") return enumEqualsString(b, a);
  if (isTomObject(a) && isTomObject(b)) return a.source === b.source && a.type === b.type;
  if (isToken(a) && isToken(b)) return a === b;
  if ((Array.isArray(a) || isTeMap(a)) && (Array.isArray(b) || isTeMap(b))) return a === b;
  throw new TeFailure(`compares ${an(typeName(a))} with ${an(typeName(b))}`);
}

/** .NET's `<` and siblings: numbers, strings by culture, characters, and enum values in order. */
export function teCompare(a: unknown, b: unknown): number {
  if (isNumeric(a) && isNumeric(b)) return Math.sign(numberOf(a) - numberOf(b));
  if ((typeof a === "string" || a === null) && (typeof b === "string" || b === null)) {
    if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
    return cultureCompare(a, b);
  }
  if (a instanceof TeEnum && b instanceof TeEnum && a.type.name === b.type.name)
    return Math.sign(a.type.values.indexOf(a.name) - b.type.values.indexOf(b.name));
  if (a instanceof TeEnum && typeof b === "string") {
    enumEqualsString(a, b);
    return teCompare(
      a,
      new TeEnum(
        a.type,
        a.type.values.find((n) => n.toLowerCase() === b.toLowerCase())!,
      ),
    );
  }
  throw new TeFailure(`orders ${an(typeName(a))} against ${an(typeName(b))}`);
}

// ---------------------------------------------------------------------------------------------
// The table

/** A parameter: its name and .NET type, as the reference prints it. */
export interface TeParam {
  name: string;
  /**
   * `String`, `Char`, `Int32`, `Number` (any numeric type), `Boolean`, `Object` (anything), `T`
   * (the collection's element), `StringComparison`, `RegexOptions`, `Predicate` (a condition on
   * each element, written with `it`), or `Selector` (a value from each element).
   */
  type: string;
}

/** A method or static function a rule may call. */
export interface TeLibraryEntry {
  name: string;
  params: readonly TeParam[];
  /**
   * The .NET type it gives: as for parameters, plus `String?` (a string or null), `Int64`,
   * `Double`, `Decimal`, `Collection<T>`, `Collection<Char>`, `Collection<String>`,
   * `Collection<DaxToken>`, `Collection<Selector>` (what the selector gives, per element),
   * `T?` (an element or null), and `Selector` (one value the selector gives).
   */
  returns: string;
  description: string;
  run(self: unknown, args: readonly unknown[], rt: TeRuntime): unknown;
}

/** A property of a value that is not a model object: a string's `Length`, a collection's `Count`. */
export interface TeLibraryProperty {
  returns: string;
  description: string;
}

/** A static value: `String.Empty`. */
export interface TeLibraryValue {
  returns: string;
  description: string;
  value: unknown;
}

const P = (name: string, type: string): TeParam => ({ name, type });
const S = (n = "value") => P(n, "String");
const C = (n = "value") => P(n, "Char");
const I = (n: string) => P(n, "Int32");
const CMP = P("comparison", "StringComparison");
const PRED = P("condition", "Predicate");
const SEL = P("selector", "Selector");

const entry = (
  name: string,
  params: readonly TeParam[],
  returns: string,
  description: string,
  run: TeLibraryEntry["run"],
): TeLibraryEntry => ({ name, params, returns, description, run });

const s = (self: unknown) => self as string;
const a0 = (args: readonly unknown[]) => args[0];

function substring(self: string, start: unknown, length?: unknown): string {
  const st = start as number;
  if (st < 0 || st > self.length)
    throw new TeFailure("`Substring` was given a start index beyond the end of the string");
  if (length === undefined) return self.slice(st);
  const len = length as number;
  if (len < 0 || st + len > self.length)
    throw new TeFailure("`Substring` was given a length that runs past the end of the string");
  return self.slice(st, st + len);
}

function replace(self: string, from: unknown, to: unknown): string {
  const f = notNull(from, "Replace");
  if (f === "") throw new TeFailure("`Replace` was given an empty string to replace");
  return self.split(f).join((to as string | null) ?? "");
}

const STRING_METHODS: readonly TeLibraryEntry[] = [
  entry(
    "Contains",
    [S()],
    "Boolean",
    "Whether the string holds the value, matching case exactly.",
    (self, args) => s(self).includes(notNull(a0(args), "Contains")),
  ),
  entry("Contains", [C()], "Boolean", "Whether the string holds the character.", (self, args) =>
    s(self).includes(str(a0(args) as TeChar)),
  ),
  entry(
    "Contains",
    [S(), CMP],
    "Boolean",
    "Whether the string holds the value, ignoring case if the comparison says so.",
    (self, args) => matches(s(self), notNull(args[0], "Contains"), comparisonOf(args[1]), "has"),
  ),
  entry(
    "StartsWith",
    [S()],
    "Boolean",
    "Whether the string begins with the value, matching case exactly.",
    (self, args) => s(self).startsWith(notNull(a0(args), "StartsWith")),
  ),
  entry(
    "StartsWith",
    [C()],
    "Boolean",
    "Whether the string begins with the character.",
    (self, args) => s(self).startsWith(str(a0(args) as TeChar)),
  ),
  entry(
    "StartsWith",
    [S(), CMP],
    "Boolean",
    "Whether the string begins with the value, ignoring case if the comparison says so.",
    (self, args) =>
      matches(s(self), notNull(args[0], "StartsWith"), comparisonOf(args[1]), "starts"),
  ),
  entry(
    "EndsWith",
    [S()],
    "Boolean",
    "Whether the string ends with the value, matching case exactly.",
    (self, args) => s(self).endsWith(notNull(a0(args), "EndsWith")),
  ),
  entry("EndsWith", [C()], "Boolean", "Whether the string ends with the character.", (self, args) =>
    s(self).endsWith(str(a0(args) as TeChar)),
  ),
  entry(
    "EndsWith",
    [S(), CMP],
    "Boolean",
    "Whether the string ends with the value, ignoring case if the comparison says so.",
    (self, args) => matches(s(self), notNull(args[0], "EndsWith"), comparisonOf(args[1]), "ends"),
  ),
  entry(
    "IndexOf",
    [S()],
    "Int32",
    "Where the value first appears, counting from 0, or -1; case must match.",
    (self, args) =>
      indexOf(s(self), notNull(args[0], "IndexOf"), undefined, "Ordinal", false, "IndexOf"),
  ),
  entry(
    "IndexOf",
    [C()],
    "Int32",
    "Where the character first appears, counting from 0, or -1.",
    (self, args) => s(self).indexOf(str(args[0] as TeChar)),
  ),
  entry(
    "IndexOf",
    [S(), CMP],
    "Int32",
    "Where the value first appears, or -1, ignoring case if the comparison says so.",
    (self, args) =>
      indexOf(
        s(self),
        notNull(args[0], "IndexOf"),
        undefined,
        comparisonOf(args[1]),
        false,
        "IndexOf",
      ),
  ),
  entry(
    "IndexOf",
    [S(), I("startIndex")],
    "Int32",
    "Where the value first appears at or after the start index, or -1.",
    (self, args) =>
      indexOf(s(self), notNull(args[0], "IndexOf"), numberOf(args[1]), "Ordinal", false, "IndexOf"),
  ),
  entry(
    "IndexOf",
    [C(), I("startIndex")],
    "Int32",
    "Where the character first appears at or after the start index, or -1.",
    (self, args) =>
      indexOf(s(self), str(args[0] as TeChar), numberOf(args[1]), "Ordinal", false, "IndexOf"),
  ),
  entry(
    "LastIndexOf",
    [S()],
    "Int32",
    "Where the value last appears, counting from 0, or -1; case must match.",
    (self, args) =>
      indexOf(s(self), notNull(args[0], "LastIndexOf"), undefined, "Ordinal", true, "LastIndexOf"),
  ),
  entry(
    "LastIndexOf",
    [C()],
    "Int32",
    "Where the character last appears, counting from 0, or -1.",
    (self, args) => s(self).lastIndexOf(str(args[0] as TeChar)),
  ),
  entry(
    "LastIndexOf",
    [S(), CMP],
    "Int32",
    "Where the value last appears, or -1, ignoring case if the comparison says so.",
    (self, args) =>
      indexOf(
        s(self),
        notNull(args[0], "LastIndexOf"),
        undefined,
        comparisonOf(args[1]),
        true,
        "LastIndexOf",
      ),
  ),
  entry(
    "Replace",
    [S("oldValue"), S("newValue")],
    "String",
    "The string with every occurrence of one value replaced by another, matching case exactly.",
    (self, args) => replace(s(self), args[0], args[1]),
  ),
  entry(
    "Replace",
    [C("oldChar"), C("newChar")],
    "String",
    "The string with every occurrence of one character replaced by another.",
    (self, args) =>
      s(self)
        .split(str(args[0] as TeChar))
        .join(str(args[1] as TeChar)),
  ),
  entry(
    "Substring",
    [I("startIndex")],
    "String",
    "The string from the start index to its end; fails the rule past the end.",
    (self, args) => substring(s(self), args[0]),
  ),
  entry(
    "Substring",
    [I("startIndex"), I("length")],
    "String",
    "That many characters from the start index; fails the rule past the end.",
    (self, args) => substring(s(self), args[0], args[1]),
  ),
  entry("ToUpper", [], "String", "The string in upper case, one character at a time.", (self) =>
    upper(s(self)),
  ),
  entry("ToLower", [], "String", "The string in lower case, one character at a time.", (self) =>
    lower(s(self)),
  ),
  entry(
    "ToUpperInvariant",
    [],
    "String",
    "The string in upper case, the same in every culture.",
    (self) => upper(s(self)),
  ),
  entry(
    "ToLowerInvariant",
    [],
    "String",
    "The string in lower case, the same in every culture.",
    (self) => lower(s(self)),
  ),
  entry("Trim", [], "String", "The string without white space at either end.", (self) =>
    trimWith(s(self), true, true),
  ),
  entry("TrimStart", [], "String", "The string without white space at its start.", (self) =>
    trimWith(s(self), true, false),
  ),
  entry("TrimEnd", [], "String", "The string without white space at its end.", (self) =>
    trimWith(s(self), false, true),
  ),
  entry(
    "ToCharArray",
    [],
    "Collection<Char>",
    "The string's characters, for a condition on each one.",
    (self, _args, rt) => {
      rt.spend(s(self).length);
      return Array.from({ length: s(self).length }, (_, i) => new TeChar(s(self).charCodeAt(i)));
    },
  ),
  entry(
    "Split",
    [C("separator")],
    "Collection<String>",
    "The parts of the string between each separator character.",
    (self, args) => s(self).split(str(args[0] as TeChar)),
  ),
  entry(
    "Split",
    [S("separator")],
    "Collection<String>",
    "The parts of the string between each separator.",
    (self, args) => {
      const sep = args[0] as string | null;
      return sep === null || sep === "" ? [s(self)] : s(self).split(sep);
    },
  ),
  entry(
    "Equals",
    [S()],
    "Boolean",
    "Whether the two strings are the same, matching case exactly.",
    (self, args) => s(self) === args[0],
  ),
  entry(
    "Equals",
    [S(), CMP],
    "Boolean",
    "Whether the two strings are the same, ignoring case if the comparison says so.",
    (self, args) => {
      const other = args[0] as string | null;
      if (other === null) return false;
      return ignoresCase(comparisonOf(args[1]))
        ? upper(s(self)) === upper(other)
        : s(self) === other;
    },
  ),
  entry(
    "CompareTo",
    [S()],
    "Int32",
    "-1, 0 or 1 as the string sorts before, with, or after the value, in culture order.",
    (self, args) => (args[0] === null ? 1 : cultureCompare(s(self), args[0] as string)),
  ),
  entry("ToString", [], "String", "The string itself.", (self) => self),
];

const valueMethods = (kind: string): readonly TeLibraryEntry[] => [
  entry("ToString", [], "String", `The ${kind} as text, as .NET prints it.`, (self, _a, rt) =>
    teToString(self, rt.view),
  ),
  entry(
    "Equals",
    [P("value", "Object")],
    "Boolean",
    `Whether the ${kind} equals the value.`,
    (self, args) => teEquals(self, args[0]),
  ),
];

const CHAR_METHODS: readonly TeLibraryEntry[] = [
  ...valueMethods("character"),
  entry(
    "CompareTo",
    [C()],
    "Int32",
    "-1, 0 or 1 as the character's code is below, equal to, or above the other's.",
    (self, args) => Math.sign((self as TeChar).code - (args[0] as TeChar).code),
  ),
];

const NUMBER_METHODS: readonly TeLibraryEntry[] = [
  ...valueMethods("number"),
  entry(
    "CompareTo",
    [P("value", "Number")],
    "Int32",
    "-1, 0 or 1 as the number is below, equal to, or above the value.",
    (self, args) => teCompare(self, args[0]),
  ),
];

/** Throws .NET's `InvalidOperationException` for an element method on an empty collection. */
function nonEmpty(items: readonly unknown[], method: string): readonly unknown[] {
  if (items.length === 0) throw new TeFailure(`\`${method}\` was called on an empty collection`);
  return items;
}

/** A condition's answer, which must be true or false. */
function holds(f: unknown, item: unknown, method: string): boolean {
  const v = (f as TeLambda)(item);
  // Null (a member read on null) is never true, as .NET's lifted operators treat it.
  if (v === null) return false;
  if (typeof v !== "boolean")
    throw new TeFailure(
      `the condition in \`${method}\` gives ${an(typeName(v))}, not true or false`,
    );
  return v;
}

const select = (items: readonly unknown[], f: unknown) => items.map((x) => (f as TeLambda)(x));

function sum(values: readonly unknown[], method: string): number | TeReal {
  let total: number | TeReal = 0;
  for (const v of values) {
    if (v === null) continue;
    if (!isNumeric(v) || v instanceof TeChar)
      throw new TeFailure(`\`${method}\` was given ${an(typeName(v))} to add up`);
    total = numeric(total, v, (x, y) => x + y);
  }
  return total;
}

function extreme(values: readonly unknown[], method: string, sign: 1 | -1): unknown {
  let best: unknown = nonEmpty(values, method)[0];
  for (const v of values.slice(1)) if (teCompare(v, best) * sign > 0) best = v;
  return best;
}

function average(values: readonly unknown[], method: string): TeReal {
  const total = sum(nonEmpty(values, method), method);
  const kind = total instanceof TeReal ? total.kind : "double";
  return new TeReal(numberOf(total) / values.length, kind);
}

/** A key for `Distinct`: strings and numbers by value, enums by name, anything else by identity. */
function distinctKey(v: unknown): unknown {
  if (v instanceof TeReal || v instanceof TeChar) return `n:${numberOf(v)}`;
  if (typeof v === "number") return `n:${v}`;
  if (typeof v === "string") return `s:${v}`;
  if (v instanceof TeEnum) return `e:${v.type.name}.${v.name}`;
  if (isTomObject(v)) return v.source;
  return v;
}

function orderBy(items: readonly unknown[], f: unknown, sign: 1 | -1): unknown[] {
  const keyed = items.map((x, i) => ({ x, i, k: (f as TeLambda)(x) }));
  keyed.sort((p, q) => teCompare(p.k, q.k) * sign || p.i - q.i);
  return keyed.map((e) => e.x);
}

const items = (self: unknown, rt: TeRuntime) => rt.items(self);

const COLLECTION_METHODS: readonly TeLibraryEntry[] = [
  entry(
    "Any",
    [],
    "Boolean",
    "Whether the collection has any element.",
    (self, _a, rt) => items(self, rt).length > 0,
  ),
  entry(
    "Any",
    [PRED],
    "Boolean",
    "Whether the condition holds for at least one element.",
    (self, args, rt) => items(self, rt).some((x) => holds(args[0], x, "Any")),
  ),
  entry(
    "All",
    [PRED],
    "Boolean",
    "Whether the condition holds for every element (true for an empty collection).",
    (self, args, rt) => items(self, rt).every((x) => holds(args[0], x, "All")),
  ),
  entry(
    "Count",
    [],
    "Int32",
    "How many elements there are.",
    (self, _a, rt) => items(self, rt).length,
  ),
  entry(
    "Count",
    [PRED],
    "Int32",
    "How many elements the condition holds for.",
    (self, args, rt) => items(self, rt).filter((x) => holds(args[0], x, "Count")).length,
  ),
  entry(
    "LongCount",
    [],
    "Int64",
    "How many elements there are.",
    (self, _a, rt) => items(self, rt).length,
  ),
  entry(
    "LongCount",
    [PRED],
    "Int64",
    "How many elements the condition holds for.",
    (self, args, rt) => items(self, rt).filter((x) => holds(args[0], x, "LongCount")).length,
  ),
  entry(
    "Where",
    [PRED],
    "Collection<T>",
    "The elements the condition holds for.",
    (self, args, rt) => items(self, rt).filter((x) => holds(args[0], x, "Where")),
  ),
  entry(
    "Select",
    [SEL],
    "Collection<Selector>",
    "The selector's value for each element.",
    (self, args, rt) => select(items(self, rt), args[0]),
  ),
  entry(
    "First",
    [],
    "T",
    "The first element; fails the rule on an empty collection.",
    (self, _a, rt) => nonEmpty(items(self, rt), "First")[0],
  ),
  entry(
    "First",
    [PRED],
    "T",
    "The first element the condition holds for; fails the rule if there is none.",
    (self, args, rt) =>
      nonEmpty(
        items(self, rt).filter((x) => holds(args[0], x, "First")),
        "First",
      )[0],
  ),
  entry(
    "FirstOrDefault",
    [],
    "T?",
    "The first element, or null for an empty collection.",
    (self, _a, rt) => items(self, rt)[0] ?? null,
  ),
  entry(
    "FirstOrDefault",
    [PRED],
    "T?",
    "The first element the condition holds for, or null.",
    (self, args, rt) => items(self, rt).find((x) => holds(args[0], x, "FirstOrDefault")) ?? null,
  ),
  entry(
    "Last",
    [],
    "T",
    "The last element; fails the rule on an empty collection.",
    (self, _a, rt) => nonEmpty(items(self, rt), "Last").at(-1),
  ),
  entry(
    "Last",
    [PRED],
    "T",
    "The last element the condition holds for; fails the rule if there is none.",
    (self, args, rt) =>
      nonEmpty(
        items(self, rt).filter((x) => holds(args[0], x, "Last")),
        "Last",
      ).at(-1),
  ),
  entry(
    "LastOrDefault",
    [],
    "T?",
    "The last element, or null for an empty collection.",
    (self, _a, rt) => items(self, rt).at(-1) ?? null,
  ),
  entry(
    "LastOrDefault",
    [PRED],
    "T?",
    "The last element the condition holds for, or null.",
    (self, args, rt) =>
      items(self, rt)
        .filter((x) => holds(args[0], x, "LastOrDefault"))
        .at(-1) ?? null,
  ),
  entry("Sum", [], "Number", "The numbers added up (0 for an empty collection).", (self, _a, rt) =>
    sum(items(self, rt), "Sum"),
  ),
  entry(
    "Sum",
    [SEL],
    "Number",
    "The selector's numbers added up (0 for an empty collection).",
    (self, args, rt) => sum(select(items(self, rt), args[0]), "Sum"),
  ),
  entry(
    "Max",
    [],
    "T",
    "The largest element; fails the rule on an empty collection.",
    (self, _a, rt) => extreme(items(self, rt), "Max", 1),
  ),
  entry(
    "Max",
    [SEL],
    "Selector",
    "The selector's largest value; fails the rule on an empty collection.",
    (self, args, rt) => extreme(select(items(self, rt), args[0]), "Max", 1),
  ),
  entry(
    "Min",
    [],
    "T",
    "The smallest element; fails the rule on an empty collection.",
    (self, _a, rt) => extreme(items(self, rt), "Min", -1),
  ),
  entry(
    "Min",
    [SEL],
    "Selector",
    "The selector's smallest value; fails the rule on an empty collection.",
    (self, args, rt) => extreme(select(items(self, rt), args[0]), "Min", -1),
  ),
  entry(
    "Average",
    [],
    "Double",
    "The mean of the numbers; fails the rule on an empty collection.",
    (self, _a, rt) => average(items(self, rt), "Average"),
  ),
  entry(
    "Average",
    [SEL],
    "Double",
    "The mean of the selector's numbers; fails the rule on an empty collection.",
    (self, args, rt) => average(select(items(self, rt), args[0]), "Average"),
  ),
  entry(
    "Contains",
    [P("value", "T")],
    "Boolean",
    "Whether the collection holds the value.",
    (self, args, rt) => items(self, rt).some((x) => teEquals(x, args[0])),
  ),
  entry(
    "Distinct",
    [],
    "Collection<T>",
    "The elements with repeats removed, first ones kept.",
    (self, _a, rt) => {
      const seen = new Set<unknown>();
      return items(self, rt).filter((x) => {
        const k = distinctKey(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    },
  ),
  entry(
    "OrderBy",
    [SEL],
    "Collection<T>",
    "The elements sorted by the selector's value, smallest first.",
    (self, args, rt) => orderBy(items(self, rt), args[0], 1),
  ),
  entry(
    "OrderByDescending",
    [SEL],
    "Collection<T>",
    "The elements sorted by the selector's value, largest first.",
    (self, args, rt) => orderBy(items(self, rt), args[0], -1),
  ),
  entry(
    "Skip",
    [I("count")],
    "Collection<T>",
    "The elements after the first few.",
    (self, args, rt) => items(self, rt).slice(Math.max(0, args[0] as number)),
  ),
  entry("Take", [I("count")], "Collection<T>", "The first few elements.", (self, args, rt) =>
    items(self, rt).slice(0, Math.max(0, args[0] as number)),
  ),
  entry("ToList", [], "Collection<T>", "The same elements, as a list.", (self, _a, rt) => [
    ...items(self, rt),
  ]),
  entry("ToArray", [], "Collection<T>", "The same elements, as an array.", (self, _a, rt) => [
    ...items(self, rt),
  ]),
];

/** The types whose DAX `Tokenize()` reads, through their `Expression`. */
export const DAX_EXPRESSION_TYPES: ReadonlySet<string> = new Set([
  "Measure",
  "CalculatedColumn",
  "CalculatedTable",
  "CalculationItem",
  "TablePermission",
  "Function",
]);

/** Whether an annotation name is one a live model's statistics fill in, which a project never holds. */
export function isStatisticsAnnotation(name: string): boolean {
  const l = name.toLowerCase();
  return l.startsWith("vertipaq_") || l === "longlengthrowcount" || l === "datetimewithhourminsec";
}

export const STATISTICS_REASON =
  "needs statistics from a live model that a project's files do not hold; run the rule in Tabular Editor against a deployed model";

const OBJECT_METHODS: readonly TeLibraryEntry[] = [
  entry(
    "GetAnnotation",
    [S("name")],
    "String?",
    "The object's annotation of that name, or null when it has none.",
    (self, args) => {
      const name = notNull(args[0], "GetAnnotation");
      if (isStatisticsAnnotation(name))
        throw new TeFailure(
          `reads a \`Vertipaq_\` statistics annotation, which ${STATISTICS_REASON}`,
        );
      return getAnnotation(self as TomObject, name);
    },
  ),
  entry(
    "HasAnnotation",
    [S("name")],
    "Boolean",
    "Whether the object has an annotation of that name.",
    (self, args) => hasAnnotation(self as TomObject, notNull(args[0], "HasAnnotation")),
  ),
  entry(
    "Tokenize",
    [],
    "Collection<DaxToken>",
    "The tokens of the object's DAX, comments and white space included, each with `Type`, `Text` and `Next`.",
    (self, _a, rt) => {
      const o = self as TomObject;
      if (!DAX_EXPRESSION_TYPES.has(o.type))
        throw new TeFailure(`${o.type} has no method \`Tokenize\``);
      const text = PROPERTIES[o.type].Expression!.get(o, rt.view);
      if (text === UNSET) throw new TeUnset();
      const tokens = teTokens(typeof text === "string" ? text : "");
      rt.spend(tokens.length);
      return tokens;
    },
  ),
];

/** Methods by the kind of value they are called on. A string has the collection methods too, over its characters. */
const METHODS = {
  String: STRING_METHODS,
  Char: CHAR_METHODS,
  Number: NUMBER_METHODS,
  Boolean: valueMethods("value"),
  Enum: valueMethods("enum value"),
  Collection: COLLECTION_METHODS,
  Object: OBJECT_METHODS,
} as const;

export type TeReceiverKind = keyof typeof METHODS;

const isNullOrWhiteSpace = (v: unknown) => v === null || trimWith(v as string, true, true) === "";

const charStatic = (name: keyof typeof CHAR_TESTS, what: string): TeLibraryEntry =>
  entry(name, [C("c")], "Boolean", `Whether the character is ${what}.`, (_self, args) =>
    CHAR_TESTS[name]((args[0] as TeChar).code),
  );

function checkedPattern(pattern: unknown, ignoreCase: boolean) {
  const text = notNull(pattern, "RegEx.IsMatch");
  const compiled = compilePattern(ignoreCase ? `(?i)${text}` : text);
  if ("invalid" in compiled)
    throw new TeFailure(
      `a pattern passed to \`RegEx.IsMatch\` does not compile: ${compiled.invalid}`,
    );
  if ("unsupported" in compiled)
    throw new TeFailure(
      `a pattern passed to \`RegEx.IsMatch\` uses what pbiplint does not run: ${compiled.unsupported}`,
    );
  return compiled.regex;
}

function regexIsMatch(
  input: unknown,
  pattern: unknown,
  ignoreCase: boolean,
  rt: TeRuntime,
): boolean {
  if (input === null || input === undefined)
    throw new TeFailure("`RegEx.IsMatch` was given null as its input");
  return isMatch(checkedPattern(pattern, ignoreCase), input as string, rt.budget);
}

const STATICS = {
  String: [
    entry(
      "IsNullOrEmpty",
      [S()],
      "Boolean",
      "Whether the string is null or has no characters.",
      (_s, args) => args[0] === null || args[0] === "",
    ),
    entry(
      "IsNullOrWhiteSpace",
      [S()],
      "Boolean",
      "Whether the string is null, empty, or only white space; names match without regard to case, so `IsNullOrWhitespace` is the same.",
      (_s, args) => isNullOrWhiteSpace(args[0]),
    ),
    entry(
      "Concat",
      [S("a"), S("b")],
      "String",
      "The strings joined end to end; null counts as empty.",
      (_s, args) => args.map((x) => (x as string | null) ?? "").join(""),
    ),
    entry(
      "Concat",
      [S("a"), S("b"), S("c")],
      "String",
      "The strings joined end to end; null counts as empty.",
      (_s, args) => args.map((x) => (x as string | null) ?? "").join(""),
    ),
    entry(
      "Join",
      [S("separator"), P("values", "Collection<String>")],
      "String",
      "The strings of a collection joined with the separator between each.",
      (_s, args, rt) =>
        rt
          .items(args[1])
          .map((x) => teToString(x, rt.view))
          .join((args[0] as string | null) ?? ""),
    ),
    entry(
      "Compare",
      [S("a"), S("b")],
      "Int32",
      "-1, 0 or 1 as the first string sorts before, with, or after the second, in culture order.",
      (_s, args) => teCompare(args[0], args[1]),
    ),
    entry(
      "Equals",
      [S("a"), S("b")],
      "Boolean",
      "Whether the two strings are the same, matching case exactly.",
      (_s, args) => args[0] === args[1],
    ),
  ],
  Char: [
    entry(
      "IsWhiteSpace",
      [C("c")],
      "Boolean",
      "Whether the character is white space, as .NET defines it.",
      (_s, args) => isWhiteSpaceCode((args[0] as TeChar).code),
    ),
    charStatic("IsLetter", "a letter, in any script"),
    charStatic("IsDigit", "a decimal digit, in any script"),
    charStatic("IsLetterOrDigit", "a letter or a decimal digit"),
    charStatic("IsUpper", "an upper-case letter"),
    charStatic("IsLower", "a lower-case letter"),
    charStatic("IsControl", "a control character, such as a tab or a line break"),
    charStatic("IsPunctuation", "punctuation"),
    charStatic("IsNumber", "a digit or other number character"),
    charStatic("IsSymbol", "a symbol, such as a currency sign"),
    charStatic("IsSeparator", "a space or other separator"),
    entry(
      "ToUpper",
      [C("c")],
      "Char",
      "The character in upper case.",
      (_s, args) => new TeChar(upper(str(args[0] as TeChar)).charCodeAt(0)),
    ),
    entry(
      "ToLower",
      [C("c")],
      "Char",
      "The character in lower case.",
      (_s, args) => new TeChar(lower(str(args[0] as TeChar)).charCodeAt(0)),
    ),
  ],
  Convert: [
    entry(
      "ToInt32",
      [P("value", "Object")],
      "Int32",
      "A whole number from a string, number, character or true/false; null gives 0; anything else fails the rule.",
      (_s, args) => toInteger(args[0], INT32, "Convert.ToInt32"),
    ),
    entry(
      "ToInt64",
      [P("value", "Object")],
      "Int64",
      "A whole number from a string, number, character or true/false; null gives 0; anything else fails the rule.",
      (_s, args) => toInteger(args[0], INT64, "Convert.ToInt64"),
    ),
    entry(
      "ToDecimal",
      [P("value", "Object")],
      "Decimal",
      "A decimal number from a string or number; null gives 0; anything else fails the rule.",
      (_s, args) => toReal(args[0], "decimal", "Convert.ToDecimal"),
    ),
    entry(
      "ToDouble",
      [P("value", "Object")],
      "Double",
      "A double from a string or number; null gives 0; anything else fails the rule.",
      (_s, args) => toReal(args[0], "double", "Convert.ToDouble"),
    ),
    entry(
      "ToString",
      [P("value", "Object")],
      "String",
      "The value as text, as .NET prints it; null gives an empty string.",
      (_s, args, rt) => teToString(args[0], rt.view),
    ),
    entry(
      "ToBoolean",
      [P("value", "Object")],
      "Boolean",
      "True or false from the text `True` or `False` (any case) or a number (0 is false); anything else fails the rule.",
      (_s, args) => {
        const v = args[0];
        if (v === null || v === undefined) return false;
        if (typeof v === "boolean") return v;
        if (isNumeric(v) && !(v instanceof TeChar)) return numberOf(v) !== 0;
        if (typeof v === "string") {
          const t = v.trim().toLowerCase();
          if (t === "true" || t === "false") return t === "true";
          throw new TeFailure(
            "`Convert.ToBoolean` was given a string that is neither True nor False",
          );
        }
        throw new TeFailure(`\`Convert.ToBoolean\` cannot convert ${an(typeName(v))}`);
      },
    ),
    entry(
      "ToChar",
      [P("value", "Object")],
      "Char",
      "The character with a code (`Convert.ToChar(10)` is a line feed), or the one character of a string.",
      (_s, args) => {
        const v = args[0];
        if (v instanceof TeChar) return v;
        if (typeof v === "number" && v >= 0 && v <= 0xffff) return new TeChar(v);
        if (typeof v === "string" && v.length === 1) return new TeChar(v.charCodeAt(0));
        throw new TeFailure("`Convert.ToChar` was given a value that is not one character");
      },
    ),
  ],
  Math: [
    entry(
      "Max",
      [P("a", "Number"), P("b", "Number")],
      "Number",
      "The larger of two numbers; a double if either is.",
      (_s, args) => numeric(args[0], args[1], Math.max),
    ),
    entry(
      "Min",
      [P("a", "Number"), P("b", "Number")],
      "Number",
      "The smaller of two numbers; a double if either is.",
      (_s, args) => numeric(args[0], args[1], Math.min),
    ),
    entry("Abs", [P("value", "Number")], "Number", "The number without its sign.", (_s, args) =>
      numeric(args[0], 0, (x) => Math.abs(x)),
    ),
    entry(
      "Round",
      [P("value", "Number")],
      "Double",
      "The nearest whole number, halves to the even one, as .NET rounds.",
      (_s, args) => new TeReal(roundHalfEven(numberOf(args[0]))),
    ),
    entry(
      "Round",
      [P("value", "Number"), I("digits")],
      "Double",
      "The number rounded to that many decimal places, halves to the even one.",
      (_s, args) => {
        const f = 10 ** (args[1] as number);
        return new TeReal(roundHalfEven(numberOf(args[0]) * f) / f);
      },
    ),
    entry(
      "Floor",
      [P("value", "Number")],
      "Double",
      "The largest whole number not above the value.",
      (_s, args) => new TeReal(Math.floor(numberOf(args[0]))),
    ),
    entry(
      "Ceiling",
      [P("value", "Number")],
      "Double",
      "The smallest whole number not below the value.",
      (_s, args) => new TeReal(Math.ceil(numberOf(args[0]))),
    ),
  ],
  Regex: [
    entry(
      "IsMatch",
      [S("input"), S("pattern")],
      "Boolean",
      "Whether the .NET regular expression matches anywhere in the input; also spelled `RegEx`. Fails the rule on a null input or a pattern that does not compile.",
      (_s, args, rt) => regexIsMatch(args[0], args[1], false, rt),
    ),
    entry(
      "IsMatch",
      [S("input"), S("pattern"), P("options", "RegexOptions")],
      "Boolean",
      "The same, with `RegexOptions.IgnoreCase` or `RegexOptions.None`; any other option stops the rule.",
      (_s, args, rt) => {
        const o = args[2] as TeEnum | string;
        const name = o instanceof TeEnum ? o.name : o;
        if (name !== "None" && name !== "IgnoreCase")
          throw new TeFailure(
            `\`RegEx.IsMatch\` was given \`RegexOptions.${name}\`, which pbiplint does not run; only \`IgnoreCase\` and \`None\` are`,
          );
        return regexIsMatch(args[0], args[1], name === "IgnoreCase", rt);
      },
    ),
  ],
} as const satisfies Record<string, readonly TeLibraryEntry[]>;

export type TeStaticType = keyof typeof STATICS;

/** Everything a rule can call or name beyond the model's properties. */
export const LIBRARY = {
  /** Methods by the kind of value they are called on. */
  methods: METHODS as Record<TeReceiverKind, readonly TeLibraryEntry[]>,
  /** Properties of values that are not model objects. */
  properties: {
    String: {
      Length: { returns: "Int32", description: "How many characters the string has." },
    },
    Collection: {
      Count: { returns: "Int32", description: "How many elements the collection has." },
    },
  } as Record<string, Record<string, TeLibraryProperty>>,
  /** Static functions by the .NET type they are called on (`string.IsNullOrWhiteSpace`, `Math.Max`). */
  statics: STATICS as Record<TeStaticType, readonly TeLibraryEntry[]>,
  /** Static values by type. */
  staticValues: {
    String: {
      Empty: { returns: "String", description: "The empty string.", value: "" },
    },
  } as Record<string, Record<string, TeLibraryValue>>,
  /**
   * Enums a rule may name a value of. A model enum's values are written through the property of
   * that name (`DataType.Int64` on a column), as Tabular Editor resolves them; `StringComparison`
   * and `RegexOptions` are written on their own.
   */
  enums: {
    ...Object.fromEntries(
      Object.values(ENUMS).map((e) => [
        e.name,
        { type: e, description: `The values of the model's ${e.name} property, by name.` },
      ]),
    ),
    StringComparison: {
      type: STRING_COMPARISON,
      description:
        "How `IndexOf`, `Contains`, `StartsWith`, `EndsWith` and `Equals` compare: ordinal, or ignoring case.",
    },
    RegexOptions: {
      type: REGEX_OPTIONS,
      description: "Options for `RegEx.IsMatch`; pbiplint runs `IgnoreCase` and `None`.",
    },
  } as Record<string, { type: EnumType; description: string }>,
};

/** The entries of a list with a name, matched without regard to case as Dynamic LINQ matches. */
export function entriesNamed(list: readonly TeLibraryEntry[], name: string): TeLibraryEntry[] {
  const l = name.toLowerCase();
  return list.filter((e) => e.name.toLowerCase() === l);
}

/** Whether an argument value fits a parameter type. */
export function accepts(type: string, v: unknown): boolean {
  switch (type) {
    case "String":
      return typeof v === "string" || v === null;
    case "Char":
      return v instanceof TeChar;
    case "Int32":
      return typeof v === "number" || v instanceof TeChar;
    case "Number":
      return isNumeric(v);
    case "Boolean":
      return typeof v === "boolean";
    case "StringComparison":
      return (
        (v instanceof TeEnum && v.type.name === "StringComparison") ||
        (typeof v === "string" &&
          STRING_COMPARISON.values.some((n) => n.toLowerCase() === v.toLowerCase()))
      );
    case "RegexOptions":
      return (
        (v instanceof TeEnum && v.type.name === "RegexOptions") ||
        (typeof v === "string" &&
          REGEX_OPTIONS.values.some((n) => n.toLowerCase() === v.toLowerCase()))
      );
    case "Predicate":
    case "Selector":
      return typeof v === "function";
    case "Collection<String>":
      return Array.isArray(v) || isTeMap(v);
    default:
      return typeof v !== "function";
  }
}

/** Numeric helpers the evaluator's operators share with the library. */
export const numbers = { isNumeric, numberOf, numeric };
