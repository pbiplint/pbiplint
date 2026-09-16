import { ConfigError, lint, resolveConfig, type LintFile } from "@pbiplint/core";
import { InputError, relativeToRoot, selectModel, type InputEntry } from "./input/model-files.js";
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
 * the fold. "nearest" scrolls only as far as it must, so an empty paste keeps the textarea on
 * screen instead of pinning the message to the top.
 */
function problem(message: string): void {
  say(message, "error");
  results.hidden = true;
  results.replaceChildren();
  if (typeof status.scrollIntoView === "function")
    status.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function fail(e: unknown): void {
  if (e instanceof InputError || e instanceof ConfigError) problem(e.message);
  else problem(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
}

interface Run {
  files: LintFile[];
  /** What was linted, for the results heading. */
  source: string;
  config?: { path: string; text: string };
  /** What to list as read under the results: the model files and the config. None for a paste. */
  read?: string[];
}

/** Every input ends up here: read the config if there is one, lint, render. Nothing touches the network. */
function run({ files, source, config, read }: Run): void {
  try {
    let raw: unknown;
    if (config) {
      try {
        raw = JSON.parse(config.text);
      } catch (e) {
        throw new ConfigError(
          `pbiplint.config.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const result = lint(files, { config: resolveConfig(raw) });
    // Shown before it is filled: a screen reader can miss mutations made inside a hidden live region.
    results.hidden = false;
    renderResults(results, result, { source, files: read });
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
    const read = model.files.map((f) => f.path);
    if (model.config) read.push(`${relativeToRoot(model.root, model.config.path)} (config)`);
    run({
      files: model.files,
      source: `${model.root || "the dropped file"} (${plural(model.files.length, "file")})`,
      config: model.config,
      read,
    });
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
  run({ files: [{ path: "pasted.tmdl", text }], source: "pasted TMDL" });
});

byId("try-sample").addEventListener("click", () =>
  run({
    files: SAMPLE_FILES,
    source: `${SAMPLE_NAME} (${plural(SAMPLE_FILES.length, "file")})`,
    read: SAMPLE_FILES.map((f) => f.path),
  }),
);

// Every folder route says "Reading files..." once there is a folder to read: the drop as it lands,
// the picker once the dialog closes on a choice, the directory input as it reports its files.
const reading = (): void => say("Reading files...");

// A drop anywhere else would make the browser open the file; keep it on the page.
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => event.preventDefault());
// Every child the pointer crosses fires its own dragenter and a dragleave on the element left, so
// the zone counts entries against leaves and unlights only when the pointer has left them all.
// (relatedTarget would tell the two apart, but Chrome and Safari leave it null on drag events.)
let dragDepth = 0;
const unlight = (): void => {
  dragDepth = 0;
  dropZone.classList.remove("over");
};
dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropZone.classList.add("over");
});
dropZone.addEventListener("dragover", (event) => event.preventDefault());
dropZone.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropZone.classList.remove("over");
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  unlight();
  if (!event.dataTransfer) return;
  reading();
  // readDataTransfer takes the entries before its first await, while the DataTransfer is still readable.
  readDataTransfer(event.dataTransfer).then(runEntries, fail);
});

const picker = directoryPicker();
byId("choose-folder").addEventListener("click", () => {
  if (picker)
    readPickedDirectory(picker, reading).then((entries) => entries && runEntries(entries), fail);
  else folderInput.click();
});
folderInput.addEventListener("change", () => {
  reading();
  readDirectoryInput(folderInput).then(runEntries, fail);
  folderInput.value = "";
});
