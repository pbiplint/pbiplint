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

/**
 * The page's address stays out of every request a link makes, so following one tells the site at
 * the other end nothing about where the reader came from. Every link off the site already carries
 * `rel="noreferrer"`; this covers one that does not.
 */
export const REFERRER = "no-referrer";

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
          { tag: "meta", attrs: { name: "referrer", content: REFERRER }, injectTo: "head-prepend" },
        ],
      };
    },
  };
}
