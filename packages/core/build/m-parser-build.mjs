// How every bundler that ships the core treats Microsoft's M parser (v3 spec, section 3.2):
// - English only: each localization/templates/template.<locale>.json loads as `{}`, so the
//   bundle carries one language of messages, the one pbiplint asks for, instead of 42.
//   template.json (English) has no locale in its name and is untouched.
// - performance-now resolves to a one-line module on the platform's own `performance`, so the
//   bundle holds no `process.` reference for check:browser to refuse.
// One module, so check:browser, the site's Vite build, and the CLI's esbuild build cannot drift.
// It lives outside src, so it never reaches the browser or the npm package's dist.
import { dirname, resolve } from "node:path";

/** A locale template the parser requires: `template.de-DE.json`, never `template.json`. */
export const LOCALE_TEMPLATE = /[\\/]localization[\\/]templates[\\/]template\.[A-Za-z-]+\.json$/;
/** What a locale template becomes. */
export const EMPTY_TEMPLATE = "{}";
/** The module performance-now becomes. */
export const PERFORMANCE_NOW = "module.exports = () => performance.now();";
/** A word only the German template holds, which a bundle that applied the alias lacks. */
export const GERMAN_PROBE = "Erwartet";

const STUB = "pbiplint-performance-now";
const EMPTY_ID = "pbiplint-empty-locale.json";

/** The esbuild plugin: check:browser and the CLI's build. */
export const mParserEsbuild = {
  name: "pbiplint-m-parser",
  setup(build) {
    build.onLoad({ filter: LOCALE_TEMPLATE }, () => ({ contents: EMPTY_TEMPLATE, loader: "json" }));
    build.onResolve({ filter: /^performance-now$/ }, () => ({ path: STUB, namespace: STUB }));
    build.onLoad({ filter: /.*/, namespace: STUB }, () => ({
      contents: PERFORMANCE_NOW,
      loader: "js",
    }));
  },
};

/**
 * The Vite plugin: the site's build. Vite's bundler loads JSON files itself and never offers a
 * locale template to a plugin's load hook, so the template is redirected where it is resolved.
 */
export const mParserVite = () => ({
  name: "pbiplint-m-parser",
  enforce: "pre",
  resolveId(source, importer) {
    if (source === "performance-now") return `\0${STUB}`;
    if (
      importer &&
      source.startsWith(".") &&
      LOCALE_TEMPLATE.test(resolve(dirname(importer), source))
    )
      return `\0${EMPTY_ID}`;
    return null;
  },
  load(id) {
    if (id === `\0${STUB}`) return PERFORMANCE_NOW;
    if (id === `\0${EMPTY_ID}`) return EMPTY_TEMPLATE;
    return null;
  },
});
