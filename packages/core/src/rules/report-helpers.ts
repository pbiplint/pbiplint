import { lineOfPointer } from "../pbir/json.js";
import {
  bookmarkLabel,
  pageFilterLabel,
  pageLabel,
  REPORT_FILTER_LABEL,
  REPORT_LABEL,
  reportMeasureLabel,
  visualLabel,
} from "../pbir/names.js";
import type { Bookmark, Page, Report, ReportMeasure, Visual } from "../pbir/types.js";
import type { RuleFinding } from "./types.js";

const at = (file: string, text: string, pointer?: string) => ({
  file,
  line: pointer ? lineOfPointer(text, pointer) : 1,
});
const withDetail = (f: RuleFinding, detail?: string): RuleFinding =>
  detail === undefined ? f : { ...f, detail };

/**
 * Finding factories for report objects. `objectId` is what parity compares; `object` is what the
 * ignore check reads. Report-level findings carry no `object`: they are switched off in config,
 * not by an annotation in report.json (spec section 5).
 */
export const reportFinding = {
  report: (r: Report, detail?: string, objectId = "report"): RuleFinding =>
    withDetail(
      {
        objectType: "Report",
        objectName: REPORT_LABEL,
        objectId,
        ...(r.file ? { location: { file: r.file, line: 1 } } : {}),
      },
      detail,
    ),
  page: (p: Page, pointer?: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Page",
        objectName: pageLabel(p),
        objectId: p.id,
        location: at(p.file, p.text, pointer),
        object: p,
      },
      detail,
    ),
  visual: (v: Visual, pointer?: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Visual",
        objectName: visualLabel(v),
        objectId: v.id,
        location: at(v.file, v.text, pointer),
        object: v,
      },
      detail,
    ),
  pageFilter: (p: Page, pointer: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Page",
        objectName: pageFilterLabel(p),
        objectId: p.id,
        location: at(p.file, p.text, pointer),
        object: p,
      },
      detail,
    ),
  reportFilter: (r: Report, pointer: string, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Report",
        objectName: REPORT_FILTER_LABEL,
        objectId: "report",
        location: at(r.file ?? "definition/report.json", r.text ?? "", pointer),
      },
      detail,
    ),
  bookmark: (b: Bookmark, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "Bookmark",
        objectName: bookmarkLabel(b),
        objectId: b.id,
        location: { file: b.file, line: 1 },
        object: b,
      },
      detail,
    ),
  reportMeasure: (m: ReportMeasure, detail?: string): RuleFinding =>
    withDetail(
      {
        objectType: "ReportMeasure",
        objectName: reportMeasureLabel(m),
        objectId: `${m.table}.${m.name}`,
        location: { file: m.file, line: m.line },
        object: m,
      },
      detail,
    ),
};

export const allVisuals = (r: Report): Visual[] => r.pages.flatMap((p) => p.visuals);
export const isHiddenPage = (p: Page): boolean => p.visibility === "HiddenInViewMode";
export const visiblePages = (r: Report): Page[] => r.pages.filter((p) => !isHiddenPage(p));
