import { createServer } from "node:net";

/**
 * The port the end-to-end suite serves the site on. PBIPLINT_E2E_PORT pins it; CI keeps 4173;
 * anywhere else a free port is picked, so two checkouts can run the suite at the same time without
 * anyone choosing a port per clone.
 */
export async function e2ePort(
  env: NodeJS.ProcessEnv = process.env,
  pick: () => Promise<number> = freePort,
): Promise<number> {
  const pinned = env.PBIPLINT_E2E_PORT;
  if (pinned) {
    const port = Number(pinned);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`PBIPLINT_E2E_PORT must be a port number from 1 to 65535, not "${pinned}"`);
    }
    return port;
  }
  return env.CI ? 4173 : pick();
}

/** A port nothing is listening on, found by letting the system assign one and releasing it. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("the system assigned no port"));
      });
    });
  });
}
