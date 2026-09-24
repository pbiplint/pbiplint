/**
 * The words TMDL puts at the root of a file, lower-cased as the parser records a type. Checked on
 * September 24, 2026 against the TMDL overview on Microsoft Learn (its folder structure, and the
 * indentation section's list of Database and Model children that sit at the root),
 * https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview; the Model class's child
 * collections in the Tabular Object Model, where the overview is silent on a keyword,
 * https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.model (with
 * BindingInfo, https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.bindinginfo);
 * TMDL scripts, https://learn.microsoft.com/analysis-services/tmdl/tmdl-scripts; and the
 * Desktop-saved TMDL under tests/fixtures and examples.
 *
 * A root object of any other type is a parse issue. Only the root is checked: a misspelt keyword
 * under a known object, such as `columm Amount` under a table, still parses as a generic child.
 */
/** The types `model/build.ts` reads into the model. */
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
 * Types TMDL defines at the root that the model does not hold. `createOrReplace` is the command a
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

/** Whether TMDL defines `type` at the root of a file. TMDL reads keywords without regard to case. */
export const isRootType = (type: string): boolean => KNOWN.has(type.toLowerCase());
