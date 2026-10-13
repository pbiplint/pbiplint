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
      'x = 1 /* 5" */, k = "…"',
    ],
    ["quoted text in a line comment", `// old key "${fake("key", "0105")}"`, '// old key "…"'],
    [
      "a literal over two lines",
      `a = "${fake("key", "0106").replace("key-", "key-\n")}", b = "x"`,
      'a = "…\n…", b = "…"',
    ],
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

  it("leaves a value in a line comment showing when its quote is unpaired (a stated limit)", () => {
    expect(maskLiterals('// old size 5" was a sample note, k = 1')).toBe(
      '// old size 5" was a sample note, k = 1',
    );
  });
});
