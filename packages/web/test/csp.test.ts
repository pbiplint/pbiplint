import { describe, expect, it } from "vitest";
import { CSP, cspPlugin } from "../src/build/csp.js";

describe("content security policy", () => {
  it("forbids every connection and every external resource", () => {
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).toContain("style-src 'self'");
    expect(CSP).toContain("font-src 'self'");
    expect(CSP).toContain("img-src 'self' data:");
    expect(CSP).not.toMatch(/https?:/);
  });
  it("is injected into the head of every built page, and only at build", () => {
    const plugin = cspPlugin();
    expect(plugin.apply).toBe("build");
    const hook = plugin.transformIndexHtml as unknown as (html: string) => {
      html: string;
      tags: { tag: string; attrs: Record<string, string>; injectTo: string }[];
    };
    const page = "<html><head></head><body><p>a page</p></body></html>";
    const out = hook(page);
    // The hook hands the page back as it found it: dropping it would replace every built page
    // with the meta tag alone.
    expect(out.html).toBe(page);
    expect(out.tags).toEqual([
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
        injectTo: "head-prepend",
      },
    ]);
  });
});
