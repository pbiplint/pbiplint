import {
  ConfigError,
  lint,
  resolveConfig,
  shareModels,
  unreadProject,
  type ProjectRun,
} from "@pbiplint/core";
import type { SeveralProject } from "./input/project-files.js";

/** A config file's text as resolveConfig takes it, refused in the page's words when it is not JSON. */
export function parsedConfig(config: { text: string } | undefined): unknown {
  if (!config) return undefined;
  try {
    return JSON.parse(config.text);
  } catch (e) {
    throw new ConfigError(
      `pbiplint.config.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * The projects of a drop that holds several (#237), linted as the CLI's lintSeveral lints the
 * folder: each in turn under its own config, a project that could not be read as its one
 * PARSE_ISSUE finding under its config too, then the shared-model step. Every config is read
 * before anything is linted, so one that is not valid JSON refuses the drop, as the CLI's refuses
 * its run. `before(i)` runs ahead of each project's lint, where the page yields to the browser;
 * when it says false the run stops there and gives nothing. `ms` is the time spent linting, the
 * waits left out. No DOM here, so projects-below.test.ts runs this same loop against the CLI's.
 */
export async function lintProjects(
  projects: SeveralProject[],
  before: (i: number) => Promise<boolean> = () => Promise.resolve(true),
): Promise<{ runs: ProjectRun[]; ms: number } | undefined> {
  const configs = projects.map((p) => resolveConfig(parsedConfig(p.config)));
  const runs: ProjectRun[] = [];
  let ms = 0;
  for (const [i, { path, project, unreadable, config: file, modelKey, modelPath }] of [
    ...projects.entries(),
  ]) {
    if (!(await before(i))) return undefined;
    const config = configs[i]!;
    const started = performance.now();
    const result = project
      ? await lint(project.files, {
          config,
          diagnostics: project.diagnostics,
          absent: project.absent,
          unreadPaths: project.unreadPaths,
        })
      : unreadProject(unreadable!, config);
    ms += performance.now() - started;
    runs.push({
      path,
      result,
      config,
      ...(modelKey === undefined ? {} : { modelKey, modelPath }),
      ...(file === undefined ? {} : { configPath: file.path }),
    });
  }
  return { runs: shareModels(runs), ms };
}
