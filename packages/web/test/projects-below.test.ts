import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { UsageError } from "../../cli/src/args.js";
import {
  lint,
  resolveConfig,
  runSummary,
  shareModels,
  unreadProject,
  type ProjectRun,
} from "@pbiplint/core";
import { lintSeveral } from "../../cli/src/several.js";
import {
  MAX_PROJECTS as CLI_MAX_PROJECTS,
  resolveInput,
  resolveProject,
} from "../../cli/src/walk.js";
import {
  emptyTree,
  InputError,
  isModelFolder,
  isReportFolder,
  MAX_PROJECTS,
  selectProject,
  selectProjects,
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
      // The monorepo of #236 with one report: both follow the .pbip to the shared model (#237).
      "a .pbip whose report reads a shared model elsewhere in the folder",
      (r) => {
        mkdirSync(join(r, "reports", "Sales"), { recursive: true });
        writeFileSync(
          join(r, "reports", "Sales", "Sales.pbip"),
          j({ version: "1.0", artifacts: [{ report: { path: "Sales.Report" } }] }),
        );
        reportAt(
          join(r, "reports", "Sales", "Sales.Report"),
          "../../../models/Shared.SemanticModel",
        );
        modelAt(join(r, "models", "Shared.SemanticModel"), "Shared");
      },
    ],
    [
      "a .pbip whose artifacts name a report in another folder",
      (r) => {
        mkdirSync(join(r, "Proj"));
        writeFileSync(
          join(r, "Proj", "Sales.pbip"),
          j({ version: "1.0", artifacts: [{ report: { path: "../Other/Sales.Report" } }] }),
        );
        reportAt(join(r, "Other", "Sales.Report"), "../Sales.SemanticModel");
        modelAt(join(r, "Other", "Sales.SemanticModel"), "Sales");
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
  it("gives a reference out of the folder the CLI's outside notice, with the drop for the path named (#237)", () => {
    // The CLI's words, but for what the browser was given: a folder dropped, not a path named.
    const asDropped = (cli: string): string =>
      cli.replace("the path you named", "the folder you dropped").replace("; lint ", "; drop ");
    const root = tempDir("both-outside");
    mkdirSync(join(root, "reports"));
    writeFileSync(
      join(root, "reports", "Thin.pbip"),
      j({ version: "1.0", artifacts: [{ report: { path: "Thin.Report" } }] }),
    );
    reportAt(join(root, "reports", "Thin.Report"), "../../../elsewhere.SemanticModel");
    const c = resolveProject(root);
    const b = selectProject(dropOf(root));
    expect(browser(root)).toMatchObject({
      files: (cli(root) as { files: string[] }).files,
      diagnostics: c.diagnostics.map((d) => [d.kind, d.path]),
    });
    expect(b.absent).toEqual({ model: asDropped(c.absent.model!) });
    expect(b.diagnostics.map((d) => d.message)).toEqual(
      c.diagnostics.map((d) => asDropped(d.message)),
    );
  });
});

describe("a .pbip below the folder, followed by the CLI and the browser alike (#237)", () => {
  // Each layout below changed what the site gives, toward the CLI's: the two give the same files,
  // absent reasons, notices, or refusal. The CLI names its paths from the folder named, which the
  // drop names by that folder's name, and says "the path you named" where the site says "the
  // folder you dropped".
  type Answer = { files: string[]; absent: object; said: string[] } | { refused: string };
  const answer = (
    read: () => ReturnType<typeof selectProject> | ReturnType<typeof resolveProject>,
  ) => {
    try {
      const p = read();
      const files =
        "files" in p ? p.files : [...(p.model?.files ?? []), ...(p.report?.files ?? [])];
      return {
        files: files.map((f) => f.path).sort(byName),
        absent: p.absent,
        said: p.diagnostics.map((d) => d.message),
      } as Answer;
    } catch (e) {
      if (!(e instanceof UsageError) && !(e instanceof InputError)) throw e;
      return { refused: e.message } as Answer;
    }
  };
  function same(fill: (root: string) => void): Answer {
    const root = tempDir("both-pbip");
    fill(root);
    const asDropped = (s: string): string =>
      s
        .split(`${dirname(root)}/`)
        .join("")
        .replaceAll("the path you named", "the folder you dropped")
        .replaceAll("; lint ", "; drop ");
    const c = JSON.parse(asDropped(JSON.stringify(answer(() => resolveProject(root)))));
    const b = answer(() => selectProject(dropOf(root)));
    expect(b).toEqual(c);
    return b;
  }
  const pbipAt = (file: string, ...reports: string[]): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      j({ version: "1.0", artifacts: reports.map((path) => ({ report: { path } })) }),
    );
  };

  it("says the model a report reads is not there", () => {
    const b = same((r) => {
      pbipAt(join(r, "reports", "Thin.pbip"), "Thin.Report");
      reportAt(join(r, "reports", "Thin.Report"), "../../models/Nope.SemanticModel");
    });
    expect(b).toMatchObject({
      absent: {
        model: "this report reads a model that is not there (../../models/Nope.SemanticModel)",
      },
    });
  });
  it("gives a model outside the folder the outside notice and reason", () => {
    const b = same((r) => {
      pbipAt(join(r, "reports", "Thin.pbip"), "Thin.Report");
      reportAt(join(r, "reports", "Thin.Report"), "../../../elsewhere.SemanticModel");
    });
    expect(b).toMatchObject({
      absent: {
        model:
          "the model this report reads is outside the folder you dropped and the project folder",
      },
    });
  });
  it("refuses a .pbip naming a report that is not there", () => {
    const b = same((r) => pbipAt(join(r, "reports", "Thin.pbip"), "Nope.Report"));
    expect(b).toEqual({
      refused: expect.stringMatching(/Thin\.pbip names Nope\.Report, which does not exist$/),
    });
  });
  it("lints a report in the .pbip's own subfolder, with its model", () => {
    const b = same((r) => {
      pbipAt(join(r, "proj", "Sales.pbip"), "sub/Sales.Report");
      reportAt(join(r, "proj", "sub", "Sales.Report"), "../Sales.SemanticModel");
      modelAt(join(r, "proj", "sub", "Sales.SemanticModel"), "Sales");
    });
    expect(b).toMatchObject({ absent: {} });
    expect((b as { files: string[] }).files).toContain("definition/Sales.tmdl");
  });
  it("follows a byPath written with Windows backslashes, and says when its model is not there", () => {
    const found = same((r) => {
      pbipAt(join(r, "reports", "Sales", "Sales.pbip"), "Sales.Report");
      reportAt(
        join(r, "reports", "Sales", "Sales.Report"),
        "..\\..\\..\\models\\Shared.SemanticModel",
      );
      modelAt(join(r, "models", "Shared.SemanticModel"), "Shared");
    });
    expect((found as { files: string[] }).files).toContain("definition/Shared.tmdl");
    const missing = same((r) => {
      pbipAt(join(r, "reports", "Thin.pbip"), "Thin.Report");
      reportAt(join(r, "reports", "Thin.Report"), "..\\..\\models\\Nope.SemanticModel");
    });
    expect(missing).toMatchObject({
      absent: {
        model: "this report reads a model that is not there (..\\..\\models\\Nope.SemanticModel)",
      },
    });
  });
  it("names a legacy model the report reads by its path from the project root", () => {
    const b = same((r) => {
      pbipAt(join(r, "Proj", "Thin.pbip"), "Thin.Report");
      reportAt(join(r, "Proj", "Thin.Report"), "../../Models/M.SemanticModel");
      mkdirSync(join(r, "Models", "M.SemanticModel"), { recursive: true });
      writeFileSync(join(r, "Models", "M.SemanticModel", "model.bim"), "{}");
    });
    expect(b).toMatchObject({
      said: [
        expect.stringContaining("is the only project"),
        expect.stringMatching(/^\.\.\/Models\/M\.SemanticModel is stored as model\.bim/),
      ],
    });
  });
  it("refuses a .pbip whose report folder holds nothing to read", () => {
    const b = same((r) => {
      pbipAt(join(r, "Proj", "Thin.pbip"), "../Other/Thin.Report");
      mkdirSync(join(r, "Other", "Thin.Report"), { recursive: true });
      writeFileSync(join(r, "Other", "Thin.Report", "notes.txt"), "");
    });
    expect(b).toEqual({
      refused: expect.stringMatching(
        /^No semantic model or report found in \.\.\/Other\/Thin\.Report, which .*Proj\/Thin\.pbip names$/,
      ),
    });
  });
});

describe("a folder that holds several projects, in the CLI and the browser (#237)", () => {
  // The CLI's resolveInput and the page's selectProjects on the same folders on disk: the same
  // projects in the same order, and per project the same model and report files, or the same
  // project unreadable. The CLI names a path in a refusal from the folder above the one named,
  // which the drop names by that folder's name, and says to point at what the page says to drop.
  type Several = { path: string; model: string[]; report: string[]; unreadable?: object }[];
  const names = (files: { path: string }[]): string[] => files.map((f) => f.path).sort(byName);
  function cliSeveral(root: string): Several {
    const input = resolveInput(root);
    if (input.kind !== "several") throw new Error("the CLI read one project");
    const dropped = (s: string): string =>
      s
        .split(`${dirname(root)}/`)
        .join("")
        .replace("; point at one of them", "; drop one of them");
    return input.projects.map(({ path, project, unreadable }) => ({
      path,
      model: names(project?.model?.files ?? []),
      report: names(project?.report?.files ?? []),
      ...(unreadable
        ? {
            unreadable: {
              ...unreadable,
              message: dropped(unreadable.message),
              ...(unreadable.root === undefined ? {} : { root: dropped(unreadable.root) }),
            },
          }
        : {}),
    }));
  }
  function browserSeveral(root: string): Several {
    const selected = selectProjects(dropOf(root));
    if (selected.kind !== "several") throw new Error("the browser read one project");
    // The page lists a project's files as one list: the model's are its .tmdl files.
    return selected.projects.map(({ path, project, unreadable }) => {
      const files = project?.files ?? [];
      return {
        path,
        model: names(files.filter((f) => f.path.endsWith(".tmdl"))),
        report: names(files.filter((f) => !f.path.endsWith(".tmdl"))),
        ...(unreadable ? { unreadable } : {}),
      };
    });
  }

  /** #236's monorepo, as several.test.ts builds it: two reports read one model by path. */
  function monorepo(r: string): void {
    const model = join(sample, "Messy Sales Demo.SemanticModel");
    cpSync(model, join(r, "models", "Shared.SemanticModel"), { recursive: true });
    cpSync(model, join(r, "models", "Standalone.SemanticModel"), { recursive: true });
    for (const name of ["Finance", "Sales"]) {
      const dir = join(r, "reports", name);
      cpSync(join(sample, "Messy Sales Demo.Report"), join(dir, `${name}.Report`), {
        recursive: true,
      });
      writeFileSync(
        join(dir, `${name}.pbip`),
        j({ version: "1.0", artifacts: [{ report: { path: `${name}.Report` } }] }),
      );
      writeFileSync(
        join(dir, `${name}.Report`, "definition.pbir"),
        j({
          version: "4.0",
          datasetReference: { byPath: { path: "../../../models/Shared.SemanticModel" } },
        }),
      );
    }
    // Finance's report reaches [Sales YoY %], which the sample's report does not.
    const visual = join(
      r,
      "reports/Finance/Finance.Report/definition/pages/27f668864829019f9251/visuals/1e7f28bf49e435b68c50/visual.json",
    );
    const text = readFileSync(visual, "utf8");
    writeFileSync(visual, text.replace('"Property": "Total Sales"', '"Property": "Sales YoY %"'));
  }
  const pbipNaming = (file: string, ...reports: string[]): void =>
    writeFileSync(
      file,
      j({ version: "1.0", artifacts: reports.map((path) => ({ report: { path } })) }),
    );

  const cases: [string, (root: string) => void][] = [
    [
      "two projects below",
      (r) => {
        cpSync(sample, join(r, "a", "messy-sales"), { recursive: true });
        cpSync(sample, join(r, "b", "messy-sales"), { recursive: true });
      },
    ],
    [
      "two pairs side by side with no .pbip",
      (r) => {
        for (const name of ["A", "B"]) {
          modelAt(join(r, `${name}.SemanticModel`), name);
          reportAt(join(r, `${name}.Report`), `../${name}.SemanticModel`);
        }
      },
    ],
    [
      "two projects side by side, as Power BI Desktop saves them",
      (r) => {
        for (const name of ["Finance", "Sales"]) {
          pbipNaming(join(r, `${name}.pbip`), `${name}.Report`);
          modelAt(join(r, `${name}.SemanticModel`), name);
          reportAt(join(r, `${name}.Report`), `../${name}.SemanticModel`);
        }
      },
    ],
    ["#236's monorepo, two reports on one shared model", monorepo],
    [
      "a project beside one saved as model.bim",
      (r) => {
        modelAt(join(r, "a", "Sales.SemanticModel"), "Sales");
        mkdirSync(join(r, "b", "Finance.SemanticModel"), { recursive: true });
        writeFileSync(join(r, "b", "Finance.SemanticModel", "model.bim"), "{}");
      },
    ],
    [
      "a project beside a .pbip naming two reports",
      (r) => {
        cpSync(sample, join(r, "a", "messy-sales"), { recursive: true });
        mkdirSync(join(r, "b"));
        pbipNaming(join(r, "b", "Two.pbip"), "A.Report", "B.Report");
        reportAt(join(r, "b", "A.Report"), "../M.SemanticModel");
        reportAt(join(r, "b", "B.Report"), "../M.SemanticModel");
      },
    ],
  ];
  it.each(cases)("%s", (_, fill) => {
    const root = tempDir("both-several");
    fill(root);
    expect(browserSeveral(root)).toEqual(cliSeveral(root));
  });

  it("caps a run at the same number of projects", () => {
    expect(MAX_PROJECTS).toBe(CLI_MAX_PROJECTS);
  });

  it("lints #236's monorepo to the same counts per project, the shared model's findings once", async () => {
    const root = tempDir("both-several-lint");
    monorepo(root);
    const named = resolveInput(root);
    if (named.kind !== "several") throw new Error("the CLI read one project");
    const cli = (await lintSeveral(root, named.projects, { cwd: root })).run.runs;
    const selected = selectProjects(dropOf(root));
    if (selected.kind !== "several") throw new Error("the browser read one project");
    // As the page lints them (main.ts): each under its own config, then the shared-model step.
    const runs: ProjectRun[] = [];
    for (const p of selected.projects) {
      const config = resolveConfig(p.config ? JSON.parse(p.config.text) : undefined);
      const result = p.project
        ? await lint(p.project.files, {
            config,
            diagnostics: p.project.diagnostics,
            absent: p.project.absent,
            unreadPaths: p.project.unreadPaths,
          })
        : unreadProject(p.unreadable!, config);
      runs.push({
        path: p.path,
        result,
        config,
        ...(p.modelKey === undefined ? {} : { modelKey: p.modelKey, modelPath: p.modelPath }),
      });
    }
    const site = shareModels(runs);
    const counts = (r: ProjectRun[]) =>
      r.map((p) => [p.path, p.result.summary.findings, p.result.summary.errors, p.result.failed]);
    expect(counts(site)).toEqual(counts(cli));
    expect(runSummary(site)).toEqual(runSummary(cli));
    const notices = (r: ProjectRun[]) =>
      r.map((p) =>
        p.result.diagnostics.filter((d) => d.kind === "shared-model").map((d) => d.message),
      );
    expect(notices(site)).toEqual(notices(cli));
    expect(notices(site)[2]).toEqual([
      "the model at models/Shared.SemanticModel is shared with reports/Finance/Finance.pbip; its findings are listed there",
    ]);
  });
});
