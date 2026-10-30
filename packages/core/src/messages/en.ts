/**
 * The English catalog: every message pbiplint writes, keyed by its message ID and sorted by ID,
 * so a catalog for another language is the same keys with other strings.
 *
 * A template is written in a subset of ICU MessageFormat: `{name}` for a parameter,
 * `{n, plural, one {# field} other {# fields}}` (with `=0`-style exact matches),
 * `{k, select, a {...} other {...}}`, where `other` is required, `{names, list}` for a list the
 * language joins, and `{d, date}` for a day in the language's long form. There is no quoting: an
 * apostrophe is always itself, and there are no literal braces, so whoever adds a language never
 * writes ICU's doubled apostrophe.
 */
export const EN = {
  AVOID_SHOW_ITEMS_WITH_NO_DATA: "Show items with no data is on for {roles}",
  ENSURE_ALTTEXT: "no alt text",
  ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY: "height {height}, more than {max}",
  ENSURE_THEME_COLOURS:
    "{count, plural, one {# colour} other {# colours}} set to a hex value instead of a theme colour",
  HIDE_TOOLTIP_DRILLTROUGH_PAGES:
    "{kind, select, tooltip {tooltip} other {drillthrough}} page is visible to readers",
  "INTEGER_FORMATTING.dynamicOnly": "dynamic format string only",
  "INTEGER_FORMATTING.formatString": 'format string "{format}"',
  "INTEGER_FORMATTING.none": "no format string",
  PARSE_ISSUE: "{reason}: {text}",
  "PARSE_ISSUE.unreadableProject": "{reason}",
  REDUCE_ADVANCED_FILTERS:
    "{count, plural, one {# visual} other {# visuals}} with an Advanced filter applied, more than {max}",
  REDUCE_OBJECTS_WITHIN_VISUALS:
    "{count, plural, one {# field} other {# fields}} bound, more than {max}",
  REDUCE_PAGES: "{count, plural, one {# page} other {# pages}}, more than {max}",
  REDUCE_TOPN_FILTERS:
    "{count, plural, one {# visual} other {# visuals}} with a TopN filter, more than {max}",
  REDUCE_VISUALS_ON_PAGE: "{count, plural, one {# visual} other {# visuals}}, more than {max}",
  REMOVE_UNUSED_CUSTOM_VISUALS: "{visual} is registered but no visual uses it",
  RULE_COULD_NOT_FINISH: "{rule} could not finish on {where}: {kind}",
  "context.calculationGroup": "calculation group {table}",
  "context.level": "hierarchy {hierarchy} in {table}",
  "context.role": "role {role}",
  "context.table": "table {table}",
  "date.long": "{date, date}",
  "list.more": "{count} more",
  "parse.m.modelTooLarge":
    "M is too large or complex to read (over pbiplint's limit for one model's M)",
  "parse.m.notParsed": "M could not be parsed: {message}",
  "parse.m.tooLarge": "M is too large or complex to read (over pbiplint's limit for one query)",
  "parse.pbir.conflictMarker": "merge conflict marker",
  "parse.pbir.emptyEntity":
    'entity {entity} has {state, select, missing {no} other {an empty}} "measures" list: Power BI Desktop does not open a project whose reportExtensions.json holds an entity with no measure; remove the entity, or the file when it holds no report measure',
  "parse.pbir.namedEntity": '"{name}"',
  "parse.pbir.noEntities":
    '"entities" is {state, select, missing {missing} other {empty}}: Power BI Desktop does not open a project whose reportExtensions.json lists no entity; delete the file when it holds no report measure',
  "parse.pbir.notAnObject":
    "not a JSON object (the file holds {kind, select, null {null} array {an array} string {a string} number {a number} other {a boolean}})",
  "parse.pbir.notValidJson": "not valid JSON ({message})",
  "parse.pbir.tooDeep": "nested more than {depth} levels deep",
  "parse.pbir.unnamedEntity": "an entity",
  "parse.tmdl.linesUnder":
    '"{word}" {where, select, root {at the root of a file} other {under a model}} has {under, select, declaration {a declaration} other {lines}} under it, which TMDL does not allow',
  "parse.tmdl.noName": '"{word}" is declared with no name',
  "parse.tmdl.notChildType": '"{word}" is not a type TMDL declares under a {under}',
  "parse.tmdl.notModelProperty": '"{word}" is not a property TMDL allows under a model',
  "parse.tmdl.notRootType": '"{word}" is not a type TMDL declares at the root of a file',
  "parse.tmdl.orphanDescription": "description is not followed by a declaration",
  "parse.tmdl.orphanIndentation": "orphan indentation",
  "parse.tmdl.propertyAtRoot": '"{word}" is a property, which TMDL allows only under an object',
  "parse.tmdl.spaceIndentation": "space indentation (TMDL requires tabs)",
  "parse.tmdl.tableOnlyAtRoot":
    '"{word}" is a type TMDL declares only at the root of a file or under a model',
  "parse.tmdl.unquotedName": "the name is not enclosed in single quotes as TMDL requires",
  "parse.tmdl.unrecognizedLine": "unrecognized line",
  "parse.tmdl.unterminatedFence": "unterminated code fence",
  "query.name": "query {query}",
  "query.partition": "query {query}, partition {partition}",
  quoted: '"{name}"',
  "ruleError.errorClass": "{class}",
  "ruleError.notAnError": "a value that is not an Error",
  "ruleError.outOfStack": "{class} (out of stack space)",
  "ruleError.theModel": "the model",
  "ruleError.theReport": "the report",
} as const;

export type MessageId = keyof typeof EN;
