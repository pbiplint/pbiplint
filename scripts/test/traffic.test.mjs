import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../tests/support/temp-dir.js";
import { fetchTraffic, main, mergeTraffic, trafficRepo } from "../traffic.mjs";

const day = (date, count, uniques) => ({ timestamp: `${date}T00:00:00Z`, count, uniques });

/** What the four traffic endpoints return, trimmed to the fields the archive keeps. */
const FETCHED = {
  views: { count: 7, uniques: 3, views: [day("2026-09-28", 5, 2), day("2026-09-29", 2, 1)] },
  clones: { count: 1, uniques: 1, clones: [day("2026-09-29", 1, 1)] },
  referrers: [{ referrer: "github.com", count: 4, uniques: 2 }],
  paths: [{ path: "/pbiplint/pbiplint", title: "pbiplint", count: 6, uniques: 3 }],
};

describe("mergeTraffic", () => {
  it("starts an archive from the first fetch", () => {
    expect(mergeTraffic({}, FETCHED, "2026-10-05")).toEqual({
      views: {
        "2026-09-28": { count: 5, uniques: 2 },
        "2026-09-29": { count: 2, uniques: 1 },
      },
      clones: { "2026-09-29": { count: 1, uniques: 1 } },
      referrers: { "2026-10-05": [{ referrer: "github.com", count: 4, uniques: 2 }] },
      paths: {
        "2026-10-05": [{ path: "/pbiplint/pbiplint", title: "pbiplint", count: 6, uniques: 3 }],
      },
      totals: {
        "2026-10-05": { views: { count: 7, uniques: 3 }, clones: { count: 1, uniques: 1 } },
      },
    });
  });

  it("keeps each fetch's 14-day totals, since daily uniques do not add up to them", () => {
    const first = mergeTraffic({}, FETCHED, "2026-10-05");
    const next = mergeTraffic(first, FETCHED, "2026-10-12");
    expect(Object.keys(next.totals)).toEqual(["2026-10-05", "2026-10-12"]);
  });

  it("a later fetch replaces a day it reports again and keeps the days it no longer reports", () => {
    const first = mergeTraffic({}, FETCHED, "2026-10-05");
    const later = {
      ...FETCHED,
      views: { views: [day("2026-09-29", 4, 2), day("2026-10-06", 1, 1)] },
    };
    expect(mergeTraffic(first, later, "2026-10-12").views).toEqual({
      "2026-09-28": { count: 5, uniques: 2 },
      "2026-09-29": { count: 4, uniques: 2 },
      "2026-10-06": { count: 1, uniques: 1 },
    });
  });

  it("keeps each fetch's referrers and paths under its own date", () => {
    const first = mergeTraffic({}, FETCHED, "2026-10-05");
    const next = mergeTraffic(first, { ...FETCHED, referrers: [] }, "2026-10-12");
    expect(Object.keys(next.referrers)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(next.referrers["2026-10-12"]).toEqual([]);
  });

  it("writes dates in order, so each commit's diff shows the new week", () => {
    const merged = mergeTraffic(
      { views: { "2026-09-29": { count: 1, uniques: 1 } } },
      { ...FETCHED, views: { views: [day("2026-09-01", 1, 1)] } },
      "2026-10-05",
    );
    expect(Object.keys(merged.views)).toEqual(["2026-09-01", "2026-09-29"]);
  });

  it("does not change the archive it was given", () => {
    const archive = { views: { "2026-09-01": { count: 1, uniques: 1 } } };
    mergeTraffic(archive, FETCHED, "2026-10-05");
    expect(archive).toEqual({ views: { "2026-09-01": { count: 1, uniques: 1 } } });
  });

  it("refuses a response without the arrays it expects, rather than writing half an archive", () => {
    expect(() => mergeTraffic({}, { ...FETCHED, views: {} }, "2026-10-05")).toThrow(/views/);
    expect(() => mergeTraffic({}, { ...FETCHED, paths: null }, "2026-10-05")).toThrow(/paths/);
  });
});

describe("fetchTraffic", () => {
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });

  it("asks the four traffic endpoints with the token and the API version", async () => {
    const calls = [];
    const bodies = {
      "views?per=day": FETCHED.views,
      "clones?per=day": FETCHED.clones,
      "popular/referrers": FETCHED.referrers,
      "popular/paths": FETCHED.paths,
    };
    const fetch = async (url, init) => {
      calls.push({ url, init });
      return ok(bodies[url.split("/traffic/")[1]]);
    };
    expect(await fetchTraffic({ repo: "pbiplint/pbiplint", token: "t0k", fetch })).toEqual(FETCHED);
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.github.com/repos/pbiplint/pbiplint/traffic/views?per=day",
      "https://api.github.com/repos/pbiplint/pbiplint/traffic/clones?per=day",
      "https://api.github.com/repos/pbiplint/pbiplint/traffic/popular/referrers",
      "https://api.github.com/repos/pbiplint/pbiplint/traffic/popular/paths",
    ]);
    for (const { init } of calls) {
      expect(init.headers).toMatchObject({
        Authorization: "Bearer t0k",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      });
    }
  });

  it("fails with the status and the URL, as an expired token does", async () => {
    const fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await expect(fetchTraffic({ repo: "pbiplint/pbiplint", token: "old", fetch })).rejects.toThrow(
      "GitHub answered 401 for https://api.github.com/repos/pbiplint/pbiplint/traffic/views?per=day",
    );
  });

  it("refuses to run without a token", async () => {
    await expect(fetchTraffic({ repo: "pbiplint/pbiplint", token: "", fetch })).rejects.toThrow(
      /TRAFFIC_TOKEN/,
    );
  });
});

describe("main", () => {
  const fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith("views?per=day")
        ? FETCHED.views
        : url.endsWith("clones?per=day")
          ? FETCHED.clones
          : url.endsWith("referrers")
            ? FETCHED.referrers
            : FETCHED.paths,
  });

  it("writes the archive, then reports nothing new when a second fetch adds nothing", async () => {
    const file = join(tempDir("traffic"), "traffic.json");
    const args = { repo: "pbiplint/pbiplint", token: "t", file, today: "2026-10-05", fetch };
    expect(await main(args)).toEqual({ changed: true });
    const written = readFileSync(file, "utf8");
    expect(JSON.parse(written).views["2026-09-28"]).toEqual({ count: 5, uniques: 2 });
    expect(written.endsWith("}\n")).toBe(true);
    expect(await main(args)).toEqual({ changed: false });
    expect(readFileSync(file, "utf8")).toBe(written);
  });

  it("adds to an archive already there", async () => {
    const file = join(tempDir("traffic"), "traffic.json");
    writeFileSync(file, JSON.stringify({ views: { "2026-01-01": { count: 1, uniques: 1 } } }));
    await main({ repo: "pbiplint/pbiplint", token: "t", file, today: "2026-10-05", fetch });
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")).views)).toEqual([
      "2026-01-01",
      "2026-09-28",
      "2026-09-29",
    ]);
  });
});

describe("trafficRepo", () => {
  it("archives pbiplint/pbiplint unless TRAFFIC_REPO names another", () => {
    expect(trafficRepo({})).toBe("pbiplint/pbiplint");
    expect(trafficRepo({ TRAFFIC_REPO: "pbiplint/action" })).toBe("pbiplint/action");
  });

  it("ignores GITHUB_REPOSITORY, which names the repository the workflow runs in", () => {
    expect(trafficRepo({ GITHUB_REPOSITORY: "pbiplint/metrics" })).toBe("pbiplint/pbiplint");
  });
});
