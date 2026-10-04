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
 * word, and so is an annotation or an extended property with lines under it (parse.ts). The
 * overview's list is of the objects that need no indentation, so they may also sit indented under
 * the `model` they belong to, and the `model` under its `database`. There, a declaration of a type
 * TMDL does not declare under a model, and under the database any declaration but the model, is
 * an issue too, and so is a property under the model whose word is a type TMDL does declare there
 * (#137). Under the model's objects, child-types.ts lists the declarations each holds (#144), such
 * as a table's columns, so a misspelt `columm Amount` under a table is an issue too. A `table` line
 * under anything but a model, as a culture's translations and a TMDL script nest one, is an issue
 * (#135).
 */
/** The types `model/build.ts` reads into the model. Keep in step with its declaration switch. */
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
/**
 * Whether TMDL declares an object of `type` directly under a model, as it reads one at the root
 * (#137): each type it allows at the root but the model itself, the database that holds it, and a
 * script's command. Microsoft's TMDL reader, run through Tabular Editor 3's CLI on September 29,
 * 2026, reads each of them under a model and refuses those three, `column`, `measure`, and a
 * misspelt word there.
 */
export const isModelChildType = (type: string): boolean => {
  const t = type.toLowerCase();
  return KNOWN.has(t) && t !== "model" && t !== "database" && t !== "createorreplace";
};
/**
 * Whether the model reads a root declaration of `type` by its name, so one written with no name
 * declares nothing it can read (#135): every modeled type but `model`, which the model reads as
 * the model whatever it is called.
 */
export const isNamedRootType = (type: string): boolean => {
  const t = type.toLowerCase();
  return t !== "model" && MODELED.includes(t);
};
