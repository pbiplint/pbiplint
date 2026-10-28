import { describe, expect, it } from "vitest";
import { maskLiterals } from "../src/m/mask.js";

/** A made-up value in the fixtures' form (v3 spec, section 11.3). */
const fake = (kind: string, n: string): string => `pbiplint-fixture-${kind}-${n}-notreal`;

describe("maskLiterals (v3 spec, section 7)", () => {
  it.each([
    ["a literal", `a = "${fake("key", "0101")}", b`, 'a = "…", b'],
    ["an empty literal, kept", 'a = "", b = 1', 'a = "", b = 1'],
    ["doubled quotes inside a literal", `a = "say ""${fake("key", "0102")}""", b`, 'a = "…", b'],
    [
      "a quoted name, kept",
      '#"Changed Type" = Table.AddColumn(t, "Key", each "x")',
      '#"Changed Type" = Table.AddColumn(t, "…", each "…")',
    ],
    [
      "a literal left open",
      `Source = Web.Contents("https://api.example.com/v1?key=${fake("key", "0103")}`,
      'Source = Web.Contents("…',
    ],
    [
      "a quote in a block comment",
      `x = 1 /* 5" */, k = "${fake("key", "0104")}"`,
      'x = 1 /*…*/, k = "…"',
    ],
    ["quoted text in a line comment", `// old key "${fake("key", "0105")}"`, "//…"],
    [
      "a literal over two lines",
      `a = "${fake("key", "0106").replace("key-", "key-\n")}", b = "x"`,
      'a = "…\n…", b = "…"',
    ],
    ["a block comment over two lines", "/* a\nb */ c", "/*…\n…*/ c"],
    ["an empty line comment, kept", "x = 1 //", "x = 1 //"],
    [
      "text with no quote, unchanged",
      "Expected to find a comma <','>",
      "Expected to find a comma <','>",
    ],
    [
      "a TMDL line",
      `    measure 'Service Token' = "${fake("token", "0107")}"`,
      "    measure 'Service Token' = \"…\"",
    ],
  ])("hides %s", (_name, text, masked) => {
    expect(maskLiterals(text)).toBe(masked);
    expect(maskLiterals(text, { tmdl: true })).toBe(masked);
  });

  it("keeps a TMDL name with a double quote in it, and hides the literal after it", () => {
    expect(maskLiterals(`measure 'Size 5"' = "sample text"`, { tmdl: true })).toBe(
      'measure \'Size 5"\' = "…"',
    );
  });

  it("reads an apostrophe in M as no name delimiter", () => {
    expect(maskLiterals(`a = "it's", b = 'plain note'`)).toBe(`a = "…", b = 'plain note'`);
    // M's lexer pairs the double quotes as written, where TMDL would keep the `'...'` name.
    expect(maskLiterals(`x = 'a"b' & "plain note"`)).toBe(`x = 'a"…"plain note"`);
    expect(maskLiterals(`x = 'a"b' & "plain note"`, { tmdl: true })).toBe(`x = 'a"b' & "…"`);
  });

  it("hides a line comment whole, even when its quote is unpaired", () => {
    expect(maskLiterals('// old size 5" was a sample note, k = 1')).toBe("//…");
  });

  it("ends an M line comment at U+2028, as M's lexer does", () => {
    expect(maskLiterals(`1 // c\u2028 k = "${fake("key", "0202")}"`)).toBe('1 //…\u2028 k = "…"');
  });

  it("reads `--` in M as no comment", () => {
    expect(maskLiterals("a = b --1")).toBe("a = b --1");
  });

  it.each([
    [
      "a description keeps its words, its quoted text hidden",
      '\t/// A "quoted" description',
      '\t/// A "…" description',
    ],
    ["a description at the start of a line, kept", '/// A "quoted" one', '/// A "…" one'],
    ["`///` after spaces, read as a comment", '    /// old key "x" k', "    //…"],
    ["`///` after a tab and a space, read as a comment", "\t /// old key k", "\t //…"],
    ["a DAX `--` comment", `measure X = 1 -- key ${fake("key", "0205")}`, "measure X = 1 --…"],
    ["an empty DAX `--` comment, kept", "measure X = 1 --", "measure X = 1 --"],
    [
      "a line comment through U+2028 to the line's end, so a name after it hides nothing",
      `x = 1 // c\u2028 'n "${fake("key", "0206")}"'`,
      "x = 1 //…",
    ],
    [
      "a line comment through U+2028, then a literal the next reading opens",
      `x = 1 // c\u2028 k = "a\n${fake("key", "0207")}\nb"`,
      'x = 1 //…\n…\n…"',
    ],
  ])("in TMDL, %s", (_name, text, masked) => {
    expect(maskLiterals(text, { tmdl: true })).toBe(masked);
  });

  it("reads `///` in M as a line comment, its text hidden after `//`", () => {
    expect(maskLiterals('\t/// A "quoted" description')).toBe("\t//…");
  });
});

// The review of Task 4: a `///` line searched past its end for a quote, so 640,000 description
// lines took 32 s.
describe("masking stays linear (v3 spec, section 7, amended October 27, 2026)", () => {
  it.each([
    ["640,000 description lines", "\t/// d\n".repeat(640_000)],
    ["640,000 description lines and a quote at the end", `${"\t/// d\n".repeat(640_000)}"`],
    ["a line of 1,000,000 comments ended by U+2028", "//\u2028".repeat(1_000_000)],
    ["a line of 1,000,000 DAX comments after U+2028", "--\u2028".repeat(1_000_000)],
    ["1,000,000 lines of DAX comments", "x -- c\n".repeat(1_000_000)],
  ])("masks %s within 10 s", (_shape, text) => {
    const started = performance.now();
    maskLiterals(text, { tmdl: true });
    maskLiterals(text);
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});
