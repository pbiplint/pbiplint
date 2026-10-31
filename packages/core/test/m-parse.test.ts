import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseM } from "../src/m/parse.js";

describe("parseM", () => {
  it("returns the tree and its node map for M that parses", async () => {
    const r = await parseM('let\n    Source = #"Step 1",\n    x = @Source\nin\n    Source');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast.kind).toBe("LetExpression");
    expect(r.nodeIdMapCollection.astNodeById.size).toBeGreaterThan(0);
  });
  it("reports a parse error with the parser's English message and the token it stopped at", async () => {
    const r = await parseM("let\n    a = 1,\n    b = \nin\n    a");
    expect(r).toEqual({
      ok: false,
      message: expect.stringMatching(
        /^Expected to find one of the following, but a keyword <'in'> was found instead/,
      ),
      position: { lineNumber: 3, lineCodeUnit: 0 },
    });
  });
  it("reports a lex error at its position", async () => {
    const r = await parseM('let\n    a = "unterminated\nin a');
    expect(r).toEqual({
      ok: false,
      message: "Unterminated string",
      position: { lineNumber: 1, lineCodeUnit: 8 },
    });
  });
  it("reports a lex error inside a line with its own message and place", async () => {
    expect(await parseM("let a = 0xZZ in a")).toEqual({
      ok: false,
      message: "Expected a hex literal",
      position: { lineNumber: 0, lineCodeUnit: 8 },
    });
    expect(await parseM("let\n    a = ^\nin a")).toEqual({
      ok: false,
      message: "Expected a keyword or identifier",
      position: { lineNumber: 1, lineCodeUnit: 8 },
    });
  });
  it("reports the first line when lex errors are on several lines", async () => {
    expect(await parseM("let\n  a = 0xZZ,\n  b = ^\nin a")).toEqual({
      ok: false,
      message: "Expected a hex literal",
      position: { lineNumber: 1, lineCodeUnit: 6 },
    });
  });
  it("reports tokens left over after a whole expression", async () => {
    const r = await parseM("1 2");
    expect(r).toEqual({
      ok: false,
      message: "Finished parsing but more tokens remain",
      position: { lineNumber: 0, lineCodeUnit: 2 },
    });
  });
  it("pins the parser to exactly 4.0.1", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.dependencies["@microsoft/powerquery-parser"]).toBe("4.0.1");
  });
});
