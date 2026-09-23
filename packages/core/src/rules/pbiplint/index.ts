import type { Rule } from "../types.js";
import { openingRules } from "./opening.js";
import { referenceRules } from "./references.js";
import { visualRules } from "./visuals.js";

/** pbiplint's own rules, in the spec's order: references, opening, visuals, pages, measures, actions. */
export const pbiplintRules: Rule[] = [...referenceRules, ...openingRules, ...visualRules];
