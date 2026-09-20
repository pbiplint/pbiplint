import type { Model } from "../model/types.js";
import type { Report } from "../pbir/types.js";
import type { LayerName } from "../rules/types.js";

/** What one run reads: a model, a report, or both. Either part may be absent. */
export interface Project {
  model?: Model;
  report?: Report;
}

export type DiagnosticKind =
  | "depth-cap"
  | "unread-file"
  | "legacy-report-format"
  | "legacy-model-format"
  | "model-reference-mismatch"
  | "schema-newer-than-known";

/** Something about the input that a reader must know so nothing unread is mistaken for clean. */
export interface Diagnostic {
  kind: DiagnosticKind;
  message: string;
  path?: string;
}

/** Whether a layer was read, with the file count when it was and the reason when it was not. */
export type LayerStatus = { present: true; files: number } | { present: false; reason: string };

/** The two layers of a run, each with its status. */
export interface Layers {
  model: LayerStatus;
  report: LayerStatus;
}

/** One line of "Report at a glance": what the report will do, always shown, whether or not anything fired. */
export interface Fact {
  layer: LayerName;
  label: string;
  value: string;
  detail?: string;
  /** The rule that checks this fact, when the run has that rule; the site links the fact to it. */
  ruleId?: string;
}
