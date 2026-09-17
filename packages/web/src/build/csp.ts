import type { Plugin } from "vite";

/**
 * The browser enforces the no-upload claim: no connections of any kind, and no script, style, font,
 * or image from anywhere but this origin. Navigating a link is not a fetch, so links to GitHub and
 * Microsoft Learn still work. Injected at build only, because the dev server needs a websocket.
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  // No unsafe-inline here is what lets the site check treat any inline style as a violation.
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export function cspPlugin(): Plugin {
  return {
    name: "pbiplint-csp",
    apply: "build",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
            injectTo: "head-prepend",
          },
        ],
      };
    },
  };
}
