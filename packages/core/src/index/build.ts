import type { Model } from "../model/types.js";
import { buildReferenceIndex, type ReferenceIndex } from "./references.js";
import { buildRelationshipIndex, type RelationshipIndex } from "./relationships.js";
import { buildUsageIndex, type UsageIndex } from "./usage.js";

export interface Indexes {
  relationships: RelationshipIndex;
  usage: UsageIndex;
  references: ReferenceIndex;
}

export function buildIndexes(model: Model): Indexes {
  return {
    relationships: buildRelationshipIndex(model),
    usage: buildUsageIndex(model),
    references: buildReferenceIndex(model),
  };
}
