import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildInfoPlugin,
  buildMarker,
  commitDate,
  footerVersion,
  VERSION_MARKER,
  versionPlugin,
} from "../src/build/build-info.js";
import { page } from "../src/build/pages.js";

const SHA = "6aa6f4e552bfedc660779e129fc4283cf1336e68";

/** A git that answers only the commands named, as `git` would print them, and fails anything else. */
const git =
  (answers: Record<string, string>) =>
  (args: string[]): string | undefined =>
    answers[args.join(" ")];
const noGit = (): undefined => undefined;

describe("buildMarker", () => {
  it("is the short commit sha on CI", () => {
    expect(buildMarker({ GITHUB_SHA: SHA }, noGit)).toBe("6aa6f4e");
  });
  it("reads the commit from git on a local build, cut to seven characters exactly as CI's is", () => {
    // Not `git rev-parse --short=7`, which lengthens the sha when seven characters are ambiguous,
    // and would then stamp a different marker from the one CI stamps for the same commit.
    expect(buildMarker({}, git({ "rev-parse HEAD": SHA }))).toBe("6aa6f4e");
    expect(buildMarker({ GITHUB_SHA: "" }, git({ "rev-parse HEAD": SHA }))).toBe("6aa6f4e");
  });
  it("is 'dev' only when there is no commit to read, as in a source download with no git", () => {
    expect(buildMarker({}, noGit)).toBe("dev");
  });
});

describe("commitDate", () => {
  it("is the date of the commit, long-form, in UTC, so every build of a commit shows the same date", () => {
    expect(commitDate(git({ "log -1 --format=%cI": "2026-10-04T23:30:00-05:00" }))).toBe(
      "October 5, 2026",
    );
    expect(commitDate(git({ "log -1 --format=%cI": "2026-10-04T09:00:00Z" }))).toBe(
      "October 4, 2026",
    );
  });
  it("is undefined with no git, or with an answer that is not a date", () => {
    expect(commitDate(noGit)).toBeUndefined();
    expect(commitDate(git({ "log -1 --format=%cI": "not a date" }))).toBeUndefined();
  });
});

describe("footerVersion", () => {
  it("names the version alone on the public build", () => {
    expect(footerVersion({ version: "0.3.0", selfHost: false, date: "October 4, 2026" })).toBe(
      '<p class="site-version">pbiplint 0.3.0</p>',
    );
  });
  it("adds the commit date and a link to /latest/ with the version in the fragment on a self-hosted copy", () => {
    const html = footerVersion({ version: "0.3.0", selfHost: true, date: "October 4, 2026" });
    expect(html).toBe(
      '<p class="site-version">pbiplint 0.3.0, from October 4, 2026. <a href="https://pbiplint.com/latest/#0.3.0" target="_blank" rel="noopener noreferrer">Check for a newer version<span class="visually-hidden"> (opens in a new tab)</span></a></p>',
    );
  });
  it("keeps the link and drops the date when the commit date is unknown", () => {
    expect(footerVersion({ version: "0.3.0", selfHost: true, date: undefined })).toBe(
      '<p class="site-version">pbiplint 0.3.0. <a href="https://pbiplint.com/latest/#0.3.0" target="_blank" rel="noopener noreferrer">Check for a newer version<span class="visually-hidden"> (opens in a new tab)</span></a></p>',
    );
  });
});

describe("the footer marker", () => {
  it("is in every page's footer: the hand-written home and 404 pages and every generated page", () => {
    const footerOf = (html: string): string => /<footer[\s\S]*<\/footer>/.exec(html)?.[0] ?? "";
    for (const file of ["../index.html", "../404.html"])
      expect(footerOf(readFileSync(new URL(file, import.meta.url), "utf8")), file).toContain(
        VERSION_MARKER,
      );
    expect(footerOf(page({ title: "t", description: "d", path: "/x/", main: "" }))).toContain(
      VERSION_MARKER,
    );
  });
});

describe("versionPlugin", () => {
  type Transform = (html: string) => string;
  it("replaces the marker with the version line, in the dev server and the build alike", () => {
    const plugin = versionPlugin({ selfHost: false, run: noGit });
    expect(plugin.apply).toBeUndefined();
    const transform = plugin.transformIndexHtml as unknown as Transform;
    const out = transform(`<footer>${VERSION_MARKER}</footer>`);
    expect(out).toMatch(/^<footer><p class="site-version">pbiplint \d+\.\d+\.\d+<\/p><\/footer>$/);
  });
  it("writes the self-hosted line, with the commit date from git, in the self-hosting build", () => {
    const plugin = versionPlugin({
      selfHost: true,
      run: git({ "log -1 --format=%cI": "2026-10-04T09:00:00Z" }),
    });
    const transform = plugin.transformIndexHtml as unknown as Transform;
    expect(transform(`<footer>${VERSION_MARKER}</footer>`)).toMatch(
      /pbiplint \d+\.\d+\.\d+, from October 4, 2026\. <a href="https:\/\/pbiplint\.com\/latest\/#\d+\.\d+\.\d+"/,
    );
  });
});

describe("buildInfoPlugin", () => {
  it("stamps every page with a meta tag naming the build, so a deploy can be checked from outside", () => {
    const plugin = buildInfoPlugin({ GITHUB_SHA: SHA }, noGit);
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
