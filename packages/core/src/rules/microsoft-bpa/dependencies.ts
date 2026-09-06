import type { RefOwner } from "../../index/references.js";
import { measureRef } from "../../model/names.js";
import type {
  CalculationItem,
  Column,
  Measure,
  Table,
  TablePermission,
} from "../../model/types.js";
import { allMeasures, finding } from "../helpers.js";
import type { RuleContext, RuleFinding } from "../types.js";
import { bpaRule } from "./define.js";

/** The finding shell for whichever object owns a DAX expression. */
export function ownerFinding(o: RefOwner): RuleFinding {
  switch (o.kind) {
    case "measure":
      return finding.measure(o.object as Measure);
    case "calculatedColumn":
      return finding.column(o.object as Column);
    case "calculatedTable":
      return finding.table(o.object as Table);
    case "tablePermission":
      return finding.tablePermission(o.object as TablePermission);
    case "calculationItem":
      return finding.calculationItem(o.object as CalculationItem);
  }
}

// Scope: Measure, KPI, TablePermission, CalculationItem. KPIs are not modeled in v1. Calculation items
// never resolve bare references to columns (ground-truth item 3), so they never fire here.
export const DAX_COLUMNS_FULLY_QUALIFIED = bpaRule(
  "DAX_COLUMNS_FULLY_QUALIFIED",
  (_m, { indexes: { references } }: RuleContext) =>
    references.owners
      .filter(
        (o) =>
          (o.kind === "measure" || o.kind === "tablePermission" || o.kind === "calculationItem") &&
          o.refs.some((r) => r.kind === "column" && !r.qualified),
      )
      .map(ownerFinding),
);

// Scope: Measure, CalculatedColumn, CalculatedTable, KPI, CalculationItem.
export const DAX_MEASURES_UNQUALIFIED = bpaRule(
  "DAX_MEASURES_UNQUALIFIED",
  (_m, { indexes: { references } }: RuleContext) =>
    references.owners
      .filter(
        (o) =>
          o.kind !== "tablePermission" && o.refs.some((r) => r.kind === "measure" && r.qualified),
      )
      .map(ownerFinding),
);

const stripWhitespace = (s: string): string => s.replace(/[ \n\r\t]/g, "");

export const AVOID_DUPLICATE_MEASURES = bpaRule("AVOID_DUPLICATE_MEASURES", (m) => {
  const all = allMeasures(m);
  const counts = new Map<string, number>();
  for (const x of all) {
    const k = stripWhitespace(x.expression);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return all
    .filter((x) => (counts.get(stripWhitespace(x.expression)) ?? 0) > 1)
    .map(finding.measure);
});

export const MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES = bpaRule(
  "MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES",
  (m) => {
    const all = allMeasures(m);
    const names = new Set(all.map((x) => measureRef(x.name)));
    return all.filter((x) => names.has(x.expression)).map(finding.measure);
  },
);

export const UNNECESSARY_MEASURES = bpaRule(
  "UNNECESSARY_MEASURES",
  (m, { indexes: { references } }: RuleContext) =>
    allMeasures(m)
      .filter(
        (x) => (x.table.isHidden || x.isHidden) && references.measureReferencedBy(x).length === 0,
      )
      .map(finding.measure),
);

export const dependencyRules = [
  DAX_COLUMNS_FULLY_QUALIFIED,
  DAX_MEASURES_UNQUALIFIED,
  AVOID_DUPLICATE_MEASURES,
  MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES,
  UNNECESSARY_MEASURES,
];
