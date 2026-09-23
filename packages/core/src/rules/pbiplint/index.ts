import type { Rule } from "../types.js";
import { measureRules } from "./measures.js";
import { openingRules } from "./opening.js";
import { pageRules } from "./pages.js";
import { referenceRules } from "./references.js";
import { visualRules } from "./visuals.js";

/** pbiplint's own rules, in the spec's order: references, opening, visuals, pages, measures, actions. */
export const pbiplintRules: Rule[] = [
  ...referenceRules,
  ...openingRules,
  ...visualRules,
  ...pageRules,
  ...measureRules,
];
