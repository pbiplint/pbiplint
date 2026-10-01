import type { Rule } from "../types.js";
import { actionRules } from "./actions.js";
import { filterRules } from "./filters.js";
import { formattingRules } from "./formatting.js";
import { functionRules } from "./functions.js";
import { measureRules } from "./measures.js";
import { openingRules } from "./opening.js";
import { pageRules } from "./pages.js";
import { periodRules } from "./periods.js";
import { referenceRules } from "./references.js";
import { tabOrderRules } from "./tab-order.js";
import { translationRules } from "./translations.js";
import { visualRules } from "./visuals.js";

/**
 * pbiplint's own rules, in the spec's order: references, opening, visuals, pages, measures,
 * periods in DAX, years in filters, user-defined functions, translations, format strings, actions
 * and bookmarks, tab order.
 */
export const pbiplintRules: Rule[] = [
  ...referenceRules,
  ...openingRules,
  ...visualRules,
  ...pageRules,
  ...measureRules,
  ...periodRules,
  ...filterRules,
  ...functionRules,
  ...translationRules,
  ...formattingRules,
  ...actionRules,
  ...tabOrderRules,
];
