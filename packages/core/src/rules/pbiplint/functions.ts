import type { ReferenceIndex } from "../../index/references.js";
import type { DaxFunction, Model } from "../../model/types.js";
import { finding, isBlank, modelPartlyRead } from "../helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

/**
 * The DAX Lib package a function was installed from: the `DAXLIB_PackageId` annotation Power BI
 * Desktop keeps when it installs a package. A package version cannot be edited, only replaced.
 */
const packageOf = (f: DaxFunction): string | undefined => f.annotations.DAXLIB_PackageId;

/**
 * A function of the model's own that nothing calls, and a DAX Lib package none of whose functions
 * anything outside the package calls, reported once on its first function. A package installs
 * all its functions, so its members are never reported one by one. A call is read from every DAX
 * the reference index holds, other functions included; a function that only an uncalled function
 * calls is not reported until that caller goes.
 */
function notCalled(model: Model, references: ReferenceIndex): RuleFinding[] {
  const calledBy = (f: DaxFunction) => references.functionCalledBy(f);
  const out: RuleFinding[] = [];
  const seen = new Set<string>();
  for (const f of model.functions) {
    const pkg = packageOf(f);
    if (pkg === undefined) {
      if (calledBy(f).length === 0) out.push(finding.function(f));
      continue;
    }
    if (seen.has(pkg)) continue;
    seen.add(pkg);
    const members = model.functions.filter((g) => packageOf(g) === pkg);
    const fromOutside = members.some((g) =>
      calledBy(g).some((o) => !(o.kind === "function" && members.includes(o.object))),
    );
    if (fromOutside) continue;
    const detail =
      members.length === 1
        ? `package ${pkg}: its one function is not called`
        : `package ${pkg}: none of its ${members.length} functions is called`;
    out.push({ ...finding.function(f), detail });
  }
  return out;
}

export const UDF_NOT_CALLED = pbiplintRule({
  id: "UDF_NOT_CALLED",
  name: "User-defined function nothing calls",
  category: "Maintenance",
  severity: 1,
  scope: ["Function"],
  layer: "model",
  // A model file pbiplint could not fully read may hold the call.
  skipWhenModelUnread: modelPartlyRead,
  check: ({ model }, { indexes: { references } }) => (model ? notCalled(model, references) : []),
});

// Tabular Editor 3's built-in rule of the same condition.
export const UDF_USE_COMPOUND_NAMES = pbiplintRule({
  id: "UDF_USE_COMPOUND_NAMES",
  name: "User-defined function with a one-word name",
  category: "Error Prevention",
  severity: 1,
  scope: ["Function"],
  layer: "model",
  check: ({ model }) =>
    (model?.functions ?? [])
      .filter((f) => !f.name.includes(".") && !f.name.includes("_"))
      .map(finding.function),
});

// Tabular Editor 3's built-in rule of the same condition, less DAX Lib package functions.
export const UDF_WITHOUT_DESCRIPTION = pbiplintRule({
  id: "UDF_WITHOUT_DESCRIPTION",
  name: "User-defined function with no description",
  category: "Maintenance",
  severity: 1,
  scope: ["Function"],
  layer: "model",
  check: ({ model }) =>
    (model?.functions ?? [])
      .filter((f) => packageOf(f) === undefined && isBlank(f.description))
      .map(finding.function),
});

export const functionRules = [UDF_NOT_CALLED, UDF_USE_COMPOUND_NAMES, UDF_WITHOUT_DESCRIPTION];
