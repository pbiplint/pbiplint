// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answer } from "../src/latest.js";
import { latestPage } from "../src/build/pages.js";

describe("answer", () => {
  it("says a copy at the latest version is up to date", () => {
    expect(answer("#0.3.0", "0.3.0")).toBe(
      "You're up to date: your copy is 0.3.0, the latest pbiplint.",
    );
  });
  it("names both versions and who to ask when the copy is older", () => {
    for (const fragment of ["#0.2.5", "#0.3.0".replace("3.0", "2.9"), "#0.0.1"])
      expect(answer(fragment, "0.3.0")).toMatch(
        /^Your copy is 0\.\d\.\d+; the latest is 0\.3\.0\. Ask your IT team to update\.$/,
      );
    // Compared as numbers, not as text, where "0.10.0" sorts before "0.9.0".
    expect(answer("#0.9.0", "0.10.0")).toBe(
      "Your copy is 0.9.0; the latest is 0.10.0. Ask your IT team to update.",
    );
  });
  it("calls a newer copy up to date, and claims nothing about a release it has not seen", () => {
    expect(answer("#0.4.0", "0.3.0")).toBe("You're up to date: your copy is 0.4.0.");
  });
  it("falls back to the latest version alone for a fragment that is missing or not a version", () => {
    const fallback =
      "The latest pbiplint is 0.3.0. Compare it with the version in your copy's footer.";
    for (const fragment of [
      "",
      "#",
      "#nonsense",
      "#0.3",
      "#v0.3.0",
      "#0.3.0-beta.1",
      "#0.3.0&x=1",
      "#<img src=x onerror=alert(1)>",
    ])
      expect(answer(fragment, "0.3.0"), fragment).toBe(fallback);
  });
});

describe("the /latest/ page", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const load = async (hash: string): Promise<HTMLElement> => {
    const html = latestPage("0.3.0");
    document.body.innerHTML = html
      .slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
      .replace(/<script[\s\S]*?<\/script>/g, "");
    location.hash = hash;
    await import("../src/latest.js");
    return document.querySelector<HTMLElement>("#latest-answer")!;
  };

  it("names the latest version with no script, and answers for the fragment with one", async () => {
    expect(latestPage("0.3.0")).toContain(
      '<p id="latest-answer" data-version="0.3.0" aria-live="polite">The latest pbiplint is 0.3.0.</p>',
    );
    expect((await load("#0.2.5")).textContent).toBe(
      "Your copy is 0.2.5; the latest is 0.3.0. Ask your IT team to update.",
    );
  });
  it("writes the fragment as text, never as HTML", async () => {
    const p = await load("#<img src=x onerror=alert(1)>");
    expect(p.querySelector("img")).toBeNull();
    expect(p.textContent).toMatch(/^The latest pbiplint is 0\.3\.0\./);
  });
  it("answers again when the fragment changes", async () => {
    const p = await load("#0.3.0");
    location.hash = "#0.1.0";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(p.textContent).toBe(
      "Your copy is 0.1.0; the latest is 0.3.0. Ask your IT team to update.",
    );
  });
});
