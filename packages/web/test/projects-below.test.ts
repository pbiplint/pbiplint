import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { UsageError } from "../../cli/src/args.js";
import { resolveProject } from "../../cli/src/walk.js";
import {
  emptyTree,
  InputError,
  isModelFolder,
  isReportFolder,
  selectProject,
  type InputTree,
} from "../src/input/project-files.js";
import { markerOf, SKIP_DIRS, wanted } from "../src/input/read-drop.js";

// The CLI and the browser on the same folders on disk, below which projects sit (#174): each
// lints the same files with the same notices, or lists the same projects. walk.test.ts and
// project-files.test.ts hold each to its own words; this holds the two to each other.

const sample = fileURLToPath(new URL("../../../examples/messy-sales", import.meta.url));
const j = (v: unknown) => JSON.stringify(v);

/** What a drop of `root` hands selectProject, walked as the drop's walker walks it. */
function dropOf(root: string): InputTree {
  const tree = emptyTree();
  const walk = (dir: string): void => {
    for (const d of readdirSync(join(root, "..", dir), { withFileTypes: true })) {
      const path = `${dir}/${d.name}`;
      if (d.isDirectory()) {
        if (SKIP_DIRS.has(d.name)) continue;
        if (isModelFolder(d.name)) tree.modelFolders.push(path);
        if (isReportFolder(d.name)) tree.reportFolders.push(path);
        walk(path);
        continue;
      }
      const marker = markerOf(path);
      if (marker) tree.markers.push(marker);
      else if (wanted(path))
        tree.entries.push({ path, text: readFileSync(join(root, "..", path), "utf8") });
    }
  };
  walk(basename(root));
  return tree;
}

/** What one surface made of a folder: what it linted and said, or the projects it listed. */
type Outcome =
  | {
      files: string[];
      absent: object;
      diagnostics: [string, string | undefined][];
    }
  | { listed: string[] };

const byName = (a: string, b: string): number => a.localeCompare(b, "en");

function cli(root: string): Outcome {
  try {
    const p = resolveProject(root);
    return {
      files: [...(p.model?.files ?? []), ...(p.report?.files ?? [])]
        .map((f) => f.path)
        .sort(byName),
      absent: p.absent,
      diagnostics: p.diagnostics.map((d) => [d.kind, d.path]),
    };
  } catch (e) {
    if (!(e instanceof UsageError) || e.lines.length === 0) throw e;
    return { listed: e.lines.map((l) => l.slice(2, l.indexOf(": pbiplint "))) };
  }
}

function browser(root: string): Outcome {
  try {
    const p = selectProject(dropOf(root));
    return {
      files: p.files.map((f) => f.path).sort(byName),
      absent: p.absent,
      diagnostics: p.diagnostics.map((d) => [d.kind, d.path]),
    };
  } catch (e) {
    const list = /contains \d+ projects; drop one of them: (.*)$/.exec((e as InputError).message);
    if (!(e instanceof InputError) || !list) throw e;
    return { listed: list[1]!.split(", ") };
  }
}

/** A report folder of one page whose definition.pbir reads the model at `model`. */
function reportAt(folder: string, model: string): void {
  mkdirSync(join(folder, "definition", "pages", "p"), { recursive: true });
  writeFileSync(
    join(folder, "definition.pbir"),
    j({ datasetReference: { byPath: { path: model } } }),
  );
  writeFileSync(join(folder, "definition", "report.json"), "{}");
  writeFileSync(join(folder, "definition", "pages", "p", "page.json"), j({ name: "p" }));
}

/** A model folder whose one table is `table`. */
function modelAt(folder: string, table: string): void {
  mkdirSync(join(folder, "definition"), { recursive: true });
  writeFileSync(join(folder, "definition", "model.tmdl"), "model Model\n");
  writeFileSync(join(folder, "definition", `${table}.tmdl`), `table ${table}\n`);
}

describe("a folder with projects below it, in the CLI and the browser (#174)", () => {
  const cases: [string, (root: string) => void][] = [
    [
      "one project one folder down",
      (r) => cpSync(sample, join(r, "sub", "messy-sales"), { recursive: true }),
    ],
    [
      "one project two folders down",
      (r) => cpSync(sample, join(r, "a", "b", "messy-sales"), { recursive: true }),
    ],
    [
      "two projects",
      (r) => {
        cpSync(sample, join(r, "a", "messy-sales"), { recursive: true });
        cpSync(sample, join(r, "b", "messy-sales"), { recursive: true });
      },
    ],
    [
      "a project beside loose .tmdl files",
      (r) => {
        cpSync(sample, join(r, "sub", "messy-sales"), { recursive: true });
        writeFileSync(join(r, "model.tmdl"), "model Model\n");
        mkdirSync(join(r, "snippets"));
        writeFileSync(join(r, "snippets", "T.tmdl"), "table T\n");
      },
    ],
    [
      "a thin report's .pbip below the folder with its model beside it",
      (r) => {
        mkdirSync(join(r, "sub"));
        writeFileSync(
          join(r, "sub", "Thin.pbip"),
          j({ version: "1.0", artifacts: [{ report: { path: "Thin.Report" } }] }),
        );
        reportAt(join(r, "sub", "Thin.Report"), "../Shared.SemanticModel");
        modelAt(join(r, "sub", "Shared.SemanticModel"), "Shared");
      },
    ],
    [
      "a report and its model with no .pbip",
      (r) => {
        modelAt(join(r, "one", "A.SemanticModel"), "A");
        reportAt(join(r, "one", "A.Report"), "../A.SemanticModel");
      },
    ],
    [
      "two pairs side by side",
      (r) => {
        for (const name of ["A", "B"]) {
          modelAt(join(r, "ws", `${name}.SemanticModel`), name);
          reportAt(join(r, "ws", `${name}.Report`), `../${name}.SemanticModel`);
        }
      },
    ],
    [
      "loose .tmdl files and no project, as v1 read them",
      (r) => {
        mkdirSync(join(r, "a", "b"), { recursive: true });
        writeFileSync(join(r, "model.tmdl"), "model Model\n");
        writeFileSync(join(r, "a", "b", "T.tmdl"), "table T\n");
      },
    ],
  ];
  it.each(cases)("%s", (_, fill) => {
    const root = tempDir("both");
    fill(root);
    expect(browser(root)).toEqual(cli(root));
  });
  it("finds the same one project where a thin report's model sits elsewhere, which only the CLI follows", () => {
    // The browser has no .pbip route (spec section 12): it reads the .pbip's folder, the report
    // alone, and says which model the report reads.
    const root = tempDir("both-apart");
    mkdirSync(join(root, "reports"));
    writeFileSync(
      join(root, "reports", "Thin.pbip"),
      j({ version: "1.0", artifacts: [{ report: { path: "Thin.Report" } }] }),
    );
    reportAt(join(root, "reports", "Thin.Report"), "../../models/Shared.SemanticModel");
    modelAt(join(root, "models", "Shared.SemanticModel"), "Shared");
    const notice: [string, string] = ["project-below-input", "reports/Thin.pbip"];
    expect(cli(root)).toMatchObject({ absent: {}, diagnostics: [notice] });
    expect(browser(root)).toMatchObject({
      absent: {
        model:
          "this report reads ../../models/Shared.SemanticModel, which this run did not include",
      },
      diagnostics: [notice],
    });
  });
});
