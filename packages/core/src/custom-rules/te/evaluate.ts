import { LIMITS } from "../limits.js";
import type { TeExpr, TeTypeRef } from "./ast.js";
import {
  DAX_EXPRESSION_TYPES,
  LIBRARY,
  REGEX_OPTIONS,
  STATISTICS_REASON,
  TeChar,
  TeEnum,
  TeFailure,
  TeReal,
  TeUnset,
  accepts,
  entriesNamed,
  isStatisticsAnnotation,
  isTeMap,
  isToken,
  isTomObject,
  numbers,
  teCompare,
  teEquals,
  teToString,
  typeName,
  type TeLibraryEntry,
  type TeReceiverKind,
  type TeRuntime,
  type TeStaticType,
} from "./library.js";
import type { TeRule } from "./read.js";
import { LimitReached, type Budget } from "./regex.js";
import { tokenTypeCode } from "./tokens.js";
import {
  PROPERTIES,
  SCOPE_TYPES,
  TOM_TYPES,
  UNSET,
  nearestProperty,
  unknownReason,
  type CollectionMember,
  type EnumType,
  type MapType,
  type PropertySpec,
  type TeType,
  type TomObject,
  type TomType,
  type TomView,
} from "./view.js";

/**
 * Runs a Tabular Editor rule over the model view (custom rules spec, sections 6.1 and 6.7), with
 * .NET's semantics as Tabular Editor 3 runs them and as the pull request A probes recorded:
 *
 * - Names are matched without regard to case, as Dynamic LINQ matches them.
 * - A rule is first checked for names it cannot run (a property its scope's types do not have, a
 *   function pbiplint does not run, a property pbiplint knows it cannot answer, a statistics
 *   annotation) and stops there, before any object runs, naming the nearest property.
 * - It then runs once per object of each of its scopes, in the view's order, with `it` the object.
 *   A value the files leave unset (`UNSET`) leaves the object out and counts it.
 * - A .NET exception or a type error on any object stops the rule for the whole project: one
 *   outcome per rule, never findings and a failure together.
 * - A member read, method call, or index on null ends that object's run as no finding, without
 *   failing: Tabular Editor ran `Expression.Contains(...)` over a partition whose expression is
 *   null with no error (PROBE_PQ_EXPRESSION), and `RegEx.IsMatch(Expression.Replace(...), ...)`
 *   over tables with a null Expression (the survey's files), while `RegEx.IsMatch(Expression, ...)`
 *   failed on the same objects (PROBE_FAIL_NULL_EXPRESSION), so null passed as an argument fails
 *   and a null receiver does not. A null value otherwise follows .NET's lifted operators.
 * - Every node evaluated, every element a collection read yields, every character of a string
 *   that `+`, `&`, `Replace`, `String.Concat` or `String.Join` builds, and every regular
 *   expression step spends one step of `LIMITS.stepsPerRule`, held per rule.
 *
 * Reasons are built from the rule's own text and the object type only, never the model's names or
 * values (section 6.7).
 */
export type TeOutcome =
  | { kind: "findings"; objects: TomObject[]; unset: number }
  | { kind: "could-not-run"; reason: string };

const fmt = (n: number) => n.toLocaleString("en-US");
const LIMIT_REASON = `reached the evaluation limit of ${fmt(LIMITS.stepsPerRule)} steps before finishing; a collection searched inside another for every object, such as \`Model.AllMeasures.Any(...)\` in a rule on every column, is the usual cause`;

/** "a String", "an Int32". */
const a = (word: string) => `${/^[AEIOU]/i.test(word) ? "an" : "a"} ${word}`;

/** A property of a type, by name: the exact spelling first, then without regard to case. */
function findProperty(type: TomType, name: string): PropertySpec | undefined {
  const props = PROPERTIES[type];
  if (Object.hasOwn(props, name)) return props[name];
  const l = name.toLowerCase();
  const key = Object.keys(props).find((k) => k.toLowerCase() === l);
  return key === undefined ? undefined : props[key];
}

function findKey<T>(record: Record<string, T> | undefined, name: string): T | undefined {
  if (!record) return undefined;
  const l = name.toLowerCase();
  const key = Object.keys(record).find((k) => k.toLowerCase() === l);
  return key === undefined ? undefined : record[key];
}

/** The reason for a name a type does not have: pbiplint's known gaps first, then the nearest name. */
function missingProperty(type: string, name: string, tomType?: TomType): string {
  const why = unknownReason(name);
  if (why) return `reads \`${name}\`, which ${why}`;
  const near = tomType ? nearestProperty(tomType, name) : undefined;
  return `${type} has no property \`${name}\`${near ? `; \`${near}\` is the nearest` : ""}`;
}

const enumValue = (e: EnumType, name: string) =>
  e.values.find((v) => v.toLowerCase() === name.toLowerCase());

// ---------------------------------------------------------------------------------------------
// The check before running

/** What the check knows of a value's type: a view type, or one of the evaluator's own. */
type ST = TeType | { kind: "char" } | { kind: "null" } | { kind: "unknown" } | { kind: "token" };

const UNKNOWN: ST = { kind: "unknown" };
const ST_STRING: ST = { kind: "string" };
const ST_BOOLEAN: ST = { kind: "boolean" };
const ST_INT: ST = { kind: "int" };
const ST_CHAR: ST = { kind: "char" };
const ST_TOKEN: ST = { kind: "token" };

class StaticError extends Error {}

/** The text of a string literal written in the rule, in parentheses or not. */
const quotedString = (x: TeExpr): string | undefined =>
  x.kind === "literal" && x.type === "string"
    ? x.value
    : x.kind === "paren"
      ? quotedString(x.expr)
      : undefined;

const unwrap = (t: ST): ST => (t.kind === "nullable" ? unwrap(t.of) : t);

function stName(t: ST): string {
  switch (t.kind) {
    case "string":
      return "String";
    case "boolean":
      return "Boolean";
    case "int":
      return "Int32";
    case "long":
      return "Int64";
    case "double":
      return "Double";
    case "decimal":
      return "Decimal";
    case "char":
      return "Char";
    case "enum":
      return t.name;
    case "object":
      return t.of === "any" ? "object" : t.of[0]!;
    case "collection":
    case "map":
      return "collection";
    case "nullable":
      return stName(t.of);
    case "null":
      return "null";
    case "token":
      return "DaxToken";
    case "unknown":
      return "value";
  }
}

/** A library type, as an entry writes it, for the check. */
function libType(notation: string, element: ST, selector: ST): ST {
  switch (notation) {
    case "String":
      return ST_STRING;
    case "String?":
      return { kind: "nullable", of: { kind: "string" } };
    case "Char":
      return ST_CHAR;
    case "Int32":
      return ST_INT;
    case "Int64":
      return { kind: "long" };
    case "Double":
      return { kind: "double" };
    case "Decimal":
      return { kind: "decimal" };
    case "Boolean":
      return ST_BOOLEAN;
    case "T":
    case "T?":
      return element;
    case "Selector":
      return selector;
    case "Collection<T>":
      return element.kind === "unknown" ? UNKNOWN : { kind: "collection", of: element as TeType };
    case "Collection<Char>":
      return { kind: "collection", of: ST_CHAR as unknown as TeType };
    case "Collection<String>":
      return { kind: "collection", of: { kind: "string" } };
    case "Collection<DaxToken>":
      return { kind: "collection", of: ST_TOKEN as unknown as TeType };
    case "Collection<Selector>":
      return { kind: "collection", of: selector as TeType };
    default:
      return UNKNOWN;
  }
}

interface Env<T> {
  it: T;
  outerIt: T;
  current: T;
}

/** Checks names and gives what it can of each node's type. Throws `StaticError` with the reason. */
class Checker {
  check(e: TeExpr, env: Env<ST>): ST {
    switch (e.kind) {
      case "literal":
        switch (e.type) {
          case "string":
            return ST_STRING;
          case "char":
            return ST_CHAR;
          case "boolean":
            return ST_BOOLEAN;
          case "null":
            return { kind: "null" };
          case "number":
            return e.numberKind === "int" || e.numberKind === "uint"
              ? ST_INT
              : e.numberKind === "long" || e.numberKind === "ulong"
                ? { kind: "long" }
                : e.numberKind === "decimal"
                  ? { kind: "decimal" }
                  : { kind: "double" };
        }
        break;
      case "scope":
        return env[e.which];
      case "paren":
        return this.check(e.expr, env);
      case "lambdaBody":
        return this.check(e.body, env);
      case "ident":
        return this.nameOn(env.it, e.name);
      case "member": {
        const t = e.target;
        if (t.kind === "type") return this.staticMember(t, e.name);
        if (t.kind === "ident") {
          const shortcut = this.enumShortcut(env.it, t.name, e.name);
          if (shortcut) return shortcut;
        }
        return this.nameOn(this.check(t, env), e.name);
      }
      case "call": {
        const t = e.target;
        if (t?.kind === "type") return this.staticCall(t, e.name, e.args, env);
        const receiver = t ? this.check(t, env) : env.it;
        return this.methodCall(receiver, e.name, e.args, env);
      }
      case "index": {
        const target = unwrap(this.check(e.target, env));
        for (const x of e.args) this.check(x, env);
        if (target.kind === "collection") return target.of;
        if (target.kind === "map") return target.value;
        if (target.kind === "string") return ST_CHAR;
        if (target.kind === "unknown" || target.kind === "null") return UNKNOWN;
        throw new StaticError(`${a(stName(target))} cannot be indexed with \`[...]\``);
      }
      case "convert":
        for (const x of e.args) this.check(x, env);
        return conversionType(e.type);
      case "unary": {
        const operand = this.check(e.operand, env);
        return e.op === "not" ? ST_BOOLEAN : operand;
      }
      case "binary": {
        const l = unwrap(this.check(e.left, env));
        const r = unwrap(this.check(e.right, env));
        switch (e.op) {
          case "eq":
          case "ne":
            // Dynamic LINQ turns a quoted name into the enum's value when it builds the rule, so
            // a quoted string naming no value fails the rule before any object runs.
            for (const [t, x] of [
              [l, e.right],
              [r, e.left],
            ] as const) {
              const s = quotedString(x);
              if (t.kind === "enum" && s !== undefined && !enumValue(t, s))
                throw new StaticError(
                  `compares ${a(t.name)} with a string that names none of its values`,
                );
            }
            return ST_BOOLEAN;
          case "coalesce":
            return l;
          case "concat":
            return ST_STRING;
          case "add":
            if (l.kind === "string" || r.kind === "string") return ST_STRING;
            return l.kind === "int" && r.kind === "int" ? ST_INT : UNKNOWN;
          case "sub":
          case "mul":
          case "div":
          case "mod":
            return l.kind === "int" && r.kind === "int" ? ST_INT : UNKNOWN;
          default:
            return ST_BOOLEAN;
        }
      }
      case "conditional":
        this.check(e.test, env);
        this.check(e.else, env);
        return this.check(e.then, env);
    }
    return UNKNOWN;
  }

  /** A name read on a value of type `t`: a property, a token's field, a string's `Length`. */
  nameOn(t0: ST, name: string): ST {
    const t = unwrap(t0);
    const l = name.toLowerCase();
    switch (t.kind) {
      case "object": {
        if (t.of === "any") {
          for (const type of TOM_TYPES) {
            const spec = findProperty(type, name);
            if (spec) return spec.type;
          }
          throw new StaticError(missingProperty("No model object", name));
        }
        let found: ST | undefined;
        for (const type of t.of) {
          const spec = findProperty(type, name);
          if (!spec) throw new StaticError(missingProperty(type, name, type));
          found ??= spec.type;
        }
        return found ?? UNKNOWN;
      }
      case "token":
        if (l === "type") return ST_INT;
        if (l === "text") return ST_STRING;
        if (l === "next") return { kind: "nullable", of: ST_TOKEN as unknown as TeType };
        if (tokenTypeCode(name) !== undefined) return ST_INT;
        throw new StaticError(`DaxToken has no property \`${name}\``);
      case "string":
        if (l === "length") return ST_INT;
        break;
      case "collection":
      case "map": {
        if (l === "count") return ST_INT;
        const member = t.kind === "collection" ? findKey(t.members, name) : undefined;
        if (member) return member.type;
        throw new StaticError(`a collection has no property \`${name}\``);
      }
      case "unknown":
        return UNKNOWN;
      case "null":
        return UNKNOWN;
    }
    throw new StaticError(`${stName(t)} has no property \`${name}\``);
  }

  /**
   * `DataType.Int64`: a model enum's value, written through the property of the same name on `it`,
   * as Tabular Editor resolves it (`PartitionSourceType.M` on a partition failed there, since a
   * partition has no property of that name). `RegexOptions.IgnoreCase` is named on its own.
   */
  enumShortcut(it0: ST, ident: string, member: string): ST | undefined {
    const it = unwrap(it0);
    if (it.kind === "object" && it.of !== "any") {
      const spec = findProperty(it.of[0]!, ident);
      if (spec) {
        const t = unwrap(spec.type);
        if (t.kind !== "enum") return undefined;
        if (!enumValue(t, member)) throw new StaticError(`${t.name} has no value \`${member}\``);
        return t;
      }
    }
    if (ident.toLowerCase() === "regexoptions") {
      if (!enumValue(REGEX_OPTIONS, member))
        throw new StaticError(`RegexOptions has no value \`${member}\``);
      return REGEX_OPTIONS;
    }
    return undefined;
  }

  staticMember(type: TeTypeRef, name: string): ST {
    const e = LIBRARY.enums[type.name];
    if (e) {
      if (!enumValue(e.type, name)) throw new StaticError(`${type.name} has no value \`${name}\``);
      return e.type;
    }
    const value = findKey(LIBRARY.staticValues[type.name], name);
    if (value) return libType(value.returns, UNKNOWN, UNKNOWN);
    throw new StaticError(`\`${type.written}.${name}\` is not one of the values pbiplint knows`);
  }

  staticCall(type: TeTypeRef, name: string, args: readonly TeExpr[], env: Env<ST>): ST {
    const list = LIBRARY.statics[type.name as TeStaticType] as
      readonly TeLibraryEntry[] | undefined;
    const named = list ? entriesNamed(list, name) : [];
    if (named.length === 0)
      throw new StaticError(
        `\`${type.written}.${name}\` is not one of the functions pbiplint runs`,
      );
    const entry = byArity(named, args.length, `${type.written}.${name}`, StaticError);
    for (const x of args) this.check(x, env);
    return libType(entry.returns, UNKNOWN, UNKNOWN);
  }

  methodCall(receiver0: ST, name: string, args: readonly TeExpr[], env: Env<ST>): ST {
    const receiver = unwrap(receiver0);
    let lists: TeReceiverKind[];
    let element: ST = UNKNOWN;
    switch (receiver.kind) {
      case "string":
        lists = ["String", "Collection"];
        element = ST_CHAR;
        break;
      case "collection":
        lists = ["Collection"];
        element = receiver.of;
        break;
      case "map":
        lists = ["Collection"];
        element = receiver.value;
        break;
      case "char":
        lists = ["Char"];
        break;
      case "int":
      case "long":
      case "double":
      case "decimal":
        lists = ["Number"];
        break;
      case "boolean":
        lists = ["Boolean"];
        break;
      case "enum":
        lists = ["Enum"];
        break;
      case "object":
        lists = ["Object"];
        if (name.toLowerCase() === "tokenize" && receiver.of !== "any") {
          const bad = receiver.of.find((t) => !DAX_EXPRESSION_TYPES.has(t));
          if (bad) throw new StaticError(`${bad} has no method \`Tokenize\``);
        }
        break;
      case "token":
        lists = [];
        break;
      default:
        for (const x of args) this.check(x, { ...env, it: UNKNOWN, outerIt: env.it });
        return UNKNOWN;
    }
    const named = lists.flatMap((k) => entriesNamed(LIBRARY.methods[k], name));
    if (named.length === 0) throw new StaticError(`${stName(receiver)} has no method \`${name}\``);
    const entry = byArity(named, args.length, name, StaticError);
    const first = args[0];
    if (
      entry.name === "GetAnnotation" &&
      first?.kind === "literal" &&
      first.type === "string" &&
      isStatisticsAnnotation(first.value)
    )
      throw new StaticError(`reads \`${first.value}\`, which ${STATISTICS_REASON}`);
    let selector: ST = UNKNOWN;
    for (const x of args) {
      if (x.kind === "lambdaBody")
        selector = this.check(x.body, { it: element, outerIt: env.it, current: env.current });
      else this.check(x, env);
    }
    return libType(entry.returns, element, selector);
  }
}

/** The entries taking this many arguments, or the reason none does. */
function byArity(
  named: readonly TeLibraryEntry[],
  count: number,
  written: string,
  E: new (m: string) => Error,
): TeLibraryEntry {
  const entry = named.find((x) => x.params.length === count);
  if (entry) return entry;
  const arities = [...new Set(named.map((x) => x.params.length))].sort((p, q) => p - q);
  throw new E(
    `\`${written}\` takes ${arities.join(" or ")} argument${arities.length === 1 && arities[0] === 1 ? "" : "s"}, not ${count}`,
  );
}

const INTEGER_TYPES = new Set([
  "SByte",
  "Byte",
  "Int16",
  "UInt16",
  "Int32",
  "UInt32",
  "Int64",
  "UInt64",
]);
const REAL_TYPES = new Set(["Single", "Double", "Decimal"]);

function conversionType(type: TeTypeRef): ST {
  if (type.name === "Char") return ST_CHAR;
  if (INTEGER_TYPES.has(type.name)) return ST_INT;
  if (REAL_TYPES.has(type.name)) return { kind: type.name === "Decimal" ? "decimal" : "double" };
  throw new StaticError(
    `converting to ${type.name} with \`${type.written}(...)\` is not supported; use \`Convert\``,
  );
}

/** The check for one object type; returns the reason the rule cannot run, if any. */
function checkFor(expr: TeExpr, type: TomType): string | undefined {
  const it: ST = { kind: "object", of: [type] };
  try {
    const result = unwrap(new Checker().check(expr, { it, outerIt: it, current: it }));
    if (result.kind !== "boolean" && result.kind !== "unknown" && result.kind !== "null")
      return `the expression gives ${a(stName(result))}, where a rule needs true or false`;
    return undefined;
  } catch (e) {
    if (e instanceof StaticError) return e.message;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Running

/**
 * A member read, method call, or index on null: .NET's NullReferenceException, which pbiplint
 * treats as the object not failing the rule. The evidence is two cases in Tabular Editor's
 * captures, which found nothing and reported no error for each: `Expression.Contains(...)` on a
 * partition with no expression, and `RegEx.IsMatch(Expression.Replace(" ", ""), ...)` on tables
 * with no expression. `RegEx.IsMatch(Expression, ...)` failed on the same tables, where the null
 * is an argument.
 */
class NullReceiver extends Error {}

class Evaluator implements TeRuntime {
  readonly budget: Budget = { left: LIMITS.stepsPerRule };
  private readonly members = new WeakMap<object, Record<string, CollectionMember>>();
  private readonly maps = new WeakMap<object, MapType>();

  constructor(readonly view: TomView) {}

  spend(steps: number): void {
    this.budget.left -= steps;
    if (this.budget.left < 0) throw new LimitReached();
  }

  items(c: unknown): readonly unknown[] {
    if (typeof c === "string") {
      this.spend(c.length);
      return Array.from({ length: c.length }, (_, i) => new TeChar(c.charCodeAt(i)));
    }
    if (Array.isArray(c)) return c;
    if (isTeMap(c)) {
      const type = this.maps.get(c);
      return c.entries.map(([, v]) => this.wrap(v, type?.value));
    }
    throw new TeFailure(`${a(typeName(c))} is not a collection`);
  }

  /** Whether the rule holds for the object: true, false, or null (never true). */
  run(expr: TeExpr, o: TomObject): boolean {
    const v = this.evalNode(expr, { it: o, outerIt: o, current: o });
    if (v !== null && typeof v !== "boolean")
      throw new TeFailure(
        `the expression gives ${a(typeName(v))}, where a rule needs true or false`,
      );
    return v === true;
  }

  /** A value read from the view, with its .NET type made explicit where it matters. */
  private wrap(v: unknown, type: TeType | undefined): unknown {
    if (!type) return v;
    const t = type.kind === "nullable" ? type.of : type;
    if (t.kind === "enum" && typeof v === "string") return new TeEnum(t, v);
    if (t.kind === "collection" && Array.isArray(v)) {
      this.spend(v.length);
      if (t.members) this.members.set(v, t.members);
    } else if (t.kind === "map" && isTeMap(v)) {
      this.spend(v.entries.length);
      this.maps.set(v, t);
    } else if ((t.kind === "double" || t.kind === "decimal") && typeof v === "number") {
      return new TeReal(v, t.kind);
    }
    return v;
  }

  private property(o: TomObject, name: string): unknown {
    const spec = findProperty(o.type, name);
    if (!spec) throw new TeFailure(missingProperty(o.type, name, o.type));
    const v = spec.get(o, this.view);
    if (v === UNSET) throw new TeUnset();
    return this.wrap(v, spec.type);
  }

  /** A name read on a value: a property, a token's field, a string's `Length`, a collection's `Count`. */
  private member(v: unknown, name: string): unknown {
    if (v === null || v === undefined) throw new NullReceiver();
    if (isTomObject(v)) return this.property(v, name);
    const l = name.toLowerCase();
    if (isToken(v)) {
      if (l === "type") return tokenTypeCode(v.Type) ?? -1;
      if (l === "text") return v.Text;
      if (l === "next") return v.Next;
      const code = tokenTypeCode(name);
      if (code !== undefined) return code;
      throw new TeFailure(`DaxToken has no property \`${name}\``);
    }
    if (typeof v === "string" && l === "length") return v.length;
    if (Array.isArray(v) || isTeMap(v)) {
      if (l === "count") return Array.isArray(v) ? v.length : v.entries.length;
      const m = Array.isArray(v) ? findKey(this.members.get(v), name) : undefined;
      if (m) return this.wrap(m.get(v as unknown[], this.view), m.type);
      throw new TeFailure(`a collection has no property \`${name}\``);
    }
    throw new TeFailure(`${typeName(v)} has no property \`${name}\``);
  }

  private enumShortcut(it: unknown, ident: string, member: string): TeEnum | undefined {
    if (isTomObject(it)) {
      const spec = findProperty(it.type, ident);
      if (spec) {
        const t = spec.type.kind === "nullable" ? spec.type.of : spec.type;
        if (t.kind !== "enum") return undefined;
        const value = enumValue(t, member);
        if (!value) throw new TeFailure(`${t.name} has no value \`${member}\``);
        return new TeEnum(t, value);
      }
    }
    if (ident.toLowerCase() === "regexoptions") {
      const value = enumValue(REGEX_OPTIONS, member);
      if (!value) throw new TeFailure(`RegexOptions has no value \`${member}\``);
      return new TeEnum(REGEX_OPTIONS, value);
    }
    return undefined;
  }

  private staticValue(type: TeTypeRef, name: string): unknown {
    const e = LIBRARY.enums[type.name];
    if (e) {
      const value = enumValue(e.type, name);
      if (value) return new TeEnum(e.type, value);
    }
    const v = findKey(LIBRARY.staticValues[type.name], name);
    if (v) return v.value;
    throw new TeFailure(`\`${type.written}.${name}\` is not one of the values pbiplint knows`);
  }

  private pick(
    named: readonly TeLibraryEntry[],
    args: readonly unknown[],
    written: string,
  ): TeLibraryEntry {
    const sameArity = named.filter((x) => x.params.length === args.length);
    if (sameArity.length === 0) byArity(named, args.length, written, TeFailure);
    const entry = sameArity.find((x) => x.params.every((p, i) => accepts(p.type, args[i])));
    if (entry) return entry;
    const given = args.map((x) => (typeof x === "function" ? "condition" : typeName(x)));
    throw new TeFailure(
      `\`${written}\` was given arguments of the wrong type (${given.join(", ")})`,
    );
  }

  private callStatic(
    type: TeTypeRef,
    name: string,
    argNodes: readonly TeExpr[],
    env: Env<unknown>,
  ) {
    const list = LIBRARY.statics[type.name as TeStaticType] as
      readonly TeLibraryEntry[] | undefined;
    const named = list ? entriesNamed(list, name) : [];
    if (named.length === 0)
      throw new TeFailure(`\`${type.written}.${name}\` is not one of the functions pbiplint runs`);
    const args = argNodes.map((x) => this.evalNode(x, env));
    return this.pick(named, args, `${type.written}.${name}`).run(null, args, this);
  }

  private receiverKinds(v: unknown): TeReceiverKind[] {
    if (typeof v === "string") return ["String", "Collection"];
    if (v instanceof TeChar) return ["Char"];
    if (typeof v === "number" || v instanceof TeReal) return ["Number"];
    if (typeof v === "boolean") return ["Boolean"];
    if (v instanceof TeEnum) return ["Enum"];
    if (Array.isArray(v) || isTeMap(v)) return ["Collection"];
    if (isTomObject(v)) return ["Object"];
    return [];
  }

  private callMethod(
    receiver: unknown,
    name: string,
    argNodes: readonly TeExpr[],
    env: Env<unknown>,
  ) {
    if (receiver === null || receiver === undefined) throw new NullReceiver();
    const named = this.receiverKinds(receiver).flatMap((k) =>
      entriesNamed(LIBRARY.methods[k], name),
    );
    if (named.length === 0) throw new TeFailure(`${typeName(receiver)} has no method \`${name}\``);
    const args = argNodes.map((x) =>
      x.kind === "lambdaBody"
        ? (item: unknown) =>
            this.evalNode(x.body, { it: item, outerIt: env.it, current: env.current })
        : this.evalNode(x, env),
    );
    return this.pick(named, args, name).run(receiver, args, this);
  }

  private index(target: unknown, key0: unknown): unknown {
    if (target === null || target === undefined) throw new NullReceiver();
    // `TranslatedNames[culture]`: Tabular Editor's indexers also take the object a key names.
    const key = isTomObject(key0) && isTeMap(target) ? this.property(key0, "Name") : key0;
    if (Array.isArray(target) || typeof target === "string") {
      if (typeof key !== "number")
        throw new TeFailure(`indexes a collection with ${a(typeName(key))}, not a whole number`);
      if (key < 0 || key >= target.length)
        throw new TeFailure("reads an index outside the collection");
      return typeof target === "string" ? new TeChar(target.charCodeAt(key)) : target[key];
    }
    if (isTeMap(target)) {
      if (typeof key !== "string")
        throw new TeFailure(`looks up ${a(typeName(key))} where a name belongs`);
      const type = this.maps.get(target);
      const hit = target.lookup(key);
      if (hit.found) return this.wrap(hit.value, type?.value);
      const missing = type?.onMissingKey;
      if (missing && "value" in missing) return missing.value;
      throw new TeFailure(`looks up a name that is not there: ${missing?.throws ?? "no such key"}`);
    }
    throw new TeFailure(`${a(typeName(target))} cannot be indexed with \`[...]\``);
  }

  private convert(type: TeTypeRef, v: unknown): unknown {
    const fail = () => {
      throw new TeFailure(`\`${type.written}(...)\` cannot convert ${a(typeName(v))}`);
    };
    if (type.name === "Char") {
      if (v instanceof TeChar) return v;
      if (typeof v === "number" && v >= 0 && v <= 0xffff) return new TeChar(v);
      return fail();
    }
    if (INTEGER_TYPES.has(type.name)) {
      if (typeof v === "number") return v;
      if (v instanceof TeReal) return Math.trunc(v.value);
      if (v instanceof TeChar) return v.code;
      return fail();
    }
    if (REAL_TYPES.has(type.name)) {
      if (typeof v === "number" || v instanceof TeReal || v instanceof TeChar)
        return new TeReal(numbers.numberOf(v), type.name === "Decimal" ? "decimal" : "double");
      return fail();
    }
    return conversionType(type);
  }

  /** A side of `and`, `or`, `not` or a test: true, false, or null. */
  private logical(v: unknown, spelling: string): boolean | null {
    if (v === null || typeof v === "boolean") return v;
    throw new TeFailure(`\`${spelling}\` needs true or false, not ${a(typeName(v))}`);
  }

  private equals(l: unknown, r: unknown, e: TeExpr & { kind: "binary" }): boolean {
    // An enum compares with a string only when the string is written in the rule, as Dynamic LINQ
    // turns a quoted name into the enum's value; any other string is a type error there.
    const quoted = (x: TeExpr): boolean =>
      (x.kind === "literal" && x.type === "string") || (x.kind === "paren" && quoted(x.expr));
    if (
      (l instanceof TeEnum && typeof r === "string" && !quoted(e.right)) ||
      (r instanceof TeEnum && typeof l === "string" && !quoted(e.left))
    )
      throw new TeFailure(
        `compares ${a(l instanceof TeEnum ? l.type.name : (r as TeEnum).type.name)} with a String that is not written in the rule; compare with \`ToString()\` instead`,
      );
    return teEquals(l, r);
  }

  /**
   * `and` or `or` whose left side read a value the files leave unset. The answer is still known
   * when the right side alone decides it (false for `and`, true for `or`), whatever the unset
   * value is, so that is no guess. Otherwise the object stays out: unset again, even when the right
   * side fails, since with the real left value .NET might never have evaluated it. A read on null
   * on the right of `or` is unset as well: with the real left value the object might be found.
   * Under `and` it stays a pass, which it is whatever the left value is.
   */
  private afterUnsetLeft(e: TeExpr & { kind: "binary" }, env: Env<unknown>, decides: boolean) {
    let r: boolean | null;
    try {
      r = this.logical(this.evalNode(e.right, env), e.spelling);
    } catch (err) {
      if (err instanceof TeUnset || err instanceof TeFailure) throw new TeUnset();
      if (err instanceof NullReceiver && decides) throw new TeUnset();
      throw err;
    }
    if (r === decides) return decides;
    throw new TeUnset();
  }

  private binary(e: TeExpr & { kind: "binary" }, env: Env<unknown>): unknown {
    switch (e.op) {
      case "and": {
        let l: boolean | null;
        try {
          l = this.logical(this.evalNode(e.left, env), e.spelling);
        } catch (err) {
          if (err instanceof TeUnset) return this.afterUnsetLeft(e, env, false);
          throw err;
        }
        if (l === false) return false;
        const r = this.logical(this.evalNode(e.right, env), e.spelling);
        if (r === false) return false;
        return l === null || r === null ? null : true;
      }
      case "or": {
        let l: boolean | null;
        try {
          l = this.logical(this.evalNode(e.left, env), e.spelling);
        } catch (err) {
          if (err instanceof TeUnset) return this.afterUnsetLeft(e, env, true);
          throw err;
        }
        if (l === true) return true;
        const r = this.logical(this.evalNode(e.right, env), e.spelling);
        if (r === true) return true;
        return l === null || r === null ? null : false;
      }
      case "coalesce": {
        const l = this.evalNode(e.left, env);
        return l ?? this.evalNode(e.right, env);
      }
    }
    const l = this.evalNode(e.left, env);
    const r = this.evalNode(e.right, env);
    switch (e.op) {
      case "eq":
        return this.equals(l, r, e);
      case "ne":
        return !this.equals(l, r, e);
      case "lt":
      case "gt":
      case "le":
      case "ge": {
        if ((l === null) !== (r === null) && typeof (l ?? r) !== "string") return false;
        const c = teCompare(l, r);
        return e.op === "lt" ? c < 0 : e.op === "gt" ? c > 0 : e.op === "le" ? c <= 0 : c >= 0;
      }
      case "concat":
        return this.joined(teToString(l, this.view), teToString(r, this.view));
      case "add":
        if (typeof l === "string" || typeof r === "string") {
          if ((typeof l === "string" || l === null) && (typeof r === "string" || r === null))
            return this.joined(l ?? "", r ?? "");
          throw new TeFailure(
            `\`+\` joins ${a(typeName(l))} with ${a(typeName(r))}; turn the other into text with \`Convert.ToString\` first`,
          );
        }
        return this.arithmetic(l, r, e.spelling, (x, y) => x + y);
      case "sub":
        return this.arithmetic(l, r, e.spelling, (x, y) => x - y);
      case "mul":
        return this.arithmetic(l, r, e.spelling, (x, y) => x * y);
      case "div":
      case "mod": {
        const whole = !(l instanceof TeReal) && !(r instanceof TeReal);
        if (whole && numbers.isNumeric(r) && numbers.numberOf(r) === 0 && numbers.isNumeric(l))
          throw new TeFailure(`\`${e.spelling}\` divides a whole number by zero`);
        return this.arithmetic(l, r, e.spelling, (x, y) => {
          if (e.op === "mod") return x % y || 0;
          return whole ? Math.trunc(x / y) || 0 : x / y;
        });
      }
    }
  }

  /** Two strings end to end, their length spent first, as the library's string builders do. */
  private joined(l: string, r: string): string {
    this.spend(l.length + r.length);
    return l + r;
  }

  private arithmetic(
    l: unknown,
    r: unknown,
    spelling: string,
    f: (x: number, y: number) => number,
  ): unknown {
    if (l === null || r === null) return null;
    if (!numbers.isNumeric(l) || !numbers.isNumeric(r))
      throw new TeFailure(
        `\`${spelling}\` needs two numbers, not ${a(typeName(l))} and ${a(typeName(r))}`,
      );
    return numbers.numeric(l, r, f);
  }

  evalNode(e: TeExpr, env: Env<unknown>): unknown {
    this.spend(1);
    switch (e.kind) {
      case "literal":
        switch (e.type) {
          case "string":
            return e.value;
          case "char":
            return new TeChar(e.value.charCodeAt(0));
          case "number":
            return e.numberKind === "double" || e.numberKind === "float"
              ? new TeReal(e.value)
              : e.numberKind === "decimal"
                ? new TeReal(e.value, "decimal")
                : e.value;
          default:
            return e.value;
        }
      case "scope":
        return env[e.which];
      case "paren":
        return this.evalNode(e.expr, env);
      case "lambdaBody":
        return this.evalNode(e.body, env);
      case "ident":
        return this.member(env.it, e.name);
      case "member": {
        const t = e.target;
        if (t.kind === "type") return this.staticValue(t, e.name);
        if (t.kind === "ident") {
          const shortcut = this.enumShortcut(env.it, t.name, e.name);
          if (shortcut) return shortcut;
        }
        return this.member(this.evalNode(t, env), e.name);
      }
      case "call": {
        const t = e.target;
        if (t?.kind === "type") return this.callStatic(t, e.name, e.args, env);
        return this.callMethod(t ? this.evalNode(t, env) : env.it, e.name, e.args, env);
      }
      case "index": {
        const target = this.evalNode(e.target, env);
        const keys = e.args.map((x) => this.evalNode(x, env));
        if (keys.length !== 1) throw new TeFailure("an index takes one value inside `[...]`");
        return this.index(target, keys[0]);
      }
      case "convert": {
        const args = e.args.map((x) => this.evalNode(x, env));
        if (args.length !== 1)
          throw new TeFailure(`\`${e.type.written}(...)\` takes one value to convert`);
        return this.convert(e.type, args[0]);
      }
      case "unary": {
        const v = this.evalNode(e.operand, env);
        if (e.op === "not") {
          const b = this.logical(v, e.spelling);
          return b === null ? null : !b;
        }
        if (v === null) return null;
        if (!numbers.isNumeric(v))
          throw new TeFailure(`\`-\` needs a number, not ${a(typeName(v))}`);
        return v instanceof TeReal ? new TeReal(-v.value, v.kind) : -numbers.numberOf(v) || 0;
      }
      case "binary":
        return this.binary(e, env);
      case "conditional": {
        const test = this.logical(this.evalNode(e.test, env), e.form);
        return this.evalNode(test === true ? e.then : e.else, env);
      }
    }
  }
}

/**
 * Runs a parsed rule over the view: the objects of its scopes it holds for, and how many were left
 * out for a value the files leave unset; or the one reason it could not run.
 */
export function evaluateTeRule(rule: TeRule, expr: TeExpr, view: TomView): TeOutcome {
  const objects: TomObject[] = [];
  const seen = new Set<TomObject>();
  for (const scope of rule.scopes)
    for (const o of view.objectsOf(scope))
      if (!seen.has(o)) {
        seen.add(o);
        objects.push(o);
      }

  const types = new Set(objects.map((o) => o.type));
  for (const scope of rule.scopes)
    for (const type of findKey(SCOPE_TYPES, scope) ?? []) types.add(type);
  for (const type of types) {
    const reason = checkFor(expr, type);
    if (reason !== undefined) return { kind: "could-not-run", reason };
  }

  const evaluator = new Evaluator(view);
  const found: TomObject[] = [];
  let unset = 0;
  for (const o of objects) {
    try {
      if (evaluator.run(expr, o)) found.push(o);
    } catch (e) {
      if (e instanceof NullReceiver) continue;
      if (e instanceof TeUnset) unset++;
      else if (e instanceof TeFailure)
        return { kind: "could-not-run", reason: `${e.message}, on ${a(o.type)}` };
      else if (e instanceof LimitReached) return { kind: "could-not-run", reason: LIMIT_REASON };
      else throw e;
    }
  }
  return { kind: "findings", objects: found, unset };
}
