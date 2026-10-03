#!/usr/bin/env node
// Usage: TRAFFIC_TOKEN=... GITHUB_REPOSITORY=pbiplint/pbiplint node scripts/traffic.mjs <traffic.json>
// Archives the repository's traffic, which GitHub keeps for 14 days only: daily views and clones,
// and the top referrers and paths. Merges a fetch into the JSON file by date and says whether
// anything changed (`changed=true|false` to $GITHUB_OUTPUT when set). Run weekly by
// .github/workflows/traffic.yml; see "Usage counts" in CONTRIBUTING.md.
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://api.github.com";

/** The traffic endpoints, under /repos/{owner}/{repo}/traffic/. Views and clones per day. */
const ENDPOINTS = {
  views: "views?per=day",
  clones: "clones?per=day",
  referrers: "popular/referrers",
  paths: "popular/paths",
};

/**
 * The four traffic responses. The token needs Administration: read on the repository; the
 * workflow's built-in token cannot read traffic.
 */
export async function fetchTraffic({ repo, token, fetch }) {
  if (!token) throw new Error("No token: set TRAFFIC_TOKEN to a token that can read traffic.");
  const out = {};
  for (const [key, path] of Object.entries(ENDPOINTS)) {
    const url = `${API}/repos/${repo}/traffic/${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}`);
    out[key] = await response.json();
  }
  return out;
}

const sortKeys = (object) =>
  Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

function list(value, name) {
  if (!Array.isArray(value)) throw new Error(`The traffic response has no ${name} list.`);
  return value;
}

/**
 * `archive` with `fetched` merged in. Views and clones are daily, so a day reported again is
 * replaced (the newest day is partial until it closes) and days no longer reported are kept.
 * Referrers and paths are 14-day totals with no date, so each fetch is kept under `fetchedOn`.
 */
export function mergeTraffic(archive, fetched, fetchedOn) {
  const daily = (kind) => {
    const days = { ...archive[kind] };
    for (const d of list(fetched[kind]?.[kind], kind))
      days[d.timestamp.slice(0, 10)] = { count: d.count, uniques: d.uniques };
    return sortKeys(days);
  };
  return {
    views: daily("views"),
    clones: daily("clones"),
    referrers: sortKeys({
      ...archive.referrers,
      [fetchedOn]: list(fetched.referrers, "referrers"),
    }),
    paths: sortKeys({ ...archive.paths, [fetchedOn]: list(fetched.paths, "paths") }),
  };
}

export async function main({ repo, token, file, today, fetch }) {
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  const archive = before ? JSON.parse(before) : {};
  const fetched = await fetchTraffic({ repo, token, fetch });
  const after = `${JSON.stringify(mergeTraffic(archive, fetched, today), null, 2)}\n`;
  // A second fetch on the same day with the same numbers changes nothing worth a commit.
  if (after === before) return { changed: false };
  writeFileSync(file, after);
  return { changed: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/traffic.mjs <traffic.json>");
    process.exit(2);
  }
  const { changed } = await main({
    repo: process.env.GITHUB_REPOSITORY ?? "pbiplint/pbiplint",
    token: process.env.TRAFFIC_TOKEN,
    file,
    today: new Date().toISOString().slice(0, 10),
    fetch: globalThis.fetch,
  });
  console.log(changed ? `traffic: ${file} updated` : "traffic: nothing new");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
