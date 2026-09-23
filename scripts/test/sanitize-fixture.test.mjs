import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeProject } from "../sanitize-fixture.mjs";

describe("sanitizeProject", () => {
  it("rewrites data paths in TMDL, drops junk, drops resources, and edits report.json to match", () => {
    const root = mkdtempSync(join(tmpdir(), "sanitize-"));
    mkdirSync(join(root, "X.SemanticModel", "definition", "tables"), { recursive: true });
    mkdirSync(join(root, "X.SemanticModel", ".pbi"), { recursive: true });
    mkdirSync(join(root, "X.Report", "StaticResources", "RegisteredResources"), {
      recursive: true,
    });
    mkdirSync(join(root, "X.Report", "CustomVisuals"), { recursive: true });
    mkdirSync(join(root, "X.Report", "definition"), { recursive: true });
    writeFileSync(
      join(root, "X.SemanticModel", "definition", "tables", "T.tmdl"),
      'partition T = m\n\t\tsource = Csv.Document(File.Contents("C:\\Users\\me\\Secret\\t.csv"))\n',
    );
    writeFileSync(join(root, "X.SemanticModel", ".pbi", "cache.abf"), "");
    writeFileSync(join(root, "X.SemanticModel", "diagramLayout.json"), "{}");
    writeFileSync(join(root, "X.Report", "StaticResources", "RegisteredResources", "logo.png"), "");
    writeFileSync(join(root, "X.Report", "CustomVisuals", "x.pbiviz"), "");
    writeFileSync(join(root, "X.pbix"), "");
    writeFileSync(
      join(root, "X.Report", "definition", "report.json"),
      JSON.stringify({
        themeCollection: {
          baseTheme: { name: "CY24SU10", type: "SharedResources" },
          customTheme: { name: "theme.json", type: "RegisteredResources" },
        },
        resourcePackages: [
          { name: "SharedResources", type: "SharedResources", items: [] },
          {
            name: "RegisteredResources",
            type: "RegisteredResources",
            items: [{ name: "logo.png" }],
          },
        ],
      }),
    );
    const counts = sanitizeProject(root);
    expect(counts).toEqual({ rewritten: 1, removed: 5, edited: 1 });
    expect(
      readFileSync(join(root, "X.SemanticModel", "definition", "tables", "T.tmdl"), "utf8"),
    ).toContain('File.Contents("C:\\Demo\\Data\\t.csv")');
    for (const gone of [
      "X.SemanticModel/.pbi",
      "X.SemanticModel/diagramLayout.json",
      "X.Report/StaticResources",
      "X.Report/CustomVisuals",
      "X.pbix",
    ])
      expect(existsSync(join(root, gone)), gone).toBe(false);
    const report = JSON.parse(
      readFileSync(join(root, "X.Report", "definition", "report.json"), "utf8"),
    );
    expect(report.themeCollection).toEqual({
      baseTheme: { name: "CY24SU10", type: "SharedResources" },
    });
    expect(report.resourcePackages).toEqual([
      { name: "SharedResources", type: "SharedResources", items: [] },
    ]);
  });

  it("rewrites absolute paths in any TMDL string, keeps a folder's trailing separator, and is idempotent", () => {
    const root = mkdtempSync(join(tmpdir(), "sanitize-"));
    mkdirSync(join(root, "X.SemanticModel", "definition"), { recursive: true });
    const file = join(root, "X.SemanticModel", "definition", "expressions.tmdl");
    writeFileSync(
      file,
      [
        "expression 'Sample File' =",
        "\t\tlet",
        '\t\t    Source = Folder.Files("Y:\\Documents\\Acme Ltd\\Raw Data\\Weather Data"),',
        '\t\t    Rows = Table.SelectRows(Source, each [Folder Path] = "Y:\\Documents\\Acme Ltd\\Raw Data\\Weather Data\\"),',
        '\t\t    Share = Csv.Document(Binary.Buffer(Web.Contents("\\\\host\\share\\people.csv"))),',
        '\t\t    Mac = Excel.Workbook(Binary.Buffer(Web.Contents("/Users/someone/Desktop/book.xlsx"))),',
        // An unclosed quote before a drive path: the match must stop at the line's end, not run on.
        '\t\t    // was "C:\\Users\\me\\Old Folder',
        "\t\t    Half = 1 / 2,",
        '\t\t    Kept = Text.Combine({"d/m/yyyy", "Support\\Helper Queries", "https://example.com/a"})',
        "\t\tin",
        "\t\t    Rows",
        "",
      ].join("\n"),
    );
    expect(sanitizeProject(root)).toEqual({ rewritten: 1, removed: 0, edited: 0 });
    const text = readFileSync(file, "utf8");
    expect(text).toContain('Folder.Files("C:\\Demo\\Data\\Weather Data")');
    expect(text).toContain('[Folder Path] = "C:\\Demo\\Data\\Weather Data\\"');
    expect(text).toContain('Web.Contents("C:\\Demo\\Data\\people.csv")');
    expect(text).toContain('Web.Contents("C:\\Demo\\Data\\book.xlsx")');
    expect(text).toContain('{"d/m/yyyy", "Support\\Helper Queries", "https://example.com/a"}');
    expect(text).toContain("\n\t\t    Half = 1 / 2,\n");
    for (const leak of ["Acme", "host", "someone"]) expect(text).not.toContain(leak);
    expect(sanitizeProject(root)).toEqual({ rewritten: 0, removed: 0, edited: 0 });
    expect(readFileSync(file, "utf8")).toBe(text);
  });
});
