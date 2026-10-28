import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fakeSecrets,
  leaks,
  PARSE_SECRETS_FIXTURE,
  SECRETS_FIXTURE,
} from "../../../tests/support/fake-secrets.js";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { main } from "../src/main.js";
import { serveMcp, type McpHandle } from "../src/mcp.js";

// The secret guard (v3 spec, section 11.3) on a rule that could not finish: every lint the CLI
// runs here adds PLANTED_LEAK, which throws with each query's M as its message and then with all
// of it, so every made-up credential in m-zoo is in a thrown message. No output may hold any part
// of one: not a format, the quiet text, a report written with --output, stderr, or the MCP server's
// lint tool, which runs the CLI. PLANTED_LEAK is in the rule list too, so --rule and
// pbiplint.config.json can name it as they name any rule.
vi.mock("@pbiplint/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@pbiplint/core")>();
  const { plantedLeakRule } = await import("../../../tests/support/planted-rule.js");
  const rules = [...core.defaultRules, plantedLeakRule()];
  return {
    ...core,
    defaultRules: rules,
    lint: (files: Parameters<typeof core.lint>[0], options: Parameters<typeof core.lint>[1]) =>
      core.lint(files, { ...options, rules }),
  };
});

/**
 * The smallest fixture with M queries and no error finding of its own, so only the failure gates:
 * PLANTED_LEAK fails on its two partitions' queries and then on the model.
 */
const CLEAN_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/untyped-columns.SemanticModel",
);

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

describe("the secret guard, on a rule that could not finish, in the CLI (v3 spec, section 11.3)", () => {
  it.each(["text", "json", "markdown", "sarif"])(
    "keeps every part of every value out of --format %s and stderr",
    async (format) => {
      const r = await run([SECRETS_FIXTURE, "--format", format]);
      // Markdown escapes the underscore.
      expect(r.out).toMatch(/PLANTED\\?_LEAK/);
      expect(leaks(r.out + r.err, secrets)).toEqual([]);
    },
  );
  it("keeps every part of every value out of the quiet text", async () => {
    const r = await run([SECRETS_FIXTURE, "--quiet"]);
    expect(leaks(r.out + r.err, secrets)).toEqual([]);
  });
  it("keeps every part of every value out of a report written with --output", async () => {
    const file = join(tempDir("rule-error-output"), "report.sarif");
    const r = await run([SECRETS_FIXTURE, "--format", "sarif", "--output", file]);
    const written = readFileSync(file, "utf8");
    expect(written).toContain("PLANTED_LEAK");
    expect(leaks(written + r.out + r.err, secrets)).toEqual([]);
  });
});

interface Group {
  rule: { id: string; severity: number };
  findings: { detail?: string }[];
}
const group = (out: string, id: string): Group | undefined =>
  (JSON.parse(out) as { groups: Group[] }).groups.find((g) => g.rule.id === id);

/** A pbiplint.config.json in a folder of its own, passed with --config. */
function config(name: string, rules: Record<string, string>): string {
  const file = join(tempDir(name), "pbiplint.config.json");
  writeFileSync(file, JSON.stringify({ rules }));
  return file;
}

describe("the gate on a rule that could not finish, in the CLI", () => {
  it("exits 1 at the default fail-on, with the finding an error", async () => {
    const r = await run([CLEAN_FIXTURE, "--format", "json"]);
    expect(r.code).toBe(1);
    const g = group(r.out, "RULE_COULD_NOT_FINISH");
    expect(g?.rule.severity).toBe(3);
    expect(g?.findings[0]?.detail).toMatch(/^PLANTED_LEAK could not finish on /);
    // Nothing else on the fixture is an error, so the failure alone fails the run.
    expect(
      (JSON.parse(r.out) as { groups: Group[] }).groups
        .filter((x) => x.rule.severity === 3)
        .map((x) => x.rule.id),
    ).toEqual(["RULE_COULD_NOT_FINISH"]);
  });
  it.each(["text", "markdown", "sarif"])("shows the finding in --format %s", async (format) => {
    const r = await run([CLEAN_FIXTURE, "--format", format]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/RULE\\?_COULD\\?_NOT\\?_FINISH/);
  });
  it("passes when pbiplint.config.json lowers it to a warning", async () => {
    const cfg = config("lowered", { RULE_COULD_NOT_FINISH: "warning" });
    const r = await run([CLEAN_FIXTURE, "--format", "json", "--config", cfg]);
    expect(r.code).toBe(0);
    expect(group(r.out, "RULE_COULD_NOT_FINISH")?.rule.severity).toBe(2);
  });
  it("passes when pbiplint.config.json turns the failing rule off", async () => {
    const cfg = config("off", { PLANTED_LEAK: "off" });
    const r = await run([CLEAN_FIXTURE, "--format", "json", "--config", cfg]);
    expect(r.code).toBe(0);
    expect(group(r.out, "RULE_COULD_NOT_FINISH")).toBeUndefined();
    expect(r.err).not.toContain("could not finish");
    expect(r.err).not.toContain("failed");
  });
  it.each(["RULE_COULD_NOT_FINISH", "PLANTED_LEAK"])(
    "passes when pbiplint.ignore names %s on every object a finding names",
    async (id) => {
      // Each query's finding names its partition, and the throw out of check names the model.
      const copy = join(tempDir("ignored"), "untyped-columns.SemanticModel");
      cpSync(CLEAN_FIXTURE, copy, { recursive: true });
      const definition = join(copy, "definition");
      const annotate = (file: string, after: string, line: string): void => {
        const text = readFileSync(file, "utf8");
        expect(text).toContain(after);
        writeFileSync(file, text.replace(after, `${after}${line}`));
      };
      for (const table of ["Orders", "Targets"])
        annotate(
          join(definition, "tables", `${table}.tmdl`),
          "\t\tmode: import\n",
          `\t\tannotation pbiplint.ignore = ${id}\n`,
        );
      annotate(
        join(definition, "model.tmdl"),
        'annotation PBI_QueryOrder = ["Orders","Targets"]\n',
        `\nannotation pbiplint.ignore = ${id}\n`,
      );
      const before = await run([CLEAN_FIXTURE, "--format", "json"]);
      const r = await run([copy, "--format", "json"]);
      expect(r.code).toBe(0);
      expect(group(r.out, "RULE_COULD_NOT_FINISH")).toBeUndefined();
      // Each finding the plain run had, one per partition and one on the model, was ignored.
      expect(group(before.out, "RULE_COULD_NOT_FINISH")?.findings.length).toBe(3);
      expect((JSON.parse(r.out) as { summary: { ignored: number } }).summary.ignored).toBe(3);
      // Nothing goes quiet: the rule's failure is still on stderr.
      expect(r.err).toContain("rule PLANTED_LEAK failed");
    },
  );
  it("says executionSuccessful false in SARIF", async () => {
    const r = await run([CLEAN_FIXTURE, "--format", "sarif"]);
    const sarif = JSON.parse(r.out) as {
      runs: { invocations: { executionSuccessful: boolean }[] }[];
    };
    expect(sarif.runs[0]!.invocations[0]!.executionSuccessful).toBe(false);
  });
  it("shows and gates the finding under --rule naming the failing rule", async () => {
    const r = await run([CLEAN_FIXTURE, "--format", "json", "--rule", "PLANTED_LEAK"]);
    expect(r.code).toBe(1);
    expect(group(r.out, "RULE_COULD_NOT_FINISH")?.findings.length).toBeGreaterThan(0);
  });
  it("leaves the finding out under --rule naming another rule, and passes", async () => {
    const r = await run([CLEAN_FIXTURE, "--format", "json", "--rule", "LOCAL_DRIVE_PATH"]);
    expect(r.code).toBe(0);
    expect(group(r.out, "RULE_COULD_NOT_FINISH")).toBeUndefined();
    // The run still says a rule could not finish.
    const text = await run([CLEAN_FIXTURE, "--rule", "LOCAL_DRIVE_PATH"]);
    expect(text.out + text.err).toContain("1 rule could not finish");
  });
  it("leaves PARSE_ISSUE out under --rule naming the failing rule, as today", async () => {
    const all = await run([PARSE_SECRETS_FIXTURE, "--format", "json"]);
    expect(group(all.out, "PARSE_ISSUE")).toBeDefined();
    const r = await run([PARSE_SECRETS_FIXTURE, "--format", "json", "--rule", "PLANTED_LEAK"]);
    expect(group(r.out, "PARSE_ISSUE")).toBeUndefined();
    expect(group(r.out, "RULE_COULD_NOT_FINISH")).toBeDefined();
  });
});

interface Rpc {
  id?: number;
  result?: { content?: { text: string }[] };
  error?: unknown;
}

/** A client over the newline-delimited JSON the stdio transport speaks, as in mcp.test.ts. */
class Client {
  readonly toServer = new PassThrough();
  readonly fromServer = new PassThrough();
  readonly lines: string[] = [];
  #next = 1;
  #waiting = new Map<number, (m: Rpc) => void>();
  #buffer = "";

  constructor() {
    this.fromServer.on("data", (chunk: Buffer) => {
      this.#buffer += chunk.toString("utf8");
      let nl;
      while ((nl = this.#buffer.indexOf("\n")) >= 0) {
        const line = this.#buffer.slice(0, nl);
        this.#buffer = this.#buffer.slice(nl + 1);
        this.lines.push(line);
        const m = JSON.parse(line) as Rpc;
        if (m.id !== undefined) this.#waiting.get(m.id)?.(m);
      }
    });
  }

  request(method: string, params: unknown = {}): Promise<Rpc> {
    const id = this.#next++;
    const reply = new Promise<Rpc>((res) => this.#waiting.set(id, res));
    this.toServer.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return reply;
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    const m = await this.request("tools/call", { name, arguments: args });
    return (m.result?.content ?? []).map((c) => c.text).join("");
  }
}

let handle: McpHandle | undefined;
afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

describe("the secret guard, on a rule that could not finish, in the MCP lint tool (v3 spec, section 11.3)", () => {
  it("keeps every part of every value out of the lint tool's answers", async () => {
    const client = new Client();
    handle = await serveMcp(
      (argv) => run(argv).then((r) => ({ code: r.code, stdout: r.out, stderr: r.err })),
      {
        stdin: client.toServer,
        stdout: client.fromServer,
      },
    );
    const init = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(init.error).toBeUndefined();
    client.toServer.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
    const json = await client.call("lint", { path: SECRETS_FIXTURE });
    const quiet = await client.call("lint", { path: SECRETS_FIXTURE, quiet: true });
    expect(json).toContain("PLANTED_LEAK");
    expect(leaks(json + quiet + client.lines.join("\n"), secrets)).toEqual([]);
  });
});
