import type { Rule } from "../types.js";
import { BPA_RULES } from "./bpa-rules.data.js";
import { columnRules } from "./columns.js";
import { dependencyRules } from "./dependencies.js";
import { liveModelRules } from "./live-model.js";
import { measureRules } from "./measures.js";
import { namingRules } from "./naming.js";
import { relationshipRules } from "./relationships.js";
import { tableRules } from "./tables.js";

const order = new Map(BPA_RULES.map((r, i) => [r.id, i]));

/** The microsoft-bpa pack: every rule in BPARules.json, in ruleset order. */
export const microsoftBpaRules: Rule[] = [
  ...columnRules,
  ...relationshipRules,
  ...measureRules,
  ...dependencyRules,
  ...tableRules,
  ...namingRules,
  ...liveModelRules,
].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
