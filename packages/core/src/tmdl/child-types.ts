/**
 * The child object types TMDL allows under each object type, lower-cased as the parser records a
 * type (#144). A declaration, a word followed by a name, under one of these objects whose word is
 * not listed for it is a parse issue: Power BI refuses the file, and the model would drop the line
 * with everything under it. Flags, properties, and expressions with no name are not checked, nor is
 * anything under an object not listed here, such as `refreshPolicy`.
 *
 * Checked on October 3, 2026, and a pair is reported only when both of the first two agree:
 * - Microsoft's TMDL reader, through Tabular Editor 3's CLI 0.7.1.2 (`te list`), on copies of the
 *   rule-zoo, kitchen-sink, te3-zoo, tvw-baseline, and shelfmart fixtures with one line added at
 *   the end of the parent's block. Every pair listed here loads, but those named below. Among
 *   those it refuses: `columm` and `level` under a table ("Unsupported child"), `measure` under a
 *   column, `column` under a hierarchy and under a query group, a named `kpi` under a measure,
 *   `calculationItem` under a table, `columnPermission` under a role, `extendedProperty` under a
 *   calculation group and a query group, and `annotation` and `extendedProperty` under a
 *   calculation item and a calendar.
 * - The Tabular Object Model's class reference on Microsoft Learn, where each class's collections
 *   name the objects it holds: https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular
 *   followed by `.table`, `.column`, `.measure`, `.kpi`, `.hierarchy`, `.level`, `.partition`,
 *   `.variation`, `.relationship`, `.namedexpression`, `.function`, `.modelrole`,
 *   `.modelrolemember`, `.tablepermission`, `.columnpermission`, `.perspective`,
 *   `.perspectivetable`, `.perspectivecolumn`, `.perspectivemeasure`, `.perspectivehierarchy`,
 *   `.calculationgroup`, `.calculationitem`, `.calendar`, or `.querygroup`. Calculation items and
 *   calendars have no Annotations or ExtendedProperties; calculation groups and query groups have
 *   no ExtendedProperties.
 * - The 23,457 TMDL files of the local corpus, every one of whose 34 parent and child pairs
 *   (outside a culture's translations and TMDL scripts) is listed here.
 *
 * Refused by te 0.7.1.2, not reported, since the parent's class holds a collection of them: a
 * named `set` (Table.Sets) and `changedProperty` (ChangedProperties) under a table, and a named
 * `calendarColumnGroup`, `timeUnitColumnAssociation`, or `timeRelatedColumnGroup` under a calendar
 * (Calendar.CalendarColumnGroups). `changedProperty` is allowed wherever a class has the
 * collection, and `perspectiveSet` (PerspectiveTable.PerspectiveSets) is allowed untested.
 *
 * The model and its database are checked in root-types.ts (#137), and a `table` anywhere but under
 * a model in parse.ts (#135).
 */
const ANNOTATED = ["annotation", "extendedproperty"];
/** The child word of a class's ChangedProperties collection, on the classes Learn gives one. */
const CHANGED = "changedproperty";

const CHILD_TYPES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries({
    table: [
      "column",
      "measure",
      "hierarchy",
      "partition",
      "calendar",
      "set",
      CHANGED,
      ...ANNOTATED,
    ],
    column: ["variation", CHANGED, ...ANNOTATED],
    measure: [CHANGED, ...ANNOTATED],
    kpi: ANNOTATED,
    hierarchy: ["level", CHANGED, ...ANNOTATED],
    level: [CHANGED, ...ANNOTATED],
    partition: ANNOTATED,
    variation: ANNOTATED,
    relationship: [CHANGED, ...ANNOTATED],
    expression: ANNOTATED,
    function: [CHANGED, ...ANNOTATED],
    role: ["member", "tablepermission", ...ANNOTATED],
    member: ANNOTATED,
    tablepermission: ["columnpermission", ...ANNOTATED],
    columnpermission: ANNOTATED,
    perspective: ["perspectivetable", ...ANNOTATED],
    perspectivetable: [
      "perspectivecolumn",
      "perspectivemeasure",
      "perspectivehierarchy",
      "perspectiveset",
      ...ANNOTATED,
    ],
    perspectivecolumn: ANNOTATED,
    perspectivemeasure: ANNOTATED,
    perspectivehierarchy: ANNOTATED,
    calculationgroup: ["calculationitem", "annotation"],
    calculationitem: [],
    calendar: ["calendarcolumngroup", "timeunitcolumnassociation", "timerelatedcolumngroup"],
    querygroup: ["annotation"],
  }).map(([parent, children]) => [parent, new Set(children)]),
);

/** Whether the parser checks the declarations under an object of `parentType` (lower-cased). */
export const checksChildren = (parentType: string): boolean => CHILD_TYPES.has(parentType);

/**
 * Whether TMDL allows a declaration of `type` under an object of `parentType`, which
 * `checksChildren` lists. TMDL reads keywords without regard to case.
 */
export const allowsChild = (parentType: string, type: string): boolean =>
  CHILD_TYPES.get(parentType)?.has(type.toLowerCase()) ?? true;
