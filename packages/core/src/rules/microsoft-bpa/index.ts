import type { Rule } from "../types.js";
import { columnRules } from "./columns.js";
import { relationshipRules } from "./relationships.js";

/** The microsoft-bpa pack. Later tasks append their rule arrays here. */
export const microsoftBpaRules: Rule[] = [...columnRules, ...relationshipRules];
