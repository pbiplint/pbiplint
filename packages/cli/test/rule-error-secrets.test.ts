import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSecrets, leaks, SECRETS_FIXTURE } from "../../../tests/support/fake-secrets.js";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { main } from "../src/main.js";
import { serveMcp, type McpHandle } from "../src/mcp.js";

// The secret guard (v3 spec, section 11.3) on a rule that could not finish: every lint the CLI
// runs here adds PLANTED_LEAK, which throws with each query's M as its message and then with all
// of it, so every made-up credential in m-zoo is in a thrown message. No output may hold any part
// of one: not a format, the quiet text, a report written with --output, stderr, or the MCP server's
// lint tool, which runs the CLI.
vi.mock("@pbiplint/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@pbiplint/core")>();
  const { plantedLeakRule } = await import("../../../tests/support/planted-rule.js");
  return {
    ...core,
    lint: (files: Parameters<typeof core.lint>[0], options: Parameters<typeof core.lint>[1]) =>
      core.lint(files, { ...options, rules: [...core.defaultRules, plantedLeakRule()] }),
  };
});

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
