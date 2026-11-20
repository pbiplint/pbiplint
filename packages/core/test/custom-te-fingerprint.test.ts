// The fingerprint of a published rule version, and the data the fingerprint script generates from
// Microsoft's and Tabular Editor's published rule files (custom rules spec, section 4).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fingerprint, scopeKey } from "../src/custom-rules/te/fingerprint.js";
import { readTeRuleFile } from "../src/custom-rules/te/read.js";
import { UPSTREAM_RULES } from "../src/custom-rules/te/upstream-rules.data.js";
import { defaultRules } from "../src/rules/index.js";
import { repo } from "./custom-te-parity.js";

/** 64-bit FNV-1a over UTF-8 bytes, written plainly, to check the core's against. */
function reference(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(text)) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

describe("fingerprint", () => {
  it("is 64-bit FNV-1a, as 16 lowercase hex digits", () => {
    expect(fingerprint("")).toBe("cbf29ce484222325");
    expect(fingerprint("a")).toBe("af63dc4c8601ec8c");
    expect(fingerprint("foobar")).toBe("85944171f73967e8");
  });

  it("hashes the UTF-8 bytes, so a letter outside ASCII counts as its bytes", () => {
    for (const s of ["é", "Größe", "日付", "a😀b", 'Name.EndsWith("€")'])
      expect(fingerprint(s)).toBe(reference(s));
    expect(fingerprint("é")).not.toBe(fingerprint("e"));
  });

  it("ignores every character Tabular Editor's IsWhiteSpace calls whitespace", () => {
    const plain = 'Name.Contains("Total")andIsHidden';
    expect(fingerprint('Name.Contains("Total")\r\n\tand  IsHidden\u00a0\u2003\u0085\u000b')).toBe(
      fingerprint(plain),
    );
    expect(fingerprint(plain)).toBe(reference(plain));
    // A zero-width space is not whitespace to .NET, so it counts.
    expect(fingerprint("a\u200bb")).not.toBe(fingerprint("ab"));
  });
});

describe("scopeKey", () => {
  it("sorts the scopes as the reader spells them and joins them with commas", () => {
    expect(scopeKey(["Table", "Measure", "DataColumn"])).toBe("DataColumn,Measure,Table");
    expect(scopeKey(["Model"])).toBe("Model");
    expect(scopeKey([])).toBe("");
  });
});

describe("UPSTREAM_RULES", () => {
  const builtIn = new Set(defaultRules.map((r) => r.id));

  it("holds only ids pbiplint's built-in rules carry, as those rules spell them", () => {
    expect(UPSTREAM_RULES.length).toBeGreaterThan(0);
    for (const e of UPSTREAM_RULES) expect(builtIn, e.id).toContain(e.id);
  });

  it("holds an id, a scope key, a hash, and a severity per entry, and nothing else", () => {
    for (const e of UPSTREAM_RULES) {
      expect(Object.keys(e).sort()).toEqual(["hash", "id", "scope", "severity"]);
      expect(e.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(e.scope).toBe(scopeKey(e.scope.split(",")));
      expect(typeof e.severity).toBe("number");
    }
  });

  it("is sorted with no duplicates", () => {
    const keys = UPSTREAM_RULES.map((e) => [e.id, e.scope, e.hash, String(e.severity)].join("\0"));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
  });

  it("matches every rule of the vendored BPARules.json", () => {
    const read = readTeRuleFile(readFileSync(`${repo}tests/rules/microsoft/BPARules.json`, "utf8"));
    if ("error" in read) throw new Error(read.error);
    expect(read.rules).toHaveLength(71);
    for (const rule of read.rules) {
      const entry = UPSTREAM_RULES.find(
        (e) =>
          e.id === rule.id.toUpperCase() &&
          e.scope === scopeKey(rule.scopes) &&
          e.hash === fingerprint(rule.expression) &&
          e.severity === (rule.severity ?? 1),
      );
      expect(entry, rule.id).toBeDefined();
    }
  });
});
