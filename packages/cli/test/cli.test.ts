import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

const repo = new URL("../../../", import.meta.url).pathname;
const sample = join(repo, "examples/messy-sales");

async function run(argv: string[], cwd = repo) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: () => cwd,
  });
  return { code, out, err };
}

describe("pbiplint CLI", () => {
  it("lints the sample project and exits 1 because it has errors", async () => {
    const r = await run([sample]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(
      /^pbiplint: 161 findings \(16 errors, 39 warnings, 106 info\) in 11 files/,
    );
    expect(r.out).toContain("https://pbiplint.com/rules/provide-format-string-for-measures");
    expect(r.err).toBe("");
  });
  it("--sample is the same as pointing at the bundled sample", async () => {
    const r = await run(["--sample", "--format", "json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).summary.findings).toBe(161);
  });
  it("respects --fail-on and exits 0 when nothing reaches the threshold", async () => {
    expect((await run([sample, "--fail-on", "none"])).code).toBe(0);
    expect((await run([join(repo, "tests/fixtures/kitchen-sink.SemanticModel")])).code).toBe(0);
    expect(
      (await run([join(repo, "tests/fixtures/kitchen-sink.SemanticModel"), "--fail-on", "info"]))
        .code,
    ).toBe(1);
  });
  it("writes every format, to stdout or to --output", async () => {
    for (const format of ["json", "sarif", "markdown"]) {
      const r = await run([sample, "--format", format]);
      expect(r.code).toBe(1);
      if (format === "markdown") expect(r.out.startsWith("# pbiplint report")).toBe(true);
      else expect(() => JSON.parse(r.out)).not.toThrow();
    }
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-out-"));
    const file = join(dir, "report.sarif");
    const r = await run([sample, "--format", "sarif", "--output", file]);
    expect(r.out).toBe("");
    expect(JSON.parse(readFileSync(file, "utf8")).version).toBe("2.1.0");
  });
  it("prefixes SARIF artifact URIs with the model root's path from the cwd", async () => {
    const r = await run([
      join(repo, "tests/fixtures/kitchen-sink.SemanticModel"),
      "--format",
      "sarif",
    ]);
    const results = JSON.parse(r.out).runs[0].results as {
      locations?: [{ physicalLocation: { artifactLocation: { uri: string } } }];
    }[];
    const uris = results.flatMap(
      (x) => x.locations?.map((l) => l.physicalLocation.artifactLocation.uri) ?? [],
    );
    expect(uris.length).toBeGreaterThan(0);
    for (const uri of uris)
      expect(uri.startsWith("tests/fixtures/kitchen-sink.SemanticModel/definition/")).toBe(true);
  });
  it("discovers pbiplint.config.json above the model and honors --config", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-cfg-"));
    const cfg = join(dir, "pbiplint.config.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        rules: {
          PROVIDE_FORMAT_STRING_FOR_MEASURES: "off",
          DAX_COLUMNS_FULLY_QUALIFIED: "warning",
        },
        failOn: "warning",
      }),
    );
    const r = await run([sample, "--config", cfg, "--format", "json"]);
    const json = JSON.parse(r.out);
    expect(json.summary.rulesSkipped).toContainEqual({
      id: "PROVIDE_FORMAT_STRING_FOR_MEASURES",
      reason: "disabled",
    });
    expect(
      json.groups.find((g: { rule: { id: string } }) => g.rule.id === "DAX_COLUMNS_FULLY_QUALIFIED")
        .rule.severity,
    ).toBe(2);
    expect(r.code).toBe(1);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, '{"rules": {"X": "loud"}}');
    const b = await run([sample, "--config", bad]);
    expect(b.code).toBe(2);
    expect(b.err).toMatch(/rules\["X"\]/);
  });
  it("rejects a config file that is not a JSON object", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-cfg-array-"));
    const cfg = join(dir, "array.json");
    writeFileSync(cfg, "[]");
    const r = await run([sample, "--config", cfg]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/must be a JSON object/);
  });
  it("lists rules", async () => {
    const r = await run(["rules"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/HIDE_FOREIGN_KEYS\s+ported\s+warning\s+Formatting\s+Hide foreign keys/);
    expect(r.out).toMatch(/SPLIT_DATE_AND_TIME\s+needs live model/);
    expect(r.out.trim().split("\n").length).toBeGreaterThanOrEqual(72);
  });
  it("prints help and version, and exits 2 on usage errors", async () => {
    expect((await run(["--help"])).out).toContain("Usage: pbiplint");
    expect((await run(["--version"])).out).toMatch(/^pbiplint \d+\.\d+\.\d+/);
    const bad = await run(["--format", "xml", sample]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("--format");
    const missing = await run([join(repo, "nope")]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("does not exist");
  });
});
