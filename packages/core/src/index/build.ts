import { emptyMIndex } from "../m/read.js";
import type { MIndex } from "../m/types.js";
import { buildModel } from "../model/build.js";
import type { Project } from "../project/types.js";
import { buildReachabilityIndex, type ReachabilityIndex } from "./reachability.js";
import { buildReferenceIndex, type ReferenceIndex } from "./references.js";
import { buildRelationshipIndex, type RelationshipIndex } from "./relationships.js";
import { buildReportReferenceIndex, type ReportReferenceIndex } from "./report-refs.js";
import { buildUsageIndex, type UsageIndex } from "./usage.js";

export interface Indexes {
  relationships: RelationshipIndex;
  usage: UsageIndex;
  references: ReferenceIndex;
  /** Present when the project has a report. */
  reportRefs?: ReportReferenceIndex;
  /** Present when the project has both parts. */
  reachability?: ReachabilityIndex;
  /** Every M expression in the model, parsed (v3 spec, section 5.3); empty when there is no model. */
  m: MIndex;
}

/** Built once per run. The model indexes come from the empty model when the layer is absent, so a model rule can always read them (it is skipped anyway). */
export function buildIndexes(project: Project, m: MIndex = emptyMIndex()): Indexes {
  const model = project.model ?? buildModel([]);
  const references = buildReferenceIndex(model);
  const indexes: Indexes = {
    relationships: buildRelationshipIndex(model),
    usage: buildUsageIndex(model),
    references,
    m,
  };
  if (project.report) {
    indexes.reportRefs = buildReportReferenceIndex(project.report, project.model);
    if (project.model)
      indexes.reachability = buildReachabilityIndex(project.model, references, indexes.reportRefs);
  }
  return indexes;
}
