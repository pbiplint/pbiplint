import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { e2ePort, freePort } from "../e2e/port.js";

const never = () => Promise.reject(new Error("no free port should be picked"));

describe("e2ePort", () => {
  it("takes the port PBIPLINT_E2E_PORT names, on CI too", async () => {
    expect(await e2ePort({ PBIPLINT_E2E_PORT: "5180" }, never)).toBe(5180);
    expect(await e2ePort({ PBIPLINT_E2E_PORT: "5180", CI: "true" }, never)).toBe(5180);
  });

  it("keeps 4173 on CI", async () => {
    expect(await e2ePort({ CI: "true" }, never)).toBe(4173);
  });

  it("picks a free port anywhere else, so two checkouts can run the suite at once", async () => {
    expect(await e2ePort({}, () => Promise.resolve(51234))).toBe(51234);
    expect(await e2ePort({ PBIPLINT_E2E_PORT: "" }, () => Promise.resolve(51234))).toBe(51234);
  });

  it("refuses a value that is not a port, naming it", async () => {
    for (const value of ["abc", "0", "65536", "41.5", "-1"]) {
      await expect(e2ePort({ PBIPLINT_E2E_PORT: value }, never)).rejects.toThrow(`"${value}"`);
    }
  });
});

describe("freePort", () => {
  it("returns a port nothing is listening on", async () => {
    const port = await freePort();
    expect(port).toBeGreaterThan(0);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, resolve);
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
