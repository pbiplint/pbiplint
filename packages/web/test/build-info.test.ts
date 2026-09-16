import { describe, expect, it } from "vitest";
import { buildInfoPlugin, buildMarker } from "../src/build/build-info.js";

describe("buildMarker", () => {
  it("is the short commit sha on CI and 'dev' anywhere else", () => {
    expect(buildMarker({ GITHUB_SHA: "6aa6f4e552bfedc660779e129fc4283cf1336e68" })).toBe("6aa6f4e");
    expect(buildMarker({})).toBe("dev");
    expect(buildMarker({ GITHUB_SHA: "" })).toBe("dev");
  });
});

describe("buildInfoPlugin", () => {
  it("stamps every page with a meta tag naming the build, so a deploy can be checked from outside", () => {
    const plugin = buildInfoPlugin({ GITHUB_SHA: "6aa6f4e552bfedc660779e129fc4283cf1336e68" });
    const transform = plugin.transformIndexHtml as unknown as (html: string) => { tags: unknown[] };
    expect(plugin.apply).toBe("build");
    expect(transform("<html></html>").tags).toEqual([
      {
        tag: "meta",
        attrs: { name: "pbiplint-build", content: "6aa6f4e" },
        injectTo: "head",
      },
    ]);
  });
});
