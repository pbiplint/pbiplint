import {
  ConfigError,
  lint,
  plural,
  resolveConfig,
  summaryLine,
  type LintFile,
} from "@pbiplint/core";
import { BROWSER_RULES, browserConfig } from "./browser-rules.js";
import { InputError, selectModel, type InputTree } from "./input/model-files.js";
import { directoryPicker, readDirectoryInput, readPickedDirectory } from "./input/pick-folder.js";
import { readDataTransfer } from "./input/read-drop.js";
import { renderResults } from "./results/render.js";
import { SAMPLE_FILES, SAMPLE_NAME } from "./sample.js";

/**
 * The page's own element, checked rather than cast: a #paste that stopped being a textarea would
 * otherwise read `.value` as undefined and lint an empty paste, with nothing to say where the
 * mistake was. Both throws happen as this module loads, so the page fails at the markup.
 */
const byId = <T extends HTMLElement>(id: string, type: new () => T): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The home page has no #${id}`);
  if (!(el instanceof type))
    throw new Error(`The home page's #${id} is a ${el.tagName.toLowerCase()}, not ${type.name}`);
  return el;
};

const paste = byId("paste", HTMLTextAreaElement);
const status = byId("status", HTMLParagraphElement);
const announcer = byId("announce", HTMLParagraphElement);
const results = byId("results", HTMLElement);
const dropZone = byId("drop", HTMLElement);
const folderInput = byId("folder-input", HTMLInputElement);

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
  announcer.textContent = "";
  results.hidden = true;
  results.replaceChildren();
  if (typeof status.scrollIntoView === "function")
    status.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function fail(e: unknown): void {
  if (e instanceof InputError || e instanceof ConfigError) problem(e.message);
  else problem(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
}

/**
 * Two reads can be in flight at once, a drop landing while a folder walk is still going, and they
 * can come back in either order. Every input takes the next token as it starts; a read holding
 * anything but the newest token has been superseded, so its results and its failures are both
 * dropped rather than overwriting what the newer input is already showing.
 */
let latestRun = 0;
const startRun = (): number => (latestRun += 1);
const superseded = (token: number): boolean => token !== latestRun;

interface Run {
  files: LintFile[];
  /** What was linted, for the results heading. */
  source: string;
  config?: { path: string; text: string };
  /** What to list as read under the results: the model files and the config. None for a paste. */
  read?: string[];
  /** Sentences about the input for under the summary. */
  notes?: string[];
}

/** Every input ends up here: read the config if there is one, lint, render. Nothing touches the network. */
function run({ files, source, config, read, notes }: Run): void {
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
    const result = lint(files, {
      config: browserConfig(resolveConfig(raw)),
      rules: BROWSER_RULES,
    });
    // Unhidden before it is filled, as the status line is: a hidden block is out of the
    // accessibility tree, so anything rendered into one arrives where nothing can reach it. The
    // live region that first made the order matter has since moved out to #announce; the order
    // stays, and home.test.ts holds it.
    results.hidden = false;
    renderResults(results, result, { source, files: read, notes });
    say("");
    // The results are rebuilt on every run, so the live region is this one paragraph that never
    // leaves the page: a screen reader hears the summary sentence, not every finding row.
    announcer.textContent = `Results for ${source}: ${summaryLine(result)}.`;
    if (typeof results.scrollIntoView === "function")
      results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    fail(e);
  }
}

function runEntries(tree: InputTree): void {
  try {
    const model = selectModel(tree.entries, tree.modelFolders);
    run({
      files: model.files,
      source: `${model.root || "the dropped file"} (${plural(model.files.length, "file")})`,
      config: model.config,
      read: model.read,
      notes: model.notes,
    });
  } catch (e) {
    fail(e);
  }
}

byId("lint-paste", HTMLButtonElement).addEventListener("click", () => {
  const text = paste.value;
  // Claimed even for an empty paste: a folder still reading must not land on top of the message.
  startRun();
  if (text.trim() === "") {
    problem("Paste some TMDL first.");
    return;
  }
  run({ files: [{ path: "pasted.tmdl", text }], source: "pasted TMDL" });
});

byId("try-sample", HTMLButtonElement).addEventListener("click", () => {
  startRun();
  run({
    files: SAMPLE_FILES,
    source: `${SAMPLE_NAME} (${plural(SAMPLE_FILES.length, "file")})`,
    read: SAMPLE_FILES.map((f) => f.path),
  });
});

// Every folder route says "Reading files..." once there is a folder to read: the drop as it lands,
// the picker once the dialog closes on a choice, the directory input as it reports its files.
const reading = (): void => say("Reading files...");

// A drop anywhere else would make the browser open the file; keep it on the page.
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => event.preventDefault());
// Every child the pointer crosses fires its own dragenter and a dragleave on the element left, so
// the zone counts entries against leaves and unlights only when the pointer has left them all.
// (relatedTarget would tell the two apart, but Chrome and Safari leave it null on drag events.)
// The count can still go wrong: a drag cancelled with Escape over a child, or dragged out of the
// window, may miss a dragleave. So dragover, which a browser fires at least every 550 ms while a
// drag is over the zone, relights it and arms a watchdog that unlights it once dragover stops.
let dragDepth = 0;
let dragWatchdog: ReturnType<typeof setTimeout> | undefined;
const unlight = (): void => {
  dragDepth = 0;
  clearTimeout(dragWatchdog);
  dropZone.classList.remove("over");
};
dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropZone.classList.add("over");
});
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("over");
  clearTimeout(dragWatchdog);
  dragWatchdog = setTimeout(unlight, 1000);
});
dropZone.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) unlight();
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  unlight();
  if (!event.dataTransfer) return;
  const token = startRun();
  reading();
  // readDataTransfer takes the entries before its first await, while the DataTransfer is still readable.
  readDataTransfer(event.dataTransfer).then(
    (tree) => {
      if (!superseded(token)) runEntries(tree);
    },
    (e) => {
      if (!superseded(token)) fail(e);
    },
  );
});

const picker = directoryPicker();
byId("choose-folder", HTMLButtonElement).addEventListener("click", () => {
  if (!picker) {
    folderInput.click();
    return;
  }
  // The token is claimed when a folder is chosen rather than when the dialog opens: the dialog can
  // sit open for as long as the person likes, and it must not cancel an input made in the meantime.
  // A failure before that has no token, and a picker that will not open is worth saying out loud.
  let token = 0;
  readPickedDirectory(picker, () => {
    token = startRun();
    reading();
  }).then(
    (entries) => {
      if (entries && !superseded(token)) runEntries(entries);
    },
    (e) => {
      if (token === 0 || !superseded(token)) fail(e);
    },
  );
});
folderInput.addEventListener("change", () => {
  const token = startRun();
  reading();
  readDirectoryInput(folderInput).then(
    (tree) => {
      if (!superseded(token)) runEntries(tree);
    },
    (e) => {
      if (!superseded(token)) fail(e);
    },
  );
  folderInput.value = "";
});
