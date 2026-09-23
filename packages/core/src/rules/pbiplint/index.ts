import type { Rule } from "../types.js";
import { referenceRules } from "./references.js";

/** pbiplint's own rules, in the spec's order: references, opening, visuals, pages, measures, actions. */
export const pbiplintRules: Rule[] = [...referenceRules];
