import type { Finding } from "../rules/types.js";
import { EN, type MessageId } from "./en.js";

/**
 * A value a template fills in: a name or text from the input (written as given, never read as a
 * template), a number (written as its digits, never grouped, so a year stays `2025`), a nested
 * message, rendered in the same catalog and language, or a list of names and messages, which
 * `{names, list}` joins as the language does (`{names, list, unit}` with no conjunction). A `{d, date}` parameter is an ISO day, `2025-12-31`.
 */
export type MessageParam = string | number | Message | readonly (string | Message)[];

/** A message by ID with its parameters, which a catalog renders in its own language. */
export interface Message {
  readonly id: MessageId;
  readonly params: Readonly<Record<string, MessageParam>>;
}

/** Every message ID's template in one language. */
export type Catalog = Readonly<Record<MessageId, string>>;

/** How a template uses a parameter, as the catalog tests check it. */
export type ArgKind =
  | { kind: "plain" }
  | { kind: "plural" }
  | { kind: "select"; keys: readonly string[] }
  | { kind: "list"; style?: "unit" }
  | { kind: "date" };

export const msg = (id: MessageId, params: Record<string, MessageParam> = {}): Message => ({
  id,
  params,
});

/**
 * A list as a rule names it: at most `max` items, then the count of the rest as one more item, so
 * English writes `a, b, c, and 3 more`.
 */
export const capped = (items: readonly (string | Message)[], max = 3): (string | Message)[] =>
  items.length <= max
    ? [...items]
    : [...items.slice(0, max), msg("list.more", { count: items.length - max })];

type Node =
  | string
  | { readonly t: "arg"; readonly name: string }
  | { readonly t: "list"; readonly name: string; readonly unit?: true }
  | { readonly t: "date"; readonly name: string }
  | { readonly t: "pound" }
  | {
      readonly t: "plural" | "select";
      readonly name: string;
      readonly branches: ReadonlyMap<string, readonly Node[]>;
    };

const POUND: Node = { t: "pound" };
const NAME = /\s*([A-Za-z_]\w*)\s*/y;
const KEY = /\s*([^\s{}]+)\s*/y;
const PLURAL_KEY = /^(=\d+|zero|one|two|few|many|other)$/;

/**
 * The nodes of a template, or an Error naming where it stops making sense. A `#` is the plural's
 * number only inside a plural branch (a select inside one included), and plain text anywhere else.
 */
function parse(template: string): readonly Node[] {
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`${why} at offset ${i} in template "${template}"`);
  };
  const expect = (c: string): void => {
    if (template[i] !== c) fail(`expected "${c}"`);
    i++;
  };
  const token = (re: RegExp, what: string): string => {
    re.lastIndex = i;
    const m = re.exec(template);
    if (!m) return fail(`expected ${what}`);
    i = re.lastIndex;
    return m[1] as string;
  };

  const nodes = (inPlural: boolean, nested: boolean): Node[] => {
    const out: Node[] = [];
    let text = "";
    const flush = () => {
      if (text) out.push(text);
      text = "";
    };
    while (i < template.length) {
      const c = template[i] as string;
      if (c === "}") {
        if (!nested) fail('unmatched "}"');
        break;
      }
      if (c === "{") {
        flush();
        i++;
        out.push(arg(inPlural));
      } else if (c === "#" && inPlural) {
        flush();
        out.push(POUND);
        i++;
      } else {
        text += c;
        i++;
      }
    }
    flush();
    return out;
  };

  const arg = (inPlural: boolean): Node => {
    const name = token(NAME, "a parameter name");
    if (template[i] === "}") {
      i++;
      return { t: "arg", name };
    }
    expect(",");
    const t = token(NAME, "plural, select, list, or date");
    if (t === "list" && template[i] === ",") {
      i++;
      const style = token(NAME, "a list style");
      if (style !== "unit") fail(`unknown list style "${style}"`);
      expect("}");
      return { t, name, unit: true };
    }
    if (t === "list" || t === "date") {
      expect("}");
      return { t, name };
    }
    if (t !== "plural" && t !== "select") return fail(`unknown argument kind "${t}"`);
    expect(",");
    const branches = new Map<string, readonly Node[]>();
    const skipSpace = () => {
      while (/\s/.test(template[i] ?? "")) i++;
    };
    for (skipSpace(); template[i] !== "}"; skipSpace()) {
      const key = token(KEY, "a branch key");
      if (t === "plural" && !PLURAL_KEY.test(key)) fail(`"${key}" is not a plural category`);
      if (branches.has(key)) fail(`"${key}" appears twice`);
      expect("{");
      branches.set(key, nodes(inPlural || t === "plural", true));
      expect("}");
    }
    i++;
    if (!branches.has("other")) fail(`${t} "${name}" has no "other" branch`);
    return { t, name, branches };
  };

  return nodes(false, false);
}

/** Each template's nodes, parsed once; `null` for one that does not parse, so it is tried once. */
const parsed = new Map<string, readonly Node[] | null>();
const parsedTemplate = (template: string): readonly Node[] | null => {
  let nodes = parsed.get(template);
  if (nodes === undefined) {
    try {
      nodes = parse(template);
    } catch {
      nodes = null;
    }
    parsed.set(template, nodes);
  }
  return nodes;
};

/** A locale's plural rules, list formats, and long date format, built once. */
interface LocaleIntl {
  readonly plural: Intl.PluralRules;
  readonly list: Intl.ListFormat;
  readonly unit: Intl.ListFormat;
  readonly date: Intl.DateTimeFormat;
  readonly english: boolean;
}
const intls = new Map<string, LocaleIntl>();
/** The formatters for `locale`, or English's when Intl refuses it, so a bad locale never throws. */
const intl = (locale: string): LocaleIntl => {
  let found = intls.get(locale);
  if (!found) {
    const build = (tag: string): LocaleIntl => ({
      plural: new Intl.PluralRules(tag),
      list: new Intl.ListFormat(tag, { type: "conjunction" }),
      unit: new Intl.ListFormat(tag, { type: "unit", style: "short" }),
      date: new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }),
      english: tag.split("-")[0]?.toLowerCase() === "en",
    });
    try {
      found = build(locale);
    } catch {
      found = build("en");
    }
    intls.set(locale, found);
  }
  return found;
};

/**
 * A parameter as text: a name as written, a number as its digits, a message rendered, and a list
 * joined as the language does. English writes semicolons for the list's commas when an item holds
 * a comma, as `January 1, 2024; June 30, 2024; and December 31, 2024`. A `unit` list has no
 * conjunction (English writes `a, b, c`) and keeps its punctuation whatever the items hold.
 */
function text(value: MessageParam, catalog: Catalog, locale: string, unit = false): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!Array.isArray(value)) return formatMessage(value as Message, catalog, locale);
  const items = (value as readonly (string | Message)[]).map((item) => text(item, catalog, locale));
  if (unit) return intl(locale).unit.format(items);
  const { list, english } = intl(locale);
  if (!english || !items.some((s) => s.includes(","))) return list.format(items);
  return list
    .formatToParts(items)
    .map((p) => (p.type === "literal" ? p.value.replaceAll(",", ";") : p.value))
    .join("");
}

/** An ISO day (`2025-12-31`) in the locale's long form, in UTC so no day shifts; else as given. */
function day(value: MessageParam, catalog: Catalog, locale: string): string {
  const date = typeof value === "string" && ISO_DAY.test(value) ? new Date(value) : undefined;
  return date && !Number.isNaN(date.getTime())
    ? intl(locale).date.format(date)
    : text(value, catalog, locale);
}
const ISO_DAY = /^\d{4}-\d\d-\d\d$/;

function render(
  nodes: readonly Node[],
  params: Message["params"],
  catalog: Catalog,
  locale: string,
  n: number,
): string {
  let out = "";
  for (const node of nodes) {
    if (typeof node === "string") {
      out += node;
    } else if (node.t === "pound") {
      out += String(n);
    } else {
      const value = params[node.name];
      if (value === undefined) {
        out += `{${node.name}}`;
      } else if (node.t === "arg") {
        out += text(value, catalog, locale);
      } else if (node.t === "list") {
        out += text(value, catalog, locale, node.unit);
      } else if (node.t === "date") {
        out += day(value, catalog, locale);
      } else if (node.t === "plural") {
        const num = typeof value === "number" ? value : Number(value);
        const branch =
          node.branches.get(`=${num}`) ??
          node.branches.get(intl(locale).plural.select(num)) ??
          (node.branches.get("other") as readonly Node[]);
        out += render(branch, params, catalog, locale, num);
      } else {
        const branch =
          (typeof value === "string" ? node.branches.get(value) : undefined) ??
          (node.branches.get("other") as readonly Node[]);
        out += render(branch, params, catalog, locale, n);
      }
    }
  }
  return out;
}

/**
 * The message `m` in the catalog's language. An ID the catalog lacks takes the English template.
 * A missing parameter shows as its `{name}` placeholder and an extra one is ignored, and a template
 * that does not parse is written as it stands, so a slip in a catalog never stops a user's run;
 * the catalog tests catch all three.
 */
export function formatMessage(m: Message, catalog: Catalog = EN, locale = "en"): string {
  const template: string = catalog[m.id] ?? EN[m.id] ?? m.id;
  const nodes = parsedTemplate(template);
  return nodes ? render(nodes, m.params, catalog, locale, NaN) : template;
}

/**
 * A finding's detail in the catalog's language: its message when it has one, else its `detail`
 * as the rule wrote it, which is English. A message neither the catalog nor English knows (as in
 * JSON from a newer pbiplint) also takes the `detail`.
 */
export function findingDetail(
  f: Pick<Finding, "detail" | "messageId" | "params">,
  catalog: Catalog = EN,
  locale = "en",
): string | undefined {
  return f.messageId === undefined ||
    (catalog[f.messageId] === undefined && EN[f.messageId] === undefined)
    ? f.detail
    : formatMessage(msg(f.messageId, f.params), catalog, locale);
}

/**
 * Every parameter a template uses and how, including those inside plural and select branches. A
 * name used both plainly and as a plural, select, list, or date reports the latter, and a select
 * used twice reports the keys of both. Throws an Error on a template that does not parse, or that
 * uses one name as two of plural, select, list, and date.
 */
export function templateArgs(template: string): ReadonlyMap<string, ArgKind> {
  const args = new Map<string, ArgKind>();
  const walk = (nodes: readonly Node[]): void => {
    for (const node of nodes) {
      if (typeof node === "string" || node.t === "pound") continue;
      const seen = args.get(node.name);
      const kind: ArgKind =
        node.t === "arg"
          ? { kind: "plain" }
          : node.t === "list" && node.unit
            ? { kind: "list", style: "unit" }
            : node.t !== "select"
              ? { kind: node.t }
              : {
                  kind: "select",
                  keys: [
                    ...new Set([
                      ...(seen?.kind === "select" ? seen.keys : []),
                      ...node.branches.keys(),
                    ]),
                  ],
                };
      if (seen && seen.kind !== "plain" && kind.kind !== "plain" && seen.kind !== kind.kind) {
        throw new Error(
          `"${node.name}" is both a ${seen.kind} and a ${kind.kind} in template "${template}"`,
        );
      }
      if (kind.kind !== "plain" || !seen) args.set(node.name, kind);
      if ("branches" in node) node.branches.forEach(walk);
    }
  };
  walk(parse(template));
  return args;
}
