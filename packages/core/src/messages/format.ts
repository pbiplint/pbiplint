import { EN, type MessageId } from "./en.js";

/**
 * A value a template fills in: a name or text from the input (written as given, never read as a
 * template), a number (written as its digits, never grouped, so a year stays `2025`), or a nested
 * message, rendered in the same catalog and language.
 */
export type MessageParam = string | number | Message;

/** A message by ID with its parameters, which a catalog renders in its own language. */
export interface Message {
  readonly id: MessageId;
  readonly params: Readonly<Record<string, MessageParam>>;
}

/** Every message ID's template in one language. */
export type Catalog = Readonly<Record<MessageId, string>>;

/** How a template uses a parameter, as the catalog tests check it. */
export type ArgKind =
  { kind: "plain" } | { kind: "plural" } | { kind: "select"; keys: readonly string[] };

export const msg = (id: MessageId, params: Record<string, MessageParam> = {}): Message => ({
  id,
  params,
});

type Node =
  | string
  | { readonly t: "arg"; readonly name: string }
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
    const t = token(NAME, "plural or select");
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

const parsed = new Map<string, readonly Node[]>();
const parsedTemplate = (template: string): readonly Node[] => {
  let nodes = parsed.get(template);
  if (!nodes) parsed.set(template, (nodes = parse(template)));
  return nodes;
};

const pluralRules = new Map<string, Intl.PluralRules>();
const pluralCategory = (locale: string, n: number): string => {
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
  return rules.select(n);
};

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
        out +=
          typeof value === "string"
            ? value
            : typeof value === "number"
              ? String(value)
              : formatMessage(value, catalog, locale);
      } else if (node.t === "plural") {
        const num = typeof value === "number" ? value : Number(value);
        const branch =
          node.branches.get(`=${num}`) ??
          node.branches.get(pluralCategory(locale, num)) ??
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
  let nodes: readonly Node[];
  try {
    nodes = parsedTemplate(template);
  } catch {
    return template;
  }
  return render(nodes, m.params, catalog, locale, NaN);
}

/**
 * Every parameter a template uses and how, including those inside plural and select branches. A
 * name used both plainly and as a plural or select reports the latter. Throws an Error on a
 * template that does not parse.
 */
export function templateArgs(template: string): ReadonlyMap<string, ArgKind> {
  const args = new Map<string, ArgKind>();
  const walk = (nodes: readonly Node[]): void => {
    for (const node of nodes) {
      if (typeof node === "string" || node.t === "pound") continue;
      const kind: ArgKind =
        node.t === "arg"
          ? { kind: "plain" }
          : node.t === "plural"
            ? { kind: "plural" }
            : { kind: "select", keys: [...node.branches.keys()] };
      if ((args.get(node.name)?.kind ?? "plain") === "plain") args.set(node.name, kind);
      if (node.t !== "arg") node.branches.forEach(walk);
    }
  };
  walk(parse(template));
  return args;
}
