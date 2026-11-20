// Colour in the text report (#256): on only for the text report on a terminal's stdout, or
// through a pipe with FORCE_COLOR, and never in any other output.
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { colourWanted } from "../src/colour.js";
import { main } from "../src/main.js";

const repo = new URL("../../../", import.meta.url).pathname;
const sample = join(repo, "examples/messy-sales");
const ESC = "\u001b";
// eslint-disable-next-line no-control-regex -- the codes are what is being removed
const strip = (s: string): string => s.replace(/\u001b\[[\d;]*m/g, "");

async function run(argv: string[], isTTY: boolean, env: Record<string, string | undefined> = {}) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: () => repo,
    isTTY,
    env,
  });
  return { code, out, err };
}

describe("colourWanted", () => {
  it("is on in a terminal and off through a pipe", () => {
    expect(colourWanted(true, {})).toBe(true);
    expect(colourWanted(false, {})).toBe(false);
  });
  it("follows FORCE_COLOR as Node documents it", () => {
    for (const v of ["", "1", "true", "2", "3"]) {
      expect(colourWanted(false, { FORCE_COLOR: v })).toBe(true);
      expect(colourWanted(true, { FORCE_COLOR: v, NO_COLOR: "1", TERM: "dumb" })).toBe(true);
    }
    for (const v of ["0", "false", "yes"])
      expect(colourWanted(true, { FORCE_COLOR: v })).toBe(false);
  });
  it("is off for a non-empty NO_COLOR, and for TERM=dumb", () => {
    expect(colourWanted(true, { NO_COLOR: "1" })).toBe(false);
    expect(colourWanted(true, { NO_COLOR: "" })).toBe(true);
    expect(colourWanted(true, { TERM: "dumb" })).toBe(false);
    expect(colourWanted(true, { TERM: "xterm-256color" })).toBe(true);
  });
});

describe("the CLI's colour", () => {
  it("colours the text report in a terminal, and is the plain report once the codes go", async () => {
    const plain = await run(["--sample"], false);
    const tty = await run(["--sample"], true);
    expect(plain.out).not.toContain(ESC);
    expect(tty.out).toContain(`${ESC}[1;91mERROR${ESC}[22;39m  [report]`);
    expect(tty.out).toContain(`${ESC}[1mFix these first:${ESC}[22m`);
    // eslint-disable-next-line no-control-regex -- the colour codes are what is matched
    expect(tty.out.split("\n")[0]).toMatch(/\u001b\[1;91m\d+ errors\u001b\[22;39m/);
    expect(strip(tty.out)).toBe(plain.out);
    expect(tty.code).toBe(plain.code);
    expect(tty.err).toBe(plain.err);
  });
  it("is off when the caller gives no terminal or environment, as pbiplint mcp's runs do", async () => {
    let out = "";
    const before = process.env.FORCE_COLOR;
    process.env.FORCE_COLOR = "1";
    try {
      await main(["--sample"], { stdout: (s) => (out += s), stderr: () => {}, cwd: () => repo });
    } finally {
      if (before === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = before;
    }
    expect(out).toContain("Fix these first:");
    expect(out).not.toContain(ESC);
  });
  it("colours through a pipe with FORCE_COLOR", async () => {
    expect((await run(["--sample"], false, { FORCE_COLOR: "1" })).out).toContain(ESC);
  });
  it.each([
    ["NO_COLOR", { NO_COLOR: "1" }],
    ["TERM=dumb", { TERM: "dumb" }],
    ["FORCE_COLOR=0", { FORCE_COLOR: "0" }],
  ])("is off in a terminal with %s", async (_name, env) => {
    expect((await run(["--sample"], true, env)).out).not.toContain(ESC);
  });
  it.each([
    ["--format json", ["--format", "json"]],
    ["--format sarif", ["--format", "sarif"]],
    ["--format markdown", ["--format", "markdown"]],
    ["--quiet", ["--quiet"]],
  ])("is off for %s, even in a terminal with FORCE_COLOR", async (_name, args) => {
    const forced = await run(["--sample", ...args], true, { FORCE_COLOR: "1" });
    expect(forced.out).not.toContain(ESC);
    expect(forced.out).toBe((await run(["--sample", ...args], false)).out);
  });
  it("is off in a file --output writes, even in a terminal with FORCE_COLOR", async () => {
    const out = join(tempDir("colour-output"), "report.txt");
    const forced = await run(["--sample", "--output", out], true, { FORCE_COLOR: "1" });
    expect(forced.out).toBe("");
    expect(readFileSync(out, "utf8")).not.toContain(ESC);
    expect(forced.err).not.toContain(ESC);
  });
  it("is off for explain and --help", async () => {
    for (const argv of [["explain", "BROKEN_FIELD_REFERENCE"], ["--help"]])
      expect((await run(argv, true, { FORCE_COLOR: "1" })).out).not.toContain(ESC);
  });
  it("shows a visual title's escape character as text, with colour on", async () => {
    const root = tempDir("colour-title");
    cpSync(sample, root, { recursive: true });
    const visual = join(
      root,
      "Messy Sales Demo.Report/definition/pages/3cea48e58036b1654474/visuals/88530bc0f64114317e2e/visual.json",
    );
    const text = readFileSync(visual, "utf8");
    expect(text).toContain("'Sales by region'");
    writeFileSync(visual, text.replace("'Sales by region'", "'Sales\\u001b[2J by region'"));
    const tty = await run([root], true);
    expect(tty.out).toContain('"Sales\\u001b[2J by region" on "Overview"');
    // The only escape characters left are the report's own colour codes.
    expect(strip(tty.out)).not.toContain(ESC);
  });
  it("colours each project's report in a run over several projects", async () => {
    const root = tempDir("colour-several");
    cpSync(sample, join(root, "Finance"), { recursive: true });
    cpSync(sample, join(root, "Sales"), { recursive: true });
    const plain = await run([root], false);
    const tty = await run([root], true);
    // eslint-disable-next-line no-control-regex -- the colour codes are what is matched
    expect(tty.out.split("\n")[0]).toMatch(/\u001b\[1;91m\d+ errors\u001b\[22;39m/);
    // eslint-disable-next-line no-control-regex -- the colour codes are what is matched
    expect(tty.out.match(/\u001b\[1mFix these first:/g)).toHaveLength(2);
    expect(strip(tty.out)).toBe(plain.out);
  });
});
