/**
 * Whether a file's TMDL script is read as the model (#274): the declarations under a root
 * `createOrReplace` as the model's own, as Microsoft's TMDL reader applies them ("The semantics of
 * TMDL language are applied to objects within the *createOrReplace* command",
 * https://learn.microsoft.com/analysis-services/tmdl/tmdl-scripts#createorreplace-command). So it
 * is for pasted TMDL and a single file named on the command line, where a script copied from Power
 * BI Desktop's TMDL view arrives. A project saves its TMDL view tabs "as a .tmdl file in the
 * *\TMDLScripts* folder"
 * (https://learn.microsoft.com/power-bi/transform-model/desktop-tmdl-view#tmdl-script-tabs); those
 * are scratch work, not the model, so a file under a folder of that name keeps its script out.
 */
export const readsScript = (path: string): boolean => !/(^|\/)TMDLScripts\//.test(path);
