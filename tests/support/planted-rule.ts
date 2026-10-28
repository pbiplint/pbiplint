import { eachQuery } from "../../packages/core/src/rules/m-helpers.js";
import type { Rule } from "../../packages/core/src/rules/types.js";

/**
 * A rule that fails with the model's text in every message (v3 spec, section 11.3): for each query
 * it throws an `Error` whose message is the query's M, then throws a `TypeError` out of `check`
 * whose message is every query's M. Linting m-zoo with it added plants each made-up credential in
 * a thrown message, so the secret guard proves no rule error's message reaches an output.
 */
export function plantedLeakRule(): Rule {
  return {
    id: "PLANTED_LEAK",
    name: "Planted leak",
    category: "Error Prevention",
    severity: 2,
    scope: [],
    layer: "powerquery",
    needs: ["model"],
    description: "",
    references: [],
    status: "ported",
    check(_project, ctx) {
      const queries = ctx.indexes.m.queries;
      eachQuery(ctx, queries, (q) => {
        throw new Error(q.text);
      });
      throw new TypeError(queries.map((q) => q.text).join("\n"));
    },
  };
}
