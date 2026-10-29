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
 * The short commit sha the site was built from: GITHUB_SHA on CI, git on a local build, and "dev"
 * only when neither can say, as in a source download with no git. Both are cut to seven characters
 * the same way, so a firm building a tag stamps the marker pbiplint.com's build of it carries.
 */
export const buildMarker = (env: Record<string, string | undefined>, run: Git = git): string =>
  (env.GITHUB_SHA || run(["rev-parse", "HEAD"]))?.slice(0, 7) || "dev";

/**
 * The date of the commit the site was built from, long-form, in UTC, so every build of a commit
 * shows the same date wherever it is built. Undefined when git cannot say.
 */
export function commitDate(run: Git = git): string | undefined {
  const iso = run(["log", "-1", "--format=%cI"]);
  const date = iso ? new Date(iso) : undefined;
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
