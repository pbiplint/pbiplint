import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { join, relative } from "node:path";
import { defaultRules, SEVERITY_LABEL } from "@pbiplint/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fakeSecrets,
  leaks,
  PARSE_SECRETS_FIXTURE,
  SECRETS_FIXTURE,
} from "../../../tests/support/fake-secrets.js";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { main } from "../src/main.js";
import { configStart, lintArgv, serveMcp, TOOL_ANNOTATIONS, type McpHandle } from "../src/mcp.js";

const repo = new URL("../../../", import.meta.url).pathname;
const sample = join(repo, "examples/messy-sales");

/**
 * A config naming two custom rule files (#118) and the model it is for: see contract.test.ts for
 * what each rule in them is.
 */
const customFixture = join(repo, "packages/cli/test/fixtures/custom-rules");
const customModel = join(repo, "tests/fixtures/custom-rules.SemanticModel");

/** A temp copy of the custom rules fixture: the config and its rules beside the model. */
function customProject(): { root: string; config: string; model: string } {
  const root = tempDir("mcp-custom");
  cpSync(customFixture, root, { recursive: true });
  const model = join(root, "custom-rules.SemanticModel");
  cpSync(customModel, model, { recursive: true });
  return { root, config: join(root, "pbiplint.config.json"), model };
}

/** What list_rules gave before it took a path, byte for byte. */
const builtInList = (): string =>
  JSON.stringify(
    defaultRules.map((r) => ({
      id: r.id,
      name: r.name,
      layer: r.layer,
      status: r.status,
      severity: SEVERITY_LABEL[r.severity],
      category: r.category,
    })),
    null,
    2,
  ) + "\n";

/** What `main` prints for argv, as the CLI would print it. */
async function cli(argv: string[], cwd = repo) {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, {
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
    cwd: () => cwd,
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

/** The instructions the server gave in its answer to the last connect's initialize. */
let instructions: string | undefined;

/** A server whose folder is `cwd`, as an app that started it there gives it. */
async function connect(cwd = repo): Promise<Client> {
  const client = new Client();
  handle = await serveMcp(
    (argv, at) => cli(argv, at ?? cwd),
    { stdin: client.toServer, stdout: client.fromServer },
    "0.0.0-dev",
    cwd,
  );
  const init = await client.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });
  expect(init.error).toBeUndefined();
  instructions = (init.result as { instructions?: string }).instructions;
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
  it("lists four read-only tools", async () => {
    const client = await connect();
    const list = await client.request("tools/list");
    const tools = list.result!.tools as { name: string; annotations: unknown }[];
    expect(tools.map((t) => t.name).sort()).toEqual([
      "custom_rules_reference",
      "explain_rule",
      "lint",
      "list_rules",
    ]);
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

  it("keeps every part of m-zoo's made-up credentials out of the lint tool's answers (v3 spec, section 11.3)", async () => {
    const secrets = fakeSecrets();
    expect(secrets.length).toBeGreaterThanOrEqual(6);
    const client = await connect();
    const json = await client.call("lint", { path: SECRETS_FIXTURE });
    const quiet = await client.call("lint", { path: SECRETS_FIXTURE, quiet: true });
    expect(json.text).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(quiet.text).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(json.text + quiet.text + client.lines.join("\n"), secrets)).toEqual([]);
  });

  it("keeps every part of the made-up values on lines PARSE_ISSUE quotes out of the lint tool's answers (v3 spec, sections 7 and 11.3)", async () => {
    const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
    expect(planted).toHaveLength(4);
    const client = await connect();
    const json = await client.call("lint", { path: PARSE_SECRETS_FIXTURE });
    const quiet = await client.call("lint", { path: PARSE_SECRETS_FIXTURE, quiet: true });
    expect(json.text).toContain("PARSE_ISSUE");
    expect(quiet.text).toContain("PARSE_ISSUE");
    expect(leaks(json.text + quiet.text + client.lines.join("\n"), planted)).toEqual([]);
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
    const pq = (JSON.parse(got.text) as { id: string; layer: string }[]).find(
      (r) => r.id === "MINIMIZE_POWER_QUERY_TRANSFORMATIONS",
    );
    expect(pq?.layer).toBe("powerquery");
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

  it("lints every project in a folder that holds several, as the CLI does (#237)", async () => {
    const root = tempDir("mcp-several");
    for (const name of ["Finance", "Sales", "Stock"])
      cpSync(sample, join(root, name), { recursive: true });
    const client = await connect();
    const json = await client.call("lint", { path: root });
    expect(json.isError).toBe(false);
    const doc = JSON.parse(json.text) as { version: number; projects: { path: string }[] };
    expect(doc.version).toBe(2);
    expect(doc.projects.map((p) => p.path)).toEqual(["Finance", "Sales", "Stock"]);
    expect(doc).toEqual(JSON.parse((await cli([root, "--format", "json"])).stdout));
    const quiet = await client.call("lint", { path: root, quiet: true });
    expect(quiet.text).toBe((await cli([root, "--quiet"])).stdout);
    expect(quiet.text).toMatch(/^project Sales: /m);
  });

  it("says, in the lint tool's description and the server's instructions, that a folder of several projects lints whole (#237)", async () => {
    const client = await connect();
    const list = await client.request("tools/list");
    const lint = (list.result!.tools as { name: string; description: string }[]).find(
      (t) => t.name === "lint",
    )!;
    for (const words of [lint.description, instructions ?? ""]) {
      expect(words).toContain("several projects");
      expect(words).toContain("version 2");
      expect(words).toContain("`project `");
    }
  });
});

describe("configStart", () => {
  it("is the folder a path names, or a file's folder, a relative path taken from the server's folder", () => {
    const { root, model } = customProject();
    expect(configStart(model, "/elsewhere")).toBe(model);
    expect(configStart(join(model, "definition", "model.tmdl"), "/elsewhere")).toBe(
      join(model, "definition"),
    );
    expect(configStart("custom-rules.SemanticModel", root)).toBe(model);
  });

  it("refuses a path that is not there with the CLI's message", () => {
    expect(() => configStart("nope", repo)).toThrow("nope does not exist");
  });
});

describe("pbiplint mcp and custom rules (#118)", () => {
  it("returns what pbiplint reference prints, as text or JSON", async () => {
    const client = await connect();
    const text = (await cli(["reference"])).stdout;
    const json = (await cli(["reference", "--format", "json"])).stdout;
    expect(await client.call("custom_rules_reference")).toEqual({ isError: false, text });
    expect(await client.call("custom_rules_reference", { format: "text" })).toEqual({
      isError: false,
      text,
    });
    expect(await client.call("custom_rules_reference", { format: "json" })).toEqual({
      isError: false,
      text: json,
    });
    expect(JSON.parse(json).formats.tabularEditor.scopes.length).toBeGreaterThan(0);
  });

  it("describes custom_rules_reference, and the path explain_rule and list_rules take", async () => {
    const client = await connect();
    const tools = (await client.request("tools/list")).result!.tools as {
      name: string;
      description: string;
      inputSchema: { properties: Record<string, unknown>; required?: string[] };
    }[];
    const tool = (name: string) => tools.find((t) => t.name === name)!;
    expect(tool("custom_rules_reference").description).toBe(
      "What a custom rule can use at the installed version: scopes, properties, functions, regular expressions, limits, and what pbiplint does not run, with the reason.",
    );
    expect(Object.keys(tool("explain_rule").inputSchema.properties).sort()).toEqual([
      "path",
      "ruleId",
    ]);
    expect(tool("explain_rule").inputSchema.required).toEqual(["ruleId"]);
    expect(Object.keys(tool("list_rules").inputSchema.properties)).toEqual(["path"]);
    expect(tool("list_rules").inputSchema.required ?? []).toEqual([]);
    expect(instructions).toContain("custom_rules_reference");
    expect(instructions).toContain("path");
  });

  it("answers explain_rule and list_rules without a path byte for byte as before, even from a folder whose config names custom rules", async () => {
    const { root } = customProject();
    for (const cwd of [repo, root]) {
      const client = await connect(cwd);
      expect(await client.call("list_rules")).toEqual({ isError: false, text: builtInList() });
      expect(await client.call("explain_rule", { ruleId: "ENSURE_ALTTEXT" })).toEqual({
        isError: false,
        text: (await cli(["explain", "ENSURE_ALTTEXT", "--format", "json"], cwd)).stdout,
      });
      await handle?.close();
      handle = undefined;
    }
  });

  it("explains a custom rule as explain --config does, given a path in the project", async () => {
    const { config, model } = customProject();
    const client = await connect();
    for (const path of [model, join(model, "definition", "model.tmdl")]) {
      const got = await client.call("explain_rule", { ruleId: "team_float columns", path });
      const expected = await cli([
        "explain",
        "team_float columns",
        "--format",
        "json",
        "--config",
        config,
      ]);
      expect(expected.code).toBe(0);
      expect(got).toEqual({ isError: false, text: expected.stdout });
      expect(JSON.parse(got.text).rule).toMatchObject({
        custom: true,
        ruleFile: "rules/team.json",
      });
    }
  });

  it("gives a built-in rule for a built-in id, and the team's rule with replaces for an edited copy", async () => {
    const { model } = customProject();
    const client = await connect();
    expect(await client.call("explain_rule", { ruleId: "ENSURE_ALTTEXT", path: model })).toEqual({
      isError: false,
      text: (await cli(["explain", "ENSURE_ALTTEXT", "--format", "json"])).stdout,
    });
    const edited = await client.call("explain_rule", {
      ruleId: "OBJECTS_WITH_NO_DESCRIPTION",
      path: model,
    });
    expect(edited.isError).toBe(false);
    expect(JSON.parse(edited.text).rule).toMatchObject({
      id: "OBJECTS_WITH_NO_DESCRIPTION",
      custom: true,
      ruleFile: "rules/team.json",
      scope: ["Measure"],
      replaces: "OBJECTS_WITH_NO_DESCRIPTION",
    });
  });

  it("lists the config's custom rules after the built-in ones, with their own fields", async () => {
    const { model } = customProject();
    const client = await connect();
    const got = await client.call("list_rules", { path: model });
    expect(got.isError).toBe(false);
    expect(got.text.endsWith("\n")).toBe(true);
    const rules = JSON.parse(got.text) as Record<string, unknown>[];
    const builtIn = JSON.parse(builtInList()) as Record<string, unknown>[];
    expect(rules.slice(0, builtIn.length)).toEqual(builtIn);
    const custom = rules.slice(builtIn.length);
    // The unchanged copies (ENSURE_TABLES_HAVE_RELATIONSHIPS, HIDE_FOREIGN_KEYS) run as pbiplint's
    // rules, so they are not listed; more.json's copy and its rule under a used id are left out.
    // The order is the reader's, which puts a rule it could not read after those it could.
    expect(custom.map((r) => r.id)).toEqual([
      "TEAM_MEASURES_IN_FOLDERS",
      "TEAM_VISIBLE",
      "PROBE_IGNORE_CUSTOM",
      "TEAM_FLOAT COLUMNS",
      "OBJECTS_WITH_NO_DESCRIPTION",
      "TEAM_NO_SCOPE",
    ]);
    for (const r of custom) {
      expect(r).toMatchObject({ status: "custom", custom: true, ruleFile: "rules/team.json" });
      expect(Object.keys(r)).toEqual([
        "id",
        "name",
        "layer",
        "status",
        "severity",
        "category",
        "custom",
        "ruleFile",
        ...("replaces" in r ? ["replaces"] : []),
        ...("problem" in r ? ["problem"] : []),
      ]);
    }
    const byId = (id: string) => custom.find((r) => r.id === id)!;
    expect(byId("TEAM_FLOAT COLUMNS")).toEqual({
      id: "TEAM_FLOAT COLUMNS",
      name: "Columns store decimals, not floating point numbers",
      layer: "model",
      status: "custom",
      severity: "warning",
      category: "Team conventions",
      custom: true,
      ruleFile: "rules/team.json",
    });
    expect(byId("PROBE_IGNORE_CUSTOM").severity).toBe("info");
    expect(byId("OBJECTS_WITH_NO_DESCRIPTION").replaces).toBe("OBJECTS_WITH_NO_DESCRIPTION");
    expect(custom.filter((r) => "replaces" in r).map((r) => r.id)).toEqual([
      "OBJECTS_WITH_NO_DESCRIPTION",
    ]);
    expect(custom.filter((r) => "problem" in r).map((r) => r.id)).toEqual(["TEAM_NO_SCOPE"]);
    expect(byId("TEAM_NO_SCOPE").problem).toMatch(/\S/);
  });

  it("takes a relative path from the server's folder", async () => {
    const { root, model } = customProject();
    const client = await connect(root);
    const rel = relative(root, model);
    expect(await client.call("list_rules", { path: rel })).toEqual(
      await client.call("list_rules", { path: model }),
    );
    expect(await client.call("explain_rule", { ruleId: "TEAM_FLOAT COLUMNS", path: rel })).toEqual(
      await client.call("explain_rule", { ruleId: "TEAM_FLOAT COLUMNS", path: model }),
    );
  });

  it("never reads the config above the server's folder for a path with no config above it", async () => {
    const { root } = customProject();
    const bare = tempDir("mcp-no-config");
    const client = await connect(root);
    // From the server's own folder the custom rule is found, through the nearest config.
    expect((await client.call("explain_rule", { ruleId: "TEAM_FLOAT COLUMNS" })).isError).toBe(
      false,
    );
    const got = await client.call("explain_rule", { ruleId: "TEAM_FLOAT COLUMNS", path: bare });
    expect(got.isError).toBe(true);
    expect(got.text).toContain('pbiplint: no rule named "TEAM_FLOAT COLUMNS"');
    expect(await client.call("list_rules", { path: bare })).toEqual({
      isError: false,
      text: builtInList(),
    });
  });

  it("returns an error naming a rule file the config names that is not there", async () => {
    const root = tempDir("mcp-missing-file");
    mkdirSync(join(root, "p"));
    writeFileSync(
      join(root, "pbiplint.config.json"),
      JSON.stringify({ customRules: ["rules/missing.json"] }),
    );
    const client = await connect();
    const why =
      "pbiplint: pbiplint.config.json: customRules: rules/missing.json could not be read (ENOENT)";
    for (const got of [
      await client.call("explain_rule", { ruleId: "ENSURE_ALTTEXT", path: join(root, "p") }),
      await client.call("list_rules", { path: join(root, "p") }),
    ])
      expect(got).toEqual({ isError: true, text: why });
  });

  it("is called by the bundle's smoke test, for the JSON", () => {
    const smoke = readFileSync(new URL("../scripts/smoke-mcp.mjs", import.meta.url), "utf8");
    expect(smoke).toContain(
      'params: { name: "custom_rules_reference", arguments: { format: "json" } }',
    );
  });

  it("returns an error for a path that is not there", async () => {
    const client = await connect();
    const nope = join(repo, "no-such-folder");
    for (const got of [
      await client.call("explain_rule", { ruleId: "ENSURE_ALTTEXT", path: nope }),
      await client.call("list_rules", { path: nope }),
    ])
      expect(got).toEqual({ isError: true, text: `pbiplint: ${nope} does not exist` });
  });
});
