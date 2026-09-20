import { buildModel } from "../model/build.js";
import type { Project } from "../project/types.js";
import { buildReferenceIndex, type ReferenceIndex } from "./references.js";
import { buildRelationshipIndex, type RelationshipIndex } from "./relationships.js";
import { buildUsageIndex, type UsageIndex } from "./usage.js";

export interface Indexes {
  relationships: RelationshipIndex;
  usage: UsageIndex;
  references: ReferenceIndex;
}

/** The indexes every rule shares for one run. A project with no model layer indexes an empty model. */
export function buildIndexes(project: Project): Indexes {
  const model = project.model ?? buildModel([]);
  return {
    relationships: buildRelationshipIndex(model),
    usage: buildUsageIndex(model),
    references: buildReferenceIndex(model),
  };
}
