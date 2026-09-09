import type { Relationship } from "../../model/types.js";
import {
  allCalculationItems,
  allColumns,
  allMeasures,
  allTablePermissions,
  dataType,
  escapeRegExp,
  finding,
  tablesInScope,
} from "../helpers.js";
import type { RuleContext } from "../types.js";
import { bpaRule } from "./define.js";

const isManyToMany = (r: Relationship): boolean =>
  r.fromCardinality === "many" && r.toCardinality === "many";
const isBidirectional = (r: Relationship): boolean => r.crossFilteringBehavior === "bothdirections";

export const RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE = bpaRule(
  "RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE",
  (m, { indexes: { relationships } }: RuleContext) =>
    allColumns(m)
      .filter(
        (c) => relationships.forColumn(c.table.name, c.name).length > 0 && dataType(c) !== "int64",
      )
      .map(finding.column),
);

// Quirk kept on purpose: the source compares FromColumn.Name to the column's name only, not table plus
// column, so a dimension key that shares its name with the foreign key is flagged as well.
export const HIDE_FOREIGN_KEYS = bpaRule(
  "HIDE_FOREIGN_KEYS",
  (m, { indexes: { relationships } }: RuleContext) =>
    allColumns(m)
      .filter(
        (c) =>
          !c.isHidden &&
          relationships
            .forColumn(c.table.name, c.name)
            .some((r) => r.fromColumn === c.name && r.fromCardinality === "many"),
      )
      .map(finding.column),
);

export const MARK_PRIMARY_KEYS = bpaRule(
  "MARK_PRIMARY_KEYS",
  (m, { indexes: { relationships } }: RuleContext) =>
    allColumns(m)
      .filter(
        (c) =>
          !c.isKey &&
          c.table.dataCategory !== "Time" &&
          relationships
            .forColumn(c.table.name, c.name)
            .some(
              (r) =>
                r.toTable === c.table.name && r.toColumn === c.name && r.toCardinality === "one",
            ),
      )
      .map(finding.column),
);

export const REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES = bpaRule(
  "REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES",
  (m, { indexes: { relationships } }: RuleContext) => {
    const all = allColumns(m);
    return all
      .filter(
        (c) =>
          relationships.forColumn(c.table.name, c.name).length === 0 &&
          all.some(
            (o) =>
              o.name === c.name &&
              o.table !== c.table &&
              relationships.forTable(o.table.name).some((r) => r.fromTable === c.table.name),
          ),
      )
      .map(finding.column);
  },
);

export const SNOWFLAKE_SCHEMA_ARCHITECTURE = bpaRule(
  "SNOWFLAKE_SCHEMA_ARCHITECTURE",
  (m, { indexes: { relationships } }: RuleContext) =>
    tablesInScope(m)
      .filter((t) => {
        const rels = relationships.forTable(t.name);
        return rels.some((r) => r.fromTable === t.name) && rels.some((r) => r.toTable === t.name);
      })
      .map(finding.table),
);

export const ENSURE_TABLES_HAVE_RELATIONSHIPS = bpaRule(
  "ENSURE_TABLES_HAVE_RELATIONSHIPS",
  (m, { indexes: { relationships } }: RuleContext) =>
    tablesInScope(m)
      .filter((t) => relationships.forTable(t.name).length === 0)
      .map(finding.table),
);

export const MANY_TO_MANY_RELATIONSHIPS_SHOULD_BE_SINGLE_DIRECTION = bpaRule(
  "MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION",
  (m) =>
    m.relationships.filter((r) => isManyToMany(r) && isBidirectional(r)).map(finding.relationship),
);

export const CHECK_IF_BIDIRECTIONAL_AND_MANY_TO_MANY_RELATIONSHIPS_ARE_VALID = bpaRule(
  "CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID",
  (m) =>
    m.relationships.filter((r) => isManyToMany(r) || isBidirectional(r)).map(finding.relationship),
);

export const RELATIONSHIP_COLUMNS_SAME_DATA_TYPE = bpaRule(
  "RELATIONSHIP_COLUMNS_SAME_DATA_TYPE",
  (m) => {
    const column = (table: string, name: string) =>
      m.tables.find((t) => t.name === table)?.columns.find((c) => c.name === name);
    return m.relationships
      .filter((r) => {
        const from = column(r.fromTable, r.fromColumn);
        const to = column(r.toTable, r.toColumn);
        return from !== undefined && to !== undefined && dataType(from) !== dataType(to);
      })
      .map(finding.relationship);
  },
);

// The source builds its regex from raw names; names are escaped here so a table called "Date (Order)"
// cannot break the pattern. Argument order matters: USERELATIONSHIP(to, from) does not count, as in the source.
export const INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED = bpaRule(
  "INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED",
  (m) => {
    const expressions = [
      ...allMeasures(m).map((x) => x.expression),
      ...allCalculationItems(m).map((i) => i.expression),
    ];
    return m.relationships
      .filter((r) => {
        if (r.isActive) return false;
        const re = new RegExp(
          `USERELATIONSHIP\\s*\\(\\s*'*${escapeRegExp(r.fromTable)}'*\\[${escapeRegExp(r.fromColumn)}\\]\\s*,\\s*'*${escapeRegExp(r.toTable)}'*\\[${escapeRegExp(r.toColumn)}\\]`,
          "i",
        );
        return !expressions.some((e) => re.test(e));
      })
      .map(finding.relationship);
  },
);

// A relationship that is both bi-directional and many-to-many counts twice, as in the source.
export const AVOID_EXCESSIVE_BIDIRECTIONAL_OR_MANY_TO_MANY_RELATIONSHIPS = bpaRule(
  "AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS",
  (m) => {
    const rels = m.relationships;
    const count = rels.filter(isBidirectional).length + rels.filter(isManyToMany).length;
    return count / Math.max(rels.length, 1) > 0.3 ? [finding.model(m)] : [];
  },
);

export const AVOID_USING_MANY_TO_MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY =
  bpaRule(
    "AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY",
    (m, { indexes: { relationships } }: RuleContext) => {
      const permissions = allTablePermissions(m);
      return m.tables
        .filter(
          (t) =>
            t.kind === "table" &&
            relationships.forTable(t.name).some(isManyToMany) &&
            permissions.some((tp) => tp.table === t.name && (tp.filter ?? "").length > 0),
        )
        .map(finding.table);
    },
  );

export const relationshipRules = [
  RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE,
  HIDE_FOREIGN_KEYS,
  MARK_PRIMARY_KEYS,
  REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES,
  SNOWFLAKE_SCHEMA_ARCHITECTURE,
  ENSURE_TABLES_HAVE_RELATIONSHIPS,
  MANY_TO_MANY_RELATIONSHIPS_SHOULD_BE_SINGLE_DIRECTION,
  CHECK_IF_BIDIRECTIONAL_AND_MANY_TO_MANY_RELATIONSHIPS_ARE_VALID,
  RELATIONSHIP_COLUMNS_SAME_DATA_TYPE,
  INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED,
  AVOID_EXCESSIVE_BIDIRECTIONAL_OR_MANY_TO_MANY_RELATIONSHIPS,
  AVOID_USING_MANY_TO_MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY,
];
