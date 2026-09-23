import type { Rule } from "../types.js";
import { actionRules } from "./actions.js";
import { measureRules } from "./measures.js";
import { openingRules } from "./opening.js";
import { pageRules } from "./pages.js";
import { referenceRules } from "./references.js";
import { tabOrderRules } from "./tab-order.js";
import { visualRules } from "./visuals.js";

/**
 * pbiplint's own rules, in the spec's order: references, opening, visuals, pages, measures,
 * actions and bookmarks, tab order.
 */
export const pbiplintRules: Rule[] = [
  ...referenceRules,
  ...openingRules,
  ...visualRules,
  ...pageRules,
  ...measureRules,
  ...actionRules,
  ...tabOrderRules,
];
