import { expect, test as base, type Page } from "@playwright/test";

/** Console errors and off-origin requests, collected from before the first navigation. */
export interface Seen {
  errors: string[];
  offOrigin: string[];
}

function watch(page: Page): Seen {
  const seen: Seen = { errors: [], offOrigin: [] };
  page.on("console", (message) => {
    if (message.type() === "error") seen.errors.push(message.text());
  });
  page.on("pageerror", (error) => seen.errors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith("http://localhost:")) seen.offOrigin.push(url);
  });
  return seen;
}

/**
 * Every test starts on the home page with a watch attached before the first request, and ends by
 * asserting that nothing wrote a console error and nothing left the origin. Attached before the
 * navigation, because the page makes every one of its requests during that first load; a watch
 * attached afterwards would see nothing and prove nothing.
 */
export const test = base.extend<{ seen: Seen }>({
  seen: [
    async ({ page }, use) => {
      const seen = watch(page);
      await page.goto("/");
      await use(seen);
      expect(seen.errors).toEqual([]);
      expect(seen.offOrigin).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
