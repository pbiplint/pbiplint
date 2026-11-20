// The fingerprint of a published rule version, and the data the fingerprint script generates from
// Microsoft's and Tabular Editor's published rule files (custom rules spec, section 4).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCustomRules } from "../src/custom-rules/rules.js";
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

  it("hashes a lone surrogate as U+FFFD, as Node's Buffer and TextEncoder write it", () => {
    for (const s of ["\ud83d", "a\ud83db", "\ude00x", 'Name.Contains("\ud83d")'])
      expect(fingerprint(s), JSON.stringify(s)).toBe(reference(s));
    expect(fingerprint("\ud800")).toBe(reference("\ufffd"));
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

  it("keeps whitespace inside a string literal, where it is part of what the rule checks", () => {
    expect(fingerprint('Name.EndsWith(" Flag")')).not.toBe(fingerprint('Name.EndsWith("Flag")'));
    expect(fingerprint('Name.Contains(" ")')).not.toBe(fingerprint('Name.Contains("")'));
    expect(fingerprint('Name == "a\tb"')).not.toBe(fingerprint('Name == "a b"'));
    // Outside a literal, whitespace is still dropped.
    expect(fingerprint('Name.EndsWith( " Flag" )\r\n\tand  IsHidden')).toBe(
      reference('Name.EndsWith(" Flag")andIsHidden'),
    );
    // A doubled quote is a quote inside the literal, which goes on past it.
    expect(fingerprint('Name  ==  "a "" b"  and  x')).toBe(reference('Name=="a "" b"andx'));
    expect(fingerprint('Name == "a "" b"')).not.toBe(fingerprint('Name == "a""b"'));
    // An unclosed literal runs to the end.
    expect(fingerprint('Name == " a')).toBe(reference('Name==" a'));
  });
});

describe("a copy's class, with whitespace in a string literal", () => {
  const upstream = [
    { id: "TEAM_A", scope: "Measure", hash: fingerprint('Name.EndsWith(" Flag")'), severity: 2 },
    { id: "TEAM_B", scope: "Measure", hash: fingerprint('Name.Contains(" ")'), severity: 2 },
  ];
  const classOf = (id: string, expression: string) =>
    readCustomRules(
      [
        {
          path: "rules/team.json",
          text: JSON.stringify([
            { ID: id, Name: id, Scope: "Measure", Severity: 2, Expression: expression },
          ]),
        },
      ],
      upstream,
    ).rules[0]!.custom?.upstream;

  it("counts an edit inside a literal as edited, and reflowed whitespace outside one as unchanged", () => {
    expect(classOf("TEAM_A", 'Name.EndsWith("Flag")')).toBe("edited");
    expect(classOf("TEAM_A", 'Name.EndsWith("  Flag")')).toBe("edited");
    expect(classOf("TEAM_B", 'Name.Contains("")')).toBe("edited");
    expect(classOf("TEAM_A", 'Name.EndsWith(" Flag")')).toBe("unchanged");
    expect(classOf("TEAM_A", 'Name\n  .EndsWith(\n    " Flag"\n  )')).toBe("unchanged");
    expect(classOf("TEAM_B", '\tName.Contains( " " )')).toBe("unchanged");
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
