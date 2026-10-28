import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fakeSecrets,
  leaks,
  PARSE_SECRETS_FIXTURE,
  SECRETS_FIXTURE,
} from "../../../tests/support/fake-secrets.js";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { main } from "../src/main.js";

// The secret guard (v3 spec, section 11.3) on the CLI: every format, the quiet text, a report
// written with --output, and stderr, for a lint of m-zoo. The MCP server's lint tool is held to it
// in mcp.test.ts, where its client lives.
const secrets = fakeSecrets();

async function run(argv: string[]) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: () => process.cwd(),
  });
  return { code, out, err };
}

describe("the secret guard, in the CLI (v3 spec, section 11.3)", () => {
  it.each(["text", "json", "markdown", "sarif"])(
    "keeps every part of every value out of --format %s and stderr",
    async (format) => {
      const r = await run([SECRETS_FIXTURE, "--format", format]);
      expect(r.code).toBe(1);
      expect(r.out).toContain("HARDCODED_SECRET_IN_QUERY");
      expect(leaks(r.out, secrets)).toEqual([]);
      expect(leaks(r.err, secrets)).toEqual([]);
    },
  );
  it("keeps every part of every value out of the quiet text", async () => {
    const r = await run([SECRETS_FIXTURE, "--quiet"]);
    expect(r.out).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(r.out + r.err, secrets)).toEqual([]);
  });
  it("keeps every part of every value out of a report written with --output", async () => {
    const file = join(tempDir("secret-output"), "report.sarif");
    const r = await run([SECRETS_FIXTURE, "--format", "sarif", "--output", file]);
    const written = readFileSync(file, "utf8");
    expect(written).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(written + r.out + r.err, secrets)).toEqual([]);
  });
});

describe("the secret guard, on lines PARSE_ISSUE quotes, in the CLI (v3 spec, sections 7 and 11.3)", () => {
  const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
  it.each(["text", "json", "markdown", "sarif"])(
    "keeps every part of every value out of --format %s and stderr",
    async (format) => {
      expect(planted).toHaveLength(4);
      const r = await run([PARSE_SECRETS_FIXTURE, "--format", format]);
      expect(r.code).toBe(1);
      expect(r.out).toContain("PARSE_ISSUE");
      expect(leaks(r.out + r.err, planted)).toEqual([]);
    },
  );
  it("keeps every part of every value out of the quiet text and a report written with --output", async () => {
    const quiet = await run([PARSE_SECRETS_FIXTURE, "--quiet"]);
    expect(quiet.out).toContain("PARSE_ISSUE");
    const file = join(tempDir("parse-secret-output"), "report.sarif");
    const r = await run([PARSE_SECRETS_FIXTURE, "--format", "sarif", "--output", file]);
    const written = readFileSync(file, "utf8");
    expect(written).toContain("PARSE_ISSUE");
    expect(leaks(quiet.out + quiet.err + written + r.out + r.err, planted)).toEqual([]);
  });
});
