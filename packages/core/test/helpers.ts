import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderFinding } from "../src/engine/run.js";
import { buildIndexes } from "../src/index/build.js";
import { readM } from "../src/m/read.js";
import { EN } from "../src/messages/en.js";
import { msg, templateArgs, type Message } from "../src/messages/format.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import type { Finding, Rule, RuleFinding } from "../src/rules/types.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import type { ParsedFile } from "../src/tmdl/types.js";

/**
 * A rule's finding with its detail as `runRules` writes it: a message is rendered into `detail`
 * and kept as `messageId` and `params`, so a test that runs `check` directly reads the same English.
 * Its params are checked against the template on the way (`checkParams`), so every rule test that
 * renders a finding also proves the finding's params fit its message.
 */
export function rendered(
  f: RuleFinding,
): Omit<RuleFinding, "message"> & Pick<Finding, "detail" | "messageId" | "params"> {
  const { message: _message, ...rest } = f;
  const out = renderFinding(f);
  checkParams(out);
  return { ...rest, ...out };
}

/**
 * How a message's params differ from its English template's arguments: an unknown ID, a param the
 * template does not use, an argument with no param, or a param of the wrong kind (a plural takes a
 * number, a select a string, a date an ISO day, a list an array of strings and messages, a plain
 * argument a string, number, or message). A nested message, alone or as a list item, is checked
 * the same way against its own template. Empty when the params fit.
 */
export function paramProblems(m: Message, where = m.id as string): string[] {
  const template = (EN as Record<string, string>)[m.id];
  if (template === undefined) return [`${where}: not an English message ID`];
  const args = templateArgs(template);
  const problems: string[] = [];
  const isMessage = (v: unknown): v is Message =>
    typeof v === "object" && v !== null && !Array.isArray(v) && "id" in v && "params" in v;
  const nested = (v: Message, at: string) => problems.push(...paramProblems(v, `${at} ${v.id}`));
  for (const name of Object.keys(m.params))
    if (!args.has(name)) problems.push(`${where}: {${name}} is not in the template`);
  for (const [name, arg] of args) {
    const value: unknown = m.params[name];
    const at = `${where}: {${name}}`;
    if (value === undefined) {
      problems.push(`${at} is missing`);
    } else if (arg.kind === "plural") {
      if (typeof value !== "number") problems.push(`${at} is a plural and takes a number`);
    } else if (arg.kind === "select") {
      if (typeof value !== "string") problems.push(`${at} is a select and takes a string`);
    } else if (arg.kind === "date") {
      if (typeof value !== "string" || !ISO_DAY.test(value) || Number.isNaN(Date.parse(value)))
        problems.push(`${at} is a date and takes an ISO day`);
    } else if (arg.kind === "list") {
      if (!Array.isArray(value)) problems.push(`${at} is a list and takes an array`);
      else
        value.forEach((item: unknown, i) => {
          if (isMessage(item)) nested(item, `${at}[${i}]`);
          else if (typeof item !== "string")
            problems.push(`${at}[${i}] is neither a string nor a message`);
        });
    } else if (isMessage(value)) {
      nested(value, at);
    } else if (typeof value !== "string" && typeof value !== "number") {
      problems.push(`${at} is plain and takes a string, number, or message`);
    }
  }
  return problems;
}
const ISO_DAY = /^\d{4}-\d\d-\d\d$/;

/**
 * Throws when a finding's `params` are not exactly its template's arguments (see `paramProblems`),
 * or when it has params without a `messageId`. A finding with neither, a plain `detail`, passes.
 */
export function checkParams(f: Pick<Finding, "messageId" | "params">): void {
  const problems =
    f.messageId === undefined
      ? f.params === undefined
        ? []
        : ["params without a messageId"]
      : paramProblems(msg(f.messageId, { ...(f.params ?? {}) }));
  if (problems.length > 0) throw new Error(`params do not fit:\n${problems.join("\n")}`);
}

export function modelFrom(tmdl: string): Model {
  return buildModel([parseTmdl("inline.tmdl", tmdl)]);
}

/** Run one rule on inline TMDL and return the object names it flags, in emission order. */
export function objectNames(rule: Rule, tmdl: string): string[] {
  const model = modelFrom(tmdl);
  return rule
    .check({ model }, { indexes: buildIndexes({ model }), options: {} })
    .map((f) => f.objectName);
}

/**
 * Run one rule on inline TMDL with its M read by Microsoft's parser, as `lint` reads it, and return
 * the object names it flags, in emission order. For the rules that read `ctx.indexes.m`.
 */
export async function mObjectNames(rule: Rule, tmdl: string): Promise<string[]> {
  const model = modelFrom(tmdl);
  const m = await readM(model, [{ path: "inline.tmdl", text: tmdl }]);
  return rule
    .check({ model }, { indexes: buildIndexes({ model }, m), options: {} })
    .map((f) => f.objectName);
}

/**
 * Run one rule on inline TMDL with its M read by Microsoft's parser, as `lint` reads it, and
 * return its findings without the object each carries for ignores, in emission order.
 */
export async function mFindings(
  rule: Rule,
  tmdl: string,
): Promise<Omit<ReturnType<typeof rendered>, "object">[]> {
  const model = modelFrom(tmdl);
  const m = await readM(model, [{ path: "inline.tmdl", text: tmdl }]);
  return rule
    .check({ model }, { indexes: buildIndexes({ model }, m), options: {} })
    .map(rendered)
    .map(({ object: _object, ...f }) => f);
}

/** Read every .tmdl under `<root>/definition` (or under `<root>` when it is itself a definition folder). */
export function readModelFiles(root: string): { path: string; text: string }[] {
  const base = statSync(join(root, "definition"), { throwIfNoEntry: false })?.isDirectory()
    ? join(root, "definition")
    : root;
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, "en"),
    )) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".tmdl"))
        out.push({ path: relative(root, p).split("\\").join("/"), text: readFileSync(p, "utf8") });
    }
  };
  walk(base);
  return out;
}

export function parseModelDir(root: string): ParsedFile[] {
  return readModelFiles(root).map((f) => parseTmdl(f.path, f.text));
}

/** A PBIP folder's two parts as the CLI would read them, for tests that cannot import the CLI. */
export function readProjectFiles(root: string): {
  model: { path: string; text: string }[];
  report: { path: string; text: string }[];
  modelFolder?: string;
  reportFolder?: string;
} {
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const modelFolder = dirs.find((d) => d.endsWith(".SemanticModel"));
  const reportFolder = dirs.find((d) => d.endsWith(".Report"));
  const model = modelFolder ? readModelFiles(join(root, modelFolder)) : [];
  const report: { path: string; text: string }[] = [];
  if (reportFolder) {
    const base = join(root, reportFolder);
    for (const name of ["definition.pbir", ".platform"])
      if (existsSync(join(base, name)))
        report.push({ path: name, text: readFileSync(join(base, name), "utf8") });
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name, "en"),
      )) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith(".json"))
          report.push({
            path: relative(base, p).split("\\").join("/"),
            text: readFileSync(p, "utf8"),
          });
      }
    };
    walk(join(base, "definition"));
    // The CLI rides the project's .pbip in the report part by its path relative to the report
    // root, one level up, so a finding on it points at the real file.
    const pbip = readdirSync(root).find((n) => n.endsWith(".pbip"));
    if (pbip) report.push({ path: `../${pbip}`, text: readFileSync(join(root, pbip), "utf8") });
  }
  return { model, report, modelFolder, reportFolder };
}

export const fixturesDir = new URL("../../../tests/fixtures/", import.meta.url).pathname;
export const examplesDir = new URL("../../../examples/", import.meta.url).pathname;
