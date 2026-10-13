import type { Locator } from "@playwright/test";

/** What the listener setFolder installs leaves on the input: a promise of its next change event. */
type Watched = HTMLInputElement & { nextChange?: Promise<void> };

/**
 * Gives a folder input (`webkitdirectory`) a directory, as `locator.setInputFiles(path)` would,
 * and returns once the page has seen the input's change event.
 *
 * It exists because of a race in Playwright 1.63. For a directory, `_setInputFiles`
 * (node_modules/playwright-core/lib/coreBundle.js) starts an evaluate that adds a one-shot `input`
 * listener to the element, does not wait for that listener to be in place, sets the files, and then
 * waits for the listener to fire. Under load the browser can fire `input` first, and setInputFiles
 * then never returns: the page has read and linted the folder, and the test times out with an
 * empty `Received string` from whatever expect comes next. Seen in Firefox in CI and in WebKit
 * locally, on a bare page with none of pbiplint's code as well as on this site.
 *
 * So the helper installs its own `change` listener and waits until it is in place, then starts
 * setInputFiles without depending on Playwright's wait, and waits for its own listener instead. A
 * setInputFiles that fails before the change arrives still fails the test; one left waiting on the
 * lost event settles when the context closes, and that late settle is swallowed. The helper can go
 * once Playwright waits for its listener before it sets the files.
 */
export async function setFolder(input: Locator, path: string): Promise<void> {
  await input.evaluate((el: Watched) => {
    el.nextChange = new Promise((done) =>
      el.addEventListener("change", () => done(), { once: true }),
    );
  });
  const setting = input.setInputFiles(path);
  setting.catch(() => undefined);
  const changed = input.evaluate((el: Watched) => el.nextChange);
  await Promise.race([changed, setting.then(() => changed)]);
}
