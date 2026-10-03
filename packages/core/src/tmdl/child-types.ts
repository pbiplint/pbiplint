/**
 * The child object types TMDL allows under each object type, lower-cased as the parser records a
 * type (#144). A declaration, a word followed by a name, under one of these objects whose word is
 * not listed for it is a parse issue: Power BI refuses the file, and the model would drop the line
 * with everything under it. Flags, properties, and expressions with no name are not checked, nor is
 * anything under an object not listed here, such as `refreshPolicy`.
 *
 * Checked on October 3, 2026:
 * - Microsoft's TMDL reader, through Tabular Editor 3's CLI 0.7.1.2 (`te list`), on copies of the
 *   rule-zoo, kitchen-sink, te3-zoo, tvw-baseline, and shelfmart fixtures with one line added at
 *   the end of the parent's block. Every pair listed here loads. The reader refuses `columm` and
 *   `level` under a table ("Unsupported child"), `measure` under a column, `column` under a
 *   hierarchy and under a query group, a named `kpi` under a measure, `calculationItem` under a
 *   table, and `columnPermission` under a role.
 * - The Tabular Object Model's class reference on Microsoft Learn, where each class's collections
 *   name the objects it holds,
 *   https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular (TODO: per-class URLs).
 * - The 23,457 TMDL files of the local corpus, every one of whose 34 parent and child pairs
 *   (outside a culture's translations and TMDL scripts) is listed here.
 *
 * The model and its database are checked in root-types.ts (#137), and a `table` anywhere but under
 * a model in parse.ts (#135).
 */
const ANNOTATED = ["annotation", "extendedproperty"];

const CHILD_TYPES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries({
    table: ["column", "measure", "hierarchy", "partition", "calendar", ...ANNOTATED],
    column: ["variation", ...ANNOTATED],
    measure: ANNOTATED,
    kpi: ANNOTATED,
    hierarchy: ["level", ...ANNOTATED],
    level: ANNOTATED,
    partition: ANNOTATED,
    variation: ANNOTATED,
    relationship: ANNOTATED,
    expression: ANNOTATED,
    function: ANNOTATED,
    role: ["member", "tablepermission", ...ANNOTATED],
    member: ANNOTATED,
    tablepermission: ["columnpermission", ...ANNOTATED],
    columnpermission: ANNOTATED,
    perspective: ["perspectivetable", ...ANNOTATED],
    perspectivetable: [
      "perspectivecolumn",
      "perspectivemeasure",
      "perspectivehierarchy",
      ...ANNOTATED,
    ],
    perspectivecolumn: ANNOTATED,
    perspectivemeasure: ANNOTATED,
    perspectivehierarchy: ANNOTATED,
    calculationgroup: ["calculationitem", "annotation"],
    calculationitem: [],
    calendar: [],
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
