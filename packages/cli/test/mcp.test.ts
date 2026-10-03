import { cpSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { join } from "node:path";
import { defaultRules } from "@pbiplint/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { main } from "../src/main.js";
import { lintArgv, serveMcp, TOOL_ANNOTATIONS, type McpHandle } from "../src/mcp.js";

const repo = new URL("../../../", import.meta.url).pathname;
const sample = join(repo, "examples/messy-sales");

/** What `main` prints for argv, as the CLI would print it. */
async function cli(argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, {
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
    cwd: () => repo,
  });
  return { code, stdout, stderr };
}

interface Rpc {
  id?: number;
  result?: { content?: { type: string; text: string }[]; isError?: boolean; tools?: unknown[] };
  error?: unknown;
}

/** A client over the same newline-delimited JSON the stdio transport speaks. */
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

  notify(method: string): void {
    this.toServer.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  }

  async call(name: string, args: Record<string, unknown> = {}) {
    const m = await this.request("tools/call", { name, arguments: args });
    const text = (m.result?.content ?? []).map((c) => c.text).join("");
    return { isError: m.result?.isError === true, text };
  }
}

let handle: McpHandle | undefined;
afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

async function connect(): Promise<Client> {
  const client = new Client();
  handle = await serveMcp((argv) => cli(argv), {
    stdin: client.toServer,
    stdout: client.fromServer,
  });
  const init = await client.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });
  expect(init.error).toBeUndefined();
  client.notify("notifications/initialized");
  return client;
}

describe("lintArgv", () => {
  it("asks for the JSON document by default", () => {
    expect(lintArgv({ path: "/p" })).toEqual(["/p", "--format", "json"]);
  });

  it("asks for the quiet text with quiet, and passes rules and failOn", () => {
    expect(lintArgv({ path: "/p", quiet: true, rules: ["A", "B"], failOn: "warning" })).toEqual([
      "/p",
      "--quiet",
      "--rule",
      "A",
      "--rule",
      "B",
      "--fail-on",
      "warning",
    ]);
  });

  it("keeps a relative path a path, whatever it is named", () => {
    for (const name of ["-x", "rules", "explain", "mcp", "hook"])
      expect(lintArgv({ path: name })[0]).toBe(`./${name}`);
    expect(lintArgv({ path: "a/b" })[0]).toBe("./a/b");
    expect(lintArgv({ path: "/abs/rules" })[0]).toBe("/abs/rules");
  });
});

describe("pbiplint mcp", () => {
  it("lists three read-only tools", async () => {
    const client = await connect();
    const list = await client.request("tools/list");
    const tools = list.result!.tools as { name: string; annotations: unknown }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["explain_rule", "lint", "list_rules"]);
    for (const t of tools) expect(t.annotations).toEqual(TOOL_ANNOTATIONS);
    expect(TOOL_ANNOTATIONS).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });

  it("lints a project to the JSON --format json writes", async () => {
    const client = await connect();
    const got = await client.call("lint", { path: sample });
    expect(got.isError).toBe(false);
    const expected = await cli([sample, "--format", "json"]);
    expect(expected.code).toBe(1);
    expect(JSON.parse(got.text)).toEqual(JSON.parse(expected.stdout));
  });

  it("lints with quiet and rules to the quiet text", async () => {
    const client = await connect();
    const got = await client.call("lint", {
      path: sample,
      quiet: true,
      rules: ["ENSURE_ALTTEXT"],
    });
    const expected = await cli([sample, "--quiet", "--rule", "ENSURE_ALTTEXT"]);
    expect(got).toEqual({ isError: false, text: expected.stdout });
  });

  it("returns the CLI's message as an error for a path it cannot read", async () => {
    const client = await connect();
    const got = await client.call("lint", { path: join(repo, "no-such-folder") });
    expect(got.isError).toBe(true);
    expect(got.text).toContain("does not exist");
  });

  it("explains a rule as explain --format json does", async () => {
    const client = await connect();
    const got = await client.call("explain_rule", { ruleId: "ENSURE_ALTTEXT" });
    const expected = await cli(["explain", "ENSURE_ALTTEXT", "--format", "json"]);
    expect(got).toEqual({ isError: false, text: expected.stdout });
  });

  it("names the nearest rules for a rule id it does not know", async () => {
    const client = await connect();
    const got = await client.call("explain_rule", { ruleId: "ENSURE_ALTTXT" });
    expect(got.isError).toBe(true);
    expect(got.text).toContain("ENSURE_ALTTEXT");
  });

  it("lists every rule with the fields pbiplint rules prints", async () => {
    const client = await connect();
    const got = await client.call("list_rules");
    const rules = JSON.parse(got.text) as { id: string; severity: string }[];
    expect(rules.map((r) => r.id)).toEqual(defaultRules.map((r) => r.id));
    expect(Object.keys(rules[0]!).sort()).toEqual(
      ["category", "id", "layer", "name", "severity", "status"].sort(),
    );
    expect(new Set(rules.map((r) => r.severity))).toEqual(new Set(["error", "warning", "info"]));
  });

  it("writes nothing to its stdout but protocol messages", async () => {
    const stray = vi.spyOn(process.stdout, "write");
    const client = await connect();
    await client.call("lint", { path: sample });
    await client.call("lint", { path: join(repo, "no-such-folder") });
    for (const line of client.lines) expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
    // Nothing reached the process's own stdout, which an app reads as the protocol.
    expect(stray).not.toHaveBeenCalled();
    stray.mockRestore();
  });

  it("follows the answer with what the CLI wrote to stderr", async () => {
    const project = join(tempDir("mcp-stderr"), "p");
    cpSync(sample, project, { recursive: true });
    writeFileSync(
      join(project, "pbiplint.config.json"),
      JSON.stringify({ rules: { NO_SUCH_RULE: "off" } }),
    );
    const client = await connect();
    const got = await client.call("lint", { path: project, quiet: true });
    expect(got.isError).toBe(false);
    expect(got.text).toContain('no rule named "NO_SUCH_RULE"');
  });
});
