import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSecrets } from "../../../tests/support/fake-secrets.js";

// The secret guard (v3 spec, section 11.3) on bin.ts's last catch: an error that escapes main can
// carry the model's text in its message, so only its class is printed, with a request to report it.
const secret = fakeSecrets()[0]!;
vi.mock("../src/main.js", () => ({
  main: () => Promise.reject(new TypeError(`source = "${secret}"`)),
}));

describe("bin, when main throws", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("prints only the error's class, never its message, and exits 2", async () => {
    let err = "";
    vi.spyOn(process.stderr, "write").mockImplementation((s) => {
      err += String(s);
      return true;
    });
    await import("../src/bin.js");
    await vi.waitFor(() => expect(process.exitCode).toBe(2));
    expect(err).toBe(
      "pbiplint: something went wrong: TypeError. Please report this at https://github.com/pbiplint/pbiplint/issues.\n",
    );
    expect(err.includes(secret)).toBe(false);
  });
});
