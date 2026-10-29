import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { VERSION } from "../../../core/src/version.js";
import { external, SITE, VERSION_MARKER } from "./pages.js";

export { VERSION_MARKER };

/** Runs git with `args` and returns what it printed, or undefined when git is missing or fails. */
export type Git = (args: string[]) => string | undefined;

const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const git: Git = (args) => {
  try {
    const out = execFileSync("git", args, {
      cwd: WEB_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
};

/**
 * The short commit sha the site was built from: the commit checked out, then GITHUB_SHA, and "dev"
 * only when neither can say, as in a source download with no git. Git comes first because a firm's
 * own workflow that checks out a pbiplint tag has its own commit in GITHUB_SHA. Both are cut to
 * seven characters the same way, so a firm building a tag stamps the marker pbiplint.com's build
 * of it carries.
 */
export const buildMarker = (env: Record<string, string | undefined>, run: Git = git): string =>
  (run(["rev-parse", "HEAD"]) || env.GITHUB_SHA)?.slice(0, 7) || "dev";

/**
 * The date of the commit the site was built from, long-form: the calendar day the committer's own
 * clock showed, as GitHub dates the release, and the same wherever the build runs. Undefined when
 * git cannot say.
 */
export function commitDate(run: Git = git): string | undefined {
  const day = /^\d{4}-\d{2}-\d{2}(?=T)/.exec(run(["log", "-1", "--format=%cI"]) ?? "")?.[0];
  const date = day ? new Date(`${day}T00:00:00Z`) : undefined;
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The footer's version line. pbiplint.com shows the version alone: it deploys from main, whose
 * newest commit is usually not the release's, so a date there would mislead. A self-hosted copy
 * adds the date of its commit and a link that asks pbiplint.com whether a newer version exists,
 * carrying this one in the fragment, which a browser never sends in a request or a referrer.
 */
export function footerVersion({
  version,
  selfHost,
  date,
}: {
  version: string;
  selfHost: boolean;
  date: string | undefined;
}): string {
  if (!selfHost) return `<p class="site-version">pbiplint ${version}</p>`;
  const link = external(`${SITE}/latest/#${version}`, "Check for a newer version");
  return `<p class="site-version">pbiplint ${version}${date ? `, from ${date}` : ""}. ${link}</p>`;
}

/** Writes the version line into every page's footer, in the dev server and the build alike. */
export function versionPlugin({ selfHost, run = git }: { selfHost: boolean; run?: Git }): Plugin {
  const line = footerVersion({ version: VERSION, selfHost, date: selfHost ? commitDate(run) : "" });
  return {
    name: "pbiplint-version",
    transformIndexHtml(html) {
      return html.replace(VERSION_MARKER, line);
    },
  };
}

/**
 * Stamps every page with `<meta name="pbiplint-build" content="<sha>">`, so the deploy workflow can
 * fetch the live site and prove the build it just published is the one being served, and a person
 * can read which commit they are on from view-source. Build only: the dev server has no commit.
 */
export function buildInfoPlugin(
  env: Record<string, string | undefined> = process.env,
  run: Git = git,
): Plugin {
  return {
    name: "pbiplint-build-info",
    apply: "build",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { name: "pbiplint-build", content: buildMarker(env, run) },
            injectTo: "head",
          },
        ],
      };
    },
  };
}
