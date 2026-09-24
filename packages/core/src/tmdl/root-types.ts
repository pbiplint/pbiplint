/**
 * The words TMDL allows at the root of a file, lower-cased as the parser records a type. Checked on
 * September 24, 2026 against the TMDL overview on Microsoft Learn (its folder structure, and the
 * Indentation section's list of Database and Model children that sit at the root),
 * https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview; the Model class's child
 * collections in the Tabular Object Model, where the overview is silent,
 * https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.model; TMDL scripts,
 * https://learn.microsoft.com/analysis-services/tmdl/tmdl-scripts; and the Desktop-saved TMDL
 * under tests/fixtures and examples.
 *
 * No Learn page spells two of the words. `extendedProperty` is how Microsoft's sample PBIP spells
 * it, under a column at line 26 of
 * https://github.com/microsoft/Analysis-Services/blob/master/pbidevmode/fabricps-pbip/SamplePBIP/Sales.SemanticModel/definition/tables/Parameter%20-%20Measure.tmdl,
 * while the overview's list puts model-level ones at the root (TOM's type names do not settle a
 * TMDL word: TOM's Culture is written `cultureInfo`).
 * `bindingInfo` is TOM's ObjectType.BindingInfo,
 * https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.objecttype, and its
 * TMDL spelling is shown only in Chris Webb's post, which is not Microsoft documentation,
 * https://blog.crossjoin.co.uk/2026/05/03/connecting-power-bi-semantic-models-to-data-sources-automatically-with-binding-hints/
 *
 * Any other word declared at the root is a parse issue, a misspelt `table` and a `column` that
 * lost its tab alike. A property or an expression with no name is one at the root whatever its
 * word, and so is an annotation or an extended property with lines under it (parse.ts). Only the
 * root is checked: a misspelt keyword under a known object, such as `columm Amount` under a table,
 * still parses as a generic child.
 */
/** The types `model/build.ts` reads into the model. Keep in step with its root switch. */
const MODELED = [
  "model",
  "annotation",
  "table",
  "relationship",
  "role",
  "perspective",
  "cultureinfo",
  "expression",
  "function",
  "datasource",
];
/**
 * Words TMDL allows at the root that the model does not hold. `createOrReplace` is the command a
 * TMDL script opens with (Desktop saves TMDL view tabs as .tmdl files in the project). `ref` lines
 * are read before this check; one with no name, such as `ref table`, keeps the parser's reading.
 */
const NOT_MODELED = [
  "database",
  "querygroup",
  "extendedproperty",
  "bindinginfo",
  "createorreplace",
  "ref",
];

const KNOWN = new Set([...MODELED, ...NOT_MODELED]);

/** Whether TMDL allows `type` at the root of a file. TMDL reads keywords without regard to case. */
export const isRootType = (type: string): boolean => KNOWN.has(type.toLowerCase());
