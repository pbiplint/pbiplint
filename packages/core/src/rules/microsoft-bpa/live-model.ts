import { liveModelRule } from "./define.js";

/** Rules that read VertiPaq statistics stored as annotations by a Tabular Editor script. Files never carry them. */
export const liveModelRules = [
  liveModelRule("AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS"),
  liveModelRule("REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY"),
  liveModelRule("SPLIT_DATE_AND_TIME"),
  liveModelRule("LARGE_TABLES_SHOULD_BE_PARTITIONED"),
  liveModelRule("FIX_REFERENTIAL_INTEGRITY_VIOLATIONS"),
];
