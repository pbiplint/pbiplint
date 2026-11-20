import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

// A rule file is data: the custom rules interpreters must never hand a team's text to the
// platform to run, and core stays browser-pure. The bundle check covers only what index.ts
// reaches, so this reads the sources directly, whether or not anything imports them yet.
const dir = fileURLToPath(new URL("../src/custom-rules/", import.meta.url));
const sources = (readdirSync(dir, { recursive: true }) as string[])
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: f, text: readFileSync(join(dir, f), "utf8") }));

const FORBIDDEN: [string, RegExp][] = [
  ["eval", /(?<![\w.$])eval\s*\(/],
  ["Function", /(?<![\w.$])(?:new\s+)?Function\s*\(/],
  ["a RegExp built at run time", /new\s+RegExp\s*\(/],
  ["fetch", /(?<![\w.$])fetch\s*\(/],
  ["a Node import", /from\s+["']node:/],
  ["the DOM", /(?<![\w.$])(?:document|window)\./],
];

describe("the custom rules sources", () => {
  it("are found", () => {
    expect(sources.length).toBeGreaterThan(5);
  });
  it.each(FORBIDDEN)("never use %s", (_label, pattern) => {
    expect(sources.filter((s) => pattern.test(s.text)).map((s) => s.file)).toEqual([]);
  });
});
