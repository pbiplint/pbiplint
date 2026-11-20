// The custom rules code, as the site's own chunk: rule-files.ts imports this module dynamically, so
// Vite builds it, and everything only it needs, into assets/custom-rules-*.js. The home page
// fetches that chunk from its own origin from start-up (preloadCustomRules), so no request ever
// follows a drop. Only what the site uses is re-exported here.
export { readCustomRules, type CustomRuleSet } from "@pbiplint/core/custom-rules";
