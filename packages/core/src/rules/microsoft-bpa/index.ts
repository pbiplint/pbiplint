import type { Rule } from "../types.js";
import { columnRules } from "./columns.js";
import { dependencyRules } from "./dependencies.js";
import { measureRules } from "./measures.js";
import { relationshipRules } from "./relationships.js";
import { tableRules } from "./tables.js";

/** The microsoft-bpa pack. Later tasks append their rule arrays here. */
export const microsoftBpaRules: Rule[] = [
  ...columnRules,
  ...relationshipRules,
  ...measureRules,
  ...dependencyRules,
  ...tableRules,
];
