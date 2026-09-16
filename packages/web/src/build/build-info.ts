import type { Plugin } from "vite";

/** The short commit sha the site was built from on CI, or "dev" for a local build. */
export const buildMarker = (env: Record<string, string | undefined>): string =>
  env.GITHUB_SHA ? env.GITHUB_SHA.slice(0, 7) : "dev";

/**
 * Stamps every page with `<meta name="pbiplint-build" content="<sha>">`, so the deploy workflow can
 * fetch the live site and prove the build it just published is the one being served, and a person
 * can read which commit they are on from view-source. Build only: the dev server has no commit.
 */
export function buildInfoPlugin(env: Record<string, string | undefined> = process.env): Plugin {
  return {
    name: "pbiplint-build-info",
    apply: "build",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { name: "pbiplint-build", content: buildMarker(env) },
            injectTo: "head",
          },
        ],
      };
    },
  };
}
