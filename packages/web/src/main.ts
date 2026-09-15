import { ConfigError, lint, resolveConfig, type LintFile } from "@pbiplint/core";
import { InputError, selectModel, type InputEntry } from "./input/model-files.js";
import { directoryPicker, readDirectoryInput, readPickedDirectory } from "./input/pick-folder.js";
import { readDataTransfer } from "./input/read-drop.js";
import { renderResults } from "./results/render.js";
import { SAMPLE_FILES, SAMPLE_NAME } from "./sample.js";

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The home page has no #${id}`);
  return el as T;
};

const paste = byId<HTMLTextAreaElement>("paste");
const status = byId<HTMLParagraphElement>("status");
const results = byId<HTMLElement>("results");
const dropZone = byId<HTMLElement>("drop");
const folderInput = byId<HTMLInputElement>("folder-input");

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

function say(text: string, kind: "info" | "error" = "info"): void {
  // Unhidden before the text is written: a screen reader can miss text set on a hidden live region.
  if (text !== "") status.hidden = false;
  status.textContent = text;
  status.dataset.kind = kind;
  if (text === "") status.hidden = true;
}

/**
 * An input that went nowhere: say why, drop the results of the last one so nothing stale is read
 * as the answer, and scroll the message into view, since a previous run may have pushed it above
 * the fold.
 */
function problem(message: string): void {
  say(message, "error");
  results.hidden = true;
  results.replaceChildren();
  if (typeof status.scrollIntoView === "function")
    status.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fail(e: unknown): void {
  if (e instanceof InputError || e instanceof ConfigError) problem(e.message);
  else problem(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
}

/** Every input ends up here: read the config if there is one, lint, render. Nothing touches the network. */
function run(files: LintFile[], source: string, configText?: string): void {
  try {
    let raw: unknown;
    if (configText !== undefined) {
      try {
        raw = JSON.parse(configText);
      } catch (e) {
        throw new ConfigError(
          `pbiplint.config.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const result = lint(files, { config: resolveConfig(raw) });
    // Shown before it is filled: a screen reader can miss mutations made inside a hidden live region.
    results.hidden = false;
    renderResults(results, result, { source });
    say("");
    if (typeof results.scrollIntoView === "function")
      results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    fail(e);
  }
}

function runEntries(entries: InputEntry[]): void {
  try {
    const model = selectModel(entries);
    run(
      model.files,
      `${model.root || "the dropped file"} (${plural(model.files.length, "file")})`,
      model.config?.text,
    );
  } catch (e) {
    fail(e);
  }
}

byId("lint-paste").addEventListener("click", () => {
  const text = paste.value;
  if (text.trim() === "") {
    problem("Paste some TMDL first.");
    return;
  }
  run([{ path: "pasted.tmdl", text }], "pasted TMDL");
});

byId("try-sample").addEventListener("click", () =>
  run(SAMPLE_FILES, `${SAMPLE_NAME} (${plural(SAMPLE_FILES.length, "file")})`),
);

// A drop anywhere else would make the browser open the file; keep it on the page.
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => event.preventDefault());
for (const type of ["dragenter", "dragover"] as const)
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("over");
  });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("over");
  if (!event.dataTransfer) return;
  say("Reading files...");
  // readDataTransfer takes the entries before its first await, while the DataTransfer is still readable.
  readDataTransfer(event.dataTransfer).then(runEntries, fail);
});

const picker = directoryPicker();
byId("choose-folder").addEventListener("click", () => {
  if (picker) readPickedDirectory(picker).then((entries) => entries && runEntries(entries), fail);
  else folderInput.click();
});
folderInput.addEventListener("change", () => {
  readDirectoryInput(folderInput).then(runEntries, fail);
  folderInput.value = "";
});
