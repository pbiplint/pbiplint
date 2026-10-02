import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { buildModel } from "../src/model/build.js";
import { NAME_WITHOUT_TRANSLATION } from "../src/rules/pbiplint/translations.js";
import { parseTmdl } from "../src/tmdl/parse.js";

type File = [path: string, text: string];

/** The rule's findings on a model saved as Power BI Desktop saves one, a file per culture. */
const findings = (...files: File[]) => {
  const model = buildModel(files.map(([path, text]) => parseTmdl(path, text)));
  return NAME_WITHOUT_TRANSLATION.check(
    { model },
    { indexes: buildIndexes({ model }), options: {} },
  ).map((f) => [f.objectName, f.detail]);
};

const model = (culture?: string): File => [
  "definition/model.tmdl",
  ["model Model", ...(culture ? [`\tculture: ${culture}`] : [])].join("\n") + "\n",
];
const sales: File = [
  "definition/tables/Sales.tmdl",
  [
    "table Sales",
    "\tmeasure Total = 1",
    "\tmeasure Internal = 1",
    "\t\tisHidden",
    "\tcolumn Amount",
    "\t\tdataType: decimal",
    "\tcolumn Key",
    "\t\tdataType: int64",
    "\t\tisHidden",
    "\thierarchy Geography",
    "\t\tlevel Country",
    "\t\t\tcolumn: Amount",
    "\t\tlevel City",
    "\t\t\tcolumn: Amount",
  ].join("\n"),
];
const hidden: File = [
  "definition/tables/Budget.tmdl",
  "table Budget\n\tisHidden\n\tmeasure 'Budget Total' = 1\n",
];
const calcGroup: File = [
  "definition/tables/Time Intelligence.tmdl",
  [
    "table 'Time Intelligence'",
    "\tcalculationGroup",
    "\t\tcalculationItem Current = SELECTEDMEASURE()",
    "\tcolumn Name",
    "\t\tdataType: string",
  ].join("\n"),
];
/** A culture file whose `translations` block captions what `lines` gives, under `model Model`. */
const culture = (name: string, lines: string[]): File => [
  `definition/cultures/${name}.tmdl`,
  [`cultureInfo ${name}`, "\ttranslations", "\t\tmodel Model", ...lines].join("\n") + "\n",
];
/** A culture file with linguistic metadata only, as Desktop writes for the model's own language. */
const linguistic = (name: string): File => [
  `definition/cultures/${name}.tmdl`,
  `cultureInfo ${name}\n\tlinguisticMetadata = {"Version": "2.0.0"}\n\t\tcontentType: json\n`,
];
const frFR = culture("fr-FR", [
  "\t\t\ttable Sales",
  "\t\t\t\tcaption: Ventes",
  "\t\t\t\tcolumn Amount",
  "\t\t\t\t\tcaption: Montant",
  "\t\t\t\thierarchy Geography",
  "\t\t\t\t\tcaption: Géographie",
  "\t\t\t\t\tlevel Country",
  "\t\t\t\t\t\tcaption: Pays",
]);

describe("NAME_WITHOUT_TRANSLATION", () => {
  it("reports each visible table, column, measure, hierarchy, and level a translated culture does not caption", () => {
    expect(findings(model("en-US"), sales, hidden, calcGroup, linguistic("en-US"), frFR)).toEqual([
      ["[Total]", "no caption in fr-FR"],
      ["City", "hierarchy Geography in 'Sales', no caption in fr-FR"],
      ["'Time Intelligence'", "no caption in fr-FR"],
      ["'Time Intelligence'[Name]", "no caption in fr-FR"],
    ]);
  });
  it("skips the model's own culture and a culture with no translations block", () => {
    const own = culture("en-US", []);
    expect(findings(model("en-US"), sales, own, linguistic("de-DE"))).toEqual([]);
  });
  it("reads every culture with a block when the model names no culture of its own, and lists each culture, in file order", () => {
    const de = culture("de-DE", ["\t\t\ttable Sales", "\t\t\t\tcaption: Verkauf"]);
    const table = ["definition/tables/Sales.tmdl", "table Sales\n\tmeasure Total = 1\n"] as File;
    expect(findings(model(), table, frFR, de)).toEqual([
      ["[Total]", "no caption in de-DE and fr-FR"],
    ]);
  });
  it("counts a caption equal to the object's name, and not a blank one", () => {
    const table = ["definition/tables/Sales.tmdl", "table Sales\n\tmeasure Total = 1\n"] as File;
    const same = culture("fr-FR", [
      "\t\t\ttable Sales",
      "\t\t\t\tcaption: Sales",
      "\t\t\t\tmeasure Total",
      '\t\t\t\t\tcaption: " "',
    ]);
    expect(findings(model("en-US"), table, same)).toEqual([["[Total]", "no caption in fr-FR"]]);
  });
});
