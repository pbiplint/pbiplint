import { allPartitions, finding, namedObjects } from "../helpers.js";
import type { Rule } from "../types.js";
import { bpaRule, mapScope, metaOf } from "./define.js";

/** A rule over every object in the rule's own scope, testing name and description. */
const namedObjectRule = (
  id: string,
  test: (name: string, description: string | undefined) => boolean,
): Rule =>
  bpaRule(id, (m) =>
    namedObjects(m, mapScope(metaOf(id).scope))
      .filter((o) => test(o.name, o.description))
      .map((o) => o.finding),
  );

const startsOrEndsWithSpace = (name: string): boolean => name.startsWith(" ") || name.endsWith(" ");

export const TRIM_OBJECT_NAMES = namedObjectRule("TRIM_OBJECT_NAMES", startsOrEndsWithSpace);

export const OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE = namedObjectRule(
  "OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE",
  startsOrEndsWithSpace,
);

export const SPECIAL_CHARS_IN_OBJECT_NAMES = namedObjectRule(
  "SPECIAL_CHARS_IN_OBJECT_NAMES",
  (name) => /[\t\n\r]/.test(name),
);

// .NET char.IsControl minus char.IsWhiteSpace: U+0000..U+001F and U+007F..U+009F, except U+0009..U+000D and U+0085.
// eslint-disable-next-line no-control-regex -- matching control characters is the whole point of these two rules
const CONTROL_NOT_WHITESPACE = /[\x00-\x08\x0E-\x1F\x7F-\x84\x86-\x9F]/;

export const AVOID_INVALID_NAME_CHARACTERS = namedObjectRule(
  "AVOID_INVALID_NAME_CHARACTERS",
  (name) => CONTROL_NOT_WHITESPACE.test(name),
);

export const AVOID_INVALID_DESCRIPTION_CHARACTERS = namedObjectRule(
  "AVOID_INVALID_DESCRIPTION_CHARACTERS",
  (_name, description) => CONTROL_NOT_WHITESPACE.test(description ?? ""),
);

export const FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED = namedObjectRule(
  "FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED",
  (name) => name.length > 0 && name.slice(0, 1).toUpperCase() !== name.slice(0, 1),
);

export const PERSPECTIVES_WITH_NO_OBJECTS = bpaRule("PERSPECTIVES_WITH_NO_OBJECTS", (m) =>
  m.perspectives.filter((p) => p.tables.length === 0).map(finding.perspective),
);

export const CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS = bpaRule(
  "CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS",
  (m) =>
    m.tables
      .filter((t) => t.calculationGroup !== undefined && t.calculationGroup.items.length === 0)
      .map(finding.table),
);

export const REMOVE_ROLES_WITH_NO_MEMBERS = bpaRule("REMOVE_ROLES_WITH_NO_MEMBERS", (m) =>
  m.roles.filter((r) => r.members.length === 0).map(finding.role),
);

// Table.SourceExpression in the source is approximated by every partition's query or M text.
export const REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS = bpaRule(
  "REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS",
  (m) => {
    const partitions = allPartitions(m);
    return m.dataSources
      .filter(
        (ds) =>
          !partitions.some((p) => p.dataSource === ds.name) &&
          !partitions.some((p) => (p.source ?? "").includes(ds.name)),
      )
      .map(finding.dataSource);
  },
);

export const AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS = bpaRule(
  "AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS",
  (m) =>
    allPartitions(m)
      .filter(
        (p) =>
          p.sourceType === "query" &&
          m.dataSources.some((ds) => ds.name === p.dataSource && ds.kind === "structured"),
      )
      .map(finding.partition),
);

export const namingRules = [
  TRIM_OBJECT_NAMES,
  OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE,
  SPECIAL_CHARS_IN_OBJECT_NAMES,
  AVOID_INVALID_NAME_CHARACTERS,
  AVOID_INVALID_DESCRIPTION_CHARACTERS,
  FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED,
  PERSPECTIVES_WITH_NO_OBJECTS,
  CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS,
  REMOVE_ROLES_WITH_NO_MEMBERS,
  REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS,
  AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS,
];
