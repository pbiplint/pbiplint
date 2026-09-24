import { describe, expect, it } from "vitest";
import {
  lineOfPointer,
  newerMajor,
  newerThan,
  readJson,
  schemaFamilyOf,
  schemaVersionOf,
} from "../src/pbir/json.js";

const doc = [
  "{",
  '  "name": "v1",',
  '  "position": {',
  '    "x": 1,',
  '    "height": 20',
  "  },",
  '  "items": [',
  '    "a",',
  '    { "k": "b" }',
  "  ]",
  "}",
].join("\n");

describe("readJson", () => {
  it("parses a document, drops a BOM, and reads the schema family and version", () => {
    const r = readJson(
      "definition/report.json",
      '﻿{"$schema":"https://x/report/definition/report/3.2.0/schema.json","a":1}',
    );
    expect(r.issues).toEqual([]);
    expect(r.json).toEqual({
      $schema: "https://x/report/definition/report/3.2.0/schema.json",
      a: 1,
    });
    expect(r.schema).toBe("https://x/report/definition/report/3.2.0/schema.json");
    expect(r.schemaVersion).toBe("3.2.0");
    expect(schemaFamilyOf(r.schema)).toBe("report");
    expect(schemaVersionOf(undefined)).toBeUndefined();
  });
  it("reports every merge conflict marker with its line and reads nothing else from the file", () => {
    const text = '{\n  "a": 1,\n<<<<<<< HEAD\n  "b": 2,\n=======\n  "b": 3,\n>>>>>>> theirs\n}\n';
    const r = readJson("definition/pages/p/page.json", text);
    expect(r.json).toBeUndefined();
    expect(r.issues.map((i) => [i.line, i.reason])).toEqual([
      [3, "merge conflict marker"],
      [5, "merge conflict marker"],
      [7, "merge conflict marker"],
    ]);
    expect(r.issues[0]!.file).toBe("definition/pages/p/page.json");
  });
  it("reports invalid JSON with the line the parser stopped on", () => {
    const r = readJson("x.json", '{\n  "a": 1,\n  "b": }\n');
    expect(r.json).toBeUndefined();
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.reason).toMatch(/^not valid JSON/);
    expect(r.issues[0]!.line).toBe(3);
  });
  it("reports a document that is not a JSON object, saying what the file holds", () => {
    // Microsoft's schema gives every report file an object root, so nothing else is read from one.
    const kinds: [string, string][] = [
      ["[]", "an array"],
      ['"Sales overview"', "a string"],
      ["720", "a number"],
      ["true", "a boolean"],
      ["false", "a boolean"],
      ["null", "null"],
    ];
    for (const [text, kind] of kinds) {
      const r = readJson("definition/report.json", text);
      expect(r.json).toBeUndefined();
      expect(r.schema).toBeUndefined();
      expect(r.issues).toEqual([
        {
          file: "definition/report.json",
          line: 1,
          text,
          reason: `not a JSON object (the file holds ${kind})`,
        },
      ]);
    }
  });
  it("gives the line a document that is not an object starts on, past blank lines and a BOM", () => {
    expect(readJson("x.json", '\n[\n  "a"\n]\n').issues).toEqual([
      { file: "x.json", line: 2, text: "[", reason: "not a JSON object (the file holds an array)" },
    ]);
    expect(readJson("x.json", "\ufeff  \r\n\t null\r\n").issues).toEqual([
      {
        file: "x.json",
        line: 2,
        text: "\t null",
        reason: "not a JSON object (the file holds null)",
      },
    ]);
  });
  it("still reads an object with no issue, wherever it starts", () => {
    const r = readJson("x.json", '\ufeff\n\n  { "a": 1 }\n');
    expect(r.issues).toEqual([]);
    expect(r.json).toEqual({ a: 1 });
  });
  it("does not read the document's own text as the engine's line or offset", () => {
    // V8 quotes a slice of the broken document in its message, so a document that says "line 5"
    // or "position 400" of its own is quoted back and must not be mistaken for the engine saying
    // where it stopped.
    const named = readJson("x.json", '{\n  "a": 1,\n  "b": line 5\n}');
    expect(named.issues[0]!.line).toBe(3);
    expect(named.issues[0]!.text).toBe('  "b": line 5');
    const offset = readJson("x.json", '{\n  "a": 1,\n  "b": position 400\n}');
    expect(offset.issues[0]!.line).toBe(3);
    expect(offset.issues[0]!.text).toBe('  "b": position 400');
  });
});

describe("newerThan", () => {
  it("compares numeric segments", () => {
    expect(newerThan("3.3.0", "3.2.0")).toBe(true);
    expect(newerThan("2.10.0", "2.9.0")).toBe(true);
    expect(newerThan("3.2.0", "3.2.0")).toBe(false);
    expect(newerThan("1.0.0", "3.2.0")).toBe(false);
  });
});

describe("newerMajor", () => {
  it("is true only when the first segment is greater, compared as a number", () => {
    expect(newerMajor("2.9.0", "2.9.0")).toBe(false);
    expect(newerMajor("2.12.0", "2.9.0")).toBe(false);
    expect(newerMajor("2.9.1", "2.9.0")).toBe(false);
    expect(newerMajor("3.0.0", "2.9.0")).toBe(true);
    expect(newerMajor("10.0.0", "9.1.0")).toBe(true);
    expect(newerMajor("1.4.0", "2.1.0")).toBe(false);
  });
  it("reads only the major segment when the others are missing", () => {
    expect(newerMajor("3", "2.9.0")).toBe(true);
    expect(newerMajor("2", "2.9.0")).toBe(false);
    expect(newerMajor("2.12", "2")).toBe(false);
  });
});

describe("lineOfPointer", () => {
  it("gives the line of an object member's key and of an array element's value", () => {
    expect(lineOfPointer(doc, "/position/height")).toBe(5);
    expect(lineOfPointer(doc, "/position")).toBe(3);
    expect(lineOfPointer(doc, "/items/0")).toBe(8);
    expect(lineOfPointer(doc, "/items/1/k")).toBe(9);
  });
  it("is 1 for the root, a missing pointer, and a key that only appears inside a string", () => {
    expect(lineOfPointer(doc, "")).toBe(1);
    expect(lineOfPointer(doc, "/nope")).toBe(1);
    expect(lineOfPointer('{\n  "a": "\\"height\\": 1",\n  "height": 2\n}', "/height")).toBe(3);
  });
  it("unescapes ~1 and ~0 in a pointer segment", () => {
    expect(lineOfPointer('{\n  "a/b": 1,\n  "c~d": 2\n}', "/a~1b")).toBe(2);
    expect(lineOfPointer('{\n  "a/b": 1,\n  "c~d": 2\n}', "/c~0d")).toBe(3);
  });
  it("always moves forward, whatever sits between the tokens", () => {
    // Neither is JSON whitespace, but a regex `\s` matches both, which once stalled the scalar skip.
    expect(lineOfPointer('{\n  "a":\u00a0 1,\n  "b": 2\n}', "/b")).toBe(3);
    expect(lineOfPointer('{\n  "a": [\u2028 1, 2],\n  "b": 3\n}', "/b")).toBe(3);
  });
  it("reads past a BOM, which the finding factories' file text keeps", () => {
    expect(lineOfPointer(`\ufeff${doc}`, "/position/height")).toBe(5);
    expect(
      lineOfPointer('\ufeff{\n  "pageOrder": [],\n  "activePageName": "p"\n}', "/activePageName"),
    ).toBe(3);
  });
});
