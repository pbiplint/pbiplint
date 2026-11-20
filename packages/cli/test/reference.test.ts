import { showControls } from "@pbiplint/core";
import { teReference } from "@pbiplint/core/custom-rules";
import { describe, expect, it } from "vitest";
import { main, VERSION } from "../src/main.js";
import { referenceJson, referenceText } from "../src/reference.js";

const repo = new URL("../../../", import.meta.url).pathname;

async function run(argv: string[]) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: () => repo,
  });
  return { code, out, err };
}

/** Every string and number in a value, however deep, with the path that leads to it. */
function leaves(value: unknown, path = ""): { path: string; value: string | number }[] {
  if (typeof value === "string" || typeof value === "number") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value !== null && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
  return [];
}

describe("referenceJson", () => {
  it("is version 1, the tool, and the Tabular Editor reference, two-space indented with a closing newline", () => {
    const text = referenceJson("1.2.3");
    const doc = JSON.parse(text);
    expect(Object.keys(doc)).toEqual(["version", "tool", "formats"]);
    expect(doc.version).toBe(1);
    expect(doc.tool).toEqual({ name: "pbiplint", version: "1.2.3" });
    expect(Object.keys(doc.formats)).toEqual(["tabularEditor"]);
    expect(doc.formats.tabularEditor).toEqual(teReference());
    expect(text).toBe(JSON.stringify(doc, null, 2) + "\n");
  });
});

describe("referenceText", () => {
  const text = referenceText("1.2.3");

  it("opens with its heading and says how names match and what is not run", () => {
    expect(text.startsWith("pbiplint 1.2.3: what a custom rule can use\n")).toBe(true);
    expect(text).toContain("Names match without regard to case");
    expect(text).toContain(
      "Anything not listed here is not run: a rule that uses it is one RULE_COULD_NOT_FINISH finding with the reason.",
    );
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("has its sections in order", () => {
    const headings = [
      "Rule fields",
      "Severities",
      "Scopes",
      "Properties by object type",
      "Operators",
      "Keywords",
      "Methods by value type",
      "Static functions and values",
      "Conversions",
      "Enums",
      "Tokenize()",
      "Regular expressions",
      "Not run, and why",
      "Limits",
    ];
    const at = headings.map((h) => text.search(new RegExp(`^${h.replace(/[()]/g, "\\$&")}`, "m")));
    expect(at.filter((i) => i < 0)).toEqual([]);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("holds every entry of the JSON reference, walked from the JSON", () => {
    const ref = JSON.parse(referenceJson("1.2.3")).formats.tabularEditor;
    const all = leaves(ref);
    expect(all.length).toBeGreaterThan(1000);
    // A value holding a control character, such as a regular expression example's line feed, is
    // shown as a `\u` escape, as the CLI shows one anywhere.
    const missing = all.filter(({ value }) => !text.includes(showControls(String(value))));
    expect(missing).toEqual([]);
  });

  it("writes each type's properties under it, each method with its parameters, and each not-run entry with its reason", () => {
    const ref = teReference();
    for (const t of ref.types) {
      const start = text.indexOf(`\n  ${t.name}\n`);
      expect(start, t.name).toBeGreaterThan(0);
      const section = text.slice(start, text.indexOf("\n\n", start + 1));
      for (const p of t.properties)
        expect(section, `${t.name}.${p.name}`).toContain(`    ${p.name}: ${p.type}`);
    }
    for (const m of ref.methods) {
      const params = m.params!.map((p) => `${p.name}: ${p.type}`).join(", ");
      expect(text).toContain(`    ${m.name}(${params}): ${m.returns}  ${m.description}`);
    }
    for (const s of ref.statics) {
      const params = s.params!.map((p) => `${p.name}: ${p.type}`).join(", ");
      expect(text).toContain(`  ${s.on}.${s.name}(${params}): ${s.returns}  ${s.description}`);
    }
    for (const n of ref.notRun) expect(text).toContain(`  ${n.name} (${n.kind}): ${n.reason}`);
    for (const l of ref.limits) expect(text).toContain(`  ${l.name}: ${l.value}  ${l.description}`);
  });

  it("holds no em dash and no control character but the line feed", () => {
    expect(text).not.toContain("\u2014");
    // eslint-disable-next-line no-control-regex -- looking for control characters is the point
    expect(text).not.toMatch(/[\u0000-\u0009\u000b-\u001f]/);
  });
});

describe("pbiplint reference", () => {
  it("prints the text by default and the JSON with --format json, exit 0 with nothing on stderr", async () => {
    const plain = await run(["reference"]);
    expect(plain).toEqual({ code: 0, out: referenceText(VERSION), err: "" });
    expect(await run(["reference", "--format", "text"])).toEqual(plain);
    const json = await run(["reference", "--format", "json"]);
    expect(json).toEqual({ code: 0, out: referenceJson(VERSION), err: "" });
  });

  it("refuses an argument or another option with exit 2 and the reason", async () => {
    for (const [argv, why] of [
      [["reference", "x"], "reference takes no arguments"],
      [["reference", "--sample"], "reference takes only --format"],
      [["reference", "--format", "sarif"], "reference prints text or json"],
    ] as const) {
      const r = await run([...argv]);
      expect(r.code).toBe(2);
      expect(r.out).toBe("");
      expect(r.err.split("\n")[0]).toBe(`pbiplint: ${why}`);
    }
  });
});
