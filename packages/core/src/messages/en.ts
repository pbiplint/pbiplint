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
  ACTION_WITHOUT_DESTINATION:
    "{action, select, pageNavigation {Page navigation} drillthrough {Drillthrough} other {Bookmark}} action has no destination",
  AVOID_SHOW_ITEMS_WITH_NO_DATA: "Show items with no data is on for {roles}",
  BROKEN_ACTION_TARGET:
    '{action, select, pageNavigation {Page navigation action points at page} drillthrough {Drillthrough action points at page} other {Bookmark action points at bookmark}} "{target}", which does not exist',
  "BROKEN_BOOKMARK_REFERENCE.activePage": 'active page "{page}" does not exist',
  "BROKEN_BOOKMARK_REFERENCE.capturedPage": 'captured page "{page}" does not exist',
  "BROKEN_BOOKMARK_REFERENCE.capturedVisual": 'captured visual "{visual}" is not on page "{page}"',
  "BROKEN_BOOKMARK_REFERENCE.targetVisuals":
    '{count, plural, one {target visual {visuals, list} is} other {target visuals {visuals, list} are}} not on page "{page}"',
  DEFAULT_PAGE_NAME:
    '"{name}" {pattern, select, new {is the name Power BI Desktop gives a new page} duplicate {is the name Power BI Desktop gives a duplicated page} other {is named as a copy}}',
  ENSURE_ALTTEXT: "no alt text",
  ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY: "height {height}, more than {max}",
  ENSURE_THEME_COLOURS:
    "{count, plural, one {# colour} other {# colours}} set to a hex value instead of a theme colour",
  FILTERS_PANE_STATE:
    "{source, select, saved {saved} other {not recorded, read as}} {state, select, open {open} closed {closed} other {hidden from readers}}; the policy expects {expect, select, open {open} other {closed}}",
  "HARDCODED_YEAR_IN_FILTER.fixedYears":
    "{count, plural, one {fixed year {years, list}} other {fixed years {years, list}}}",
  "HARDCODED_YEAR_IN_FILTER.onField": "{kept} on {field}",
  "HARDCODED_YEAR_IN_FILTER.yearRange": "years {from} to {to}",
  "HARDCODED_YEAR_IN_FILTER.yearsUpTo": "years up to {year}",
  "HIDDEN_VISUAL_WITH_FIELDS.groupHidden":
    "{count, plural, one {# field} other {# fields}} bound, hidden with {group}",
  "HIDDEN_VISUAL_WITH_FIELDS.visualHidden": "{count, plural, one {# field} other {# fields}} bound",
  HIDE_TOOLTIP_DRILLTROUGH_PAGES:
    "{kind, select, tooltip {tooltip} other {drillthrough}} page is visible to readers",
  "INTEGER_FORMATTING.dynamicOnly": "dynamic format string only",
  "INTEGER_FORMATTING.formatString": 'format string "{format}"',
  "INTEGER_FORMATTING.none": "no format string",
  "LANDING_PAGE_NOT_SET.activeMissing":
    'no landing page set; the active page "{page}" does not exist',
  "LANDING_PAGE_NOT_SET.opensOn":
    'opens on "{page}", {by, select, first {the first page} other {the page open when it was saved}}',
  "OPENING_PAGE_INVALID.hidden": 'active page "{page}" is hidden from readers',
  "OPENING_PAGE_INVALID.missing":
    '{by, select, landing {landing} other {active}} page "{page}" does not exist',
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
  REPORT_LEVEL_MEASURES: 'defined in the report on table "{table}"',
  RULE_COULD_NOT_FINISH: "{rule} could not finish on {where}: {kind}",
  "SLICER_SEARCH_SAVED.term": 'opens with the search term "{term}" saved',
  "SLICER_SEARCH_SAVED.termUnread": "opens with a search term saved",
  SLICER_SELECTION_SAVED: "opens with this selection applied",
  "TAB_ORDER_FOLLOWS_LAYOUT.inGroup": "in {group}, {disagreement}",
  "TAB_ORDER_FOLLOWS_LAYOUT.startsAt":
    "tab order starts at {tabVisual} but the layout reads {layoutVisual} first",
  "TAB_ORDER_FOLLOWS_LAYOUT.visits":
    "tab order visits {tabVisual} where the layout reads {layoutVisual}",
  "VISUAL_OUTSIDE_PAGE.both": "{right} px past the right edge, {bottom} px past the bottom edge",
  "VISUAL_OUTSIDE_PAGE.bottom": "{bottom} px past the bottom edge",
  "VISUAL_OUTSIDE_PAGE.right": "{right} px past the right edge",
  VISUAL_WITHOUT_FIELDS: "no fields bound",
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
