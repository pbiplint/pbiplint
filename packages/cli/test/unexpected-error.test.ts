import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fakeSecrets, leaks } from "../../../tests/support/fake-secrets.js";
import { main } from "../src/main.js";

// The secret guard (v3 spec, section 11.3) on main's unexpected error: lint itself throws, with the
// model's text in the message. Not Node's own error (no string `code`), so only its class and the
// stack's frames are printed (pb-coord, October 28, 2026).
const secret = fakeSecrets()[0]!;
vi.mock("@pbiplint/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@pbiplint/core")>();
  return {
    ...core,
    lint: () => Promise.reject(new TypeError(`source = "${secret}"\n    at forged (x.js:1:1)`)),
  };
});

const sample = join(dirname(fileURLToPath(import.meta.url)), "../../../examples/messy-sales");

describe("an unexpected error out of lint", () => {
  it("prints its class and its stack's frames, and no part of its message", async () => {
    let out = "";
    let err = "";
    const code = await main([sample], {
      stdout: (s) => (out += s),
      stderr: (s) => (err += s),
      cwd: () => process.cwd(),
    });
    expect(code).toBe(2);
    expect(out).toBe("");
    const [first, ...rest] = err.split("\n");
    expect(first).toBe(
      "pbiplint: unexpected error: TypeError. Please report this at https://github.com/pbiplint/pbiplint/issues.",
    );
    expect(rest.at(-1)).toBe("");
    expect(rest.length).toBeGreaterThan(1);
    for (const line of rest.slice(0, -1)) expect(line).toMatch(/^ {4}at (?!forged)/);
    // Counted, not listed, so a failure prints no piece of the made-up value.
    expect(leaks(`${out}${err}`, [secret]).length).toBe(0);
  });
});
