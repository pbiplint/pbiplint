// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SAMPLE_FILES } from "../src/sample.js";

// happy-dom resolves a relative URL against the page's http base, so the file path is built
// from import.meta.url instead of new URL(..., import.meta.url).
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");
const body = html
  .slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
  .replace(/<script[\s\S]*?<\/script>/, "");
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** The accessor an element inherits for a DOM property, so a spy can record and then delegate. */
const inherited = (el: object, prop: string): PropertyDescriptor => {
  for (let o: object | null = Object.getPrototypeOf(el); o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, prop);
    if (d) return d;
  }
  throw new Error(`no inherited ${prop}`);
};

/** Records the order of writes to the named DOM properties of one element while fn runs. */
function writeOrder(el: HTMLElement, props: string[], fn: () => void): string[] {
  const order: string[] = [];
  const accessors = props.map((prop) => inherited(el, prop));
  props.forEach((prop, i) => {
    const { get, set } = accessors[i]!;
    Object.defineProperty(el, prop, {
      configurable: true,
      get: () => get!.call(el),
      set: (value: unknown) => {
        order.push(`${prop}=${String(value)}`);
        set!.call(el, value);
      },
    });
  });
  try {
    fn();
  } finally {
    for (const prop of props) Reflect.deleteProperty(el, prop);
  }
  return order;
}

describe("home page", () => {
  beforeAll(async () => {
    document.body.innerHTML = body;
    await import("../src/main.js");
  });
  it("lints the sample project from its button", async () => {
    document.getElementById("try-sample")!.click();
    await tick();
    const results = document.getElementById("results")!;
    expect(results.hidden).toBe(false);
    expect(results.querySelector(".summary")!.textContent).toContain("185 findings");
    expect(document.getElementById("status")!.hidden).toBe(true);
  });
  it("announces a run as one sentence through a live region that exists before the run", async () => {
    // A live region inserted with its text already set is the case screen readers may not
    // announce, so the announcer is part of the page and only its text changes. The two checks
    // below say the results block declares no aria-live of its own, which is less than it sounds:
    // the copy status inside it is a role="status" region, and that selector does not match one.
    // Holding the results block to a single empty region is render.test.ts's job.
    expect(body).toMatch(/<p id="announce"[^>]*aria-live="polite"[^>]*><\/p>/);
    const announcer = document.getElementById("announce")!;
    document.getElementById("try-sample")!.click();
    await tick();
    expect(announcer.textContent).toBe(
      "Results for the sample project (14 files): 185 findings (16 errors, 54 warnings, 115 info) in 14 files.",
    );
    expect(document.getElementById("results")!.hasAttribute("aria-live")).toBe(false);
    expect(document.querySelectorAll("#results [aria-live]").length).toBe(0);
    (document.getElementById("paste") as HTMLTextAreaElement).value = "";
    document.getElementById("lint-paste")!.click();
    expect(announcer.textContent).toBe("");
  });
  it("lints pasted TMDL and complains about an empty paste", async () => {
    const paste = document.getElementById("paste") as HTMLTextAreaElement;
    paste.value = "";
    document.getElementById("lint-paste")!.click();
    const status = document.getElementById("status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe("Paste some TMDL first.");
    paste.value = "table Sales\n\tcolumn Amount\n\t\tdataType: double\n\t\tsourceColumn: Amount\n";
    document.getElementById("lint-paste")!.click();
    await tick();
    expect(status.hidden).toBe(true);
    expect(document.querySelector("#results h2")!.textContent).toBe("Results for pasted TMDL");
    expect(document.querySelector("#results .summary")!.textContent).toContain("in 1 file");
  });
  it("unhides the status line before it writes the message", () => {
    const status = document.getElementById("status")!;
    status.hidden = true;
    (document.getElementById("paste") as HTMLTextAreaElement).value = "";
    const order = writeOrder(status, ["hidden", "textContent"], () => {
      document.getElementById("lint-paste")!.click();
    });
    // hidden = false first: a screen reader can miss text set on a hidden role="status".
    expect(order).toEqual(["hidden=false", "textContent=Paste some TMDL first."]);
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe("Paste some TMDL first.");
  });
  it("unhides the results before it renders into them", () => {
    const results = document.getElementById("results")!;
    results.hidden = true;
    const order: string[] = [];
    const hidden = inherited(results, "hidden");
    const replaceChildren = results.replaceChildren.bind(results);
    Object.defineProperty(results, "hidden", {
      configurable: true,
      get: () => hidden.get!.call(results) as boolean,
      set: (value: boolean) => {
        order.push(`hidden=${String(value)}`);
        hidden.set!.call(results, value);
      },
    });
    results.replaceChildren = ((...nodes: (Node | string)[]) => {
      order.push("render");
      replaceChildren(...nodes);
    }) as typeof results.replaceChildren;
    try {
      document.getElementById("try-sample")!.click();
    } finally {
      Reflect.deleteProperty(results, "hidden");
      Reflect.deleteProperty(results, "replaceChildren");
    }
    // The same rule the status line follows: a hidden block is out of the accessibility tree, so
    // content rendered into one arrives where nothing can reach it.
    expect(order).toEqual(["hidden=false", "render"]);
    expect(results.querySelector(".summary")!.textContent).toContain("185 findings");
  });
  it("scrolls a problem message only as far as needed, so the textarea stays in view", () => {
    const status = document.getElementById("status")!;
    const scroll = vi.fn();
    status.scrollIntoView = scroll;
    try {
      (document.getElementById("paste") as HTMLTextAreaElement).value = "";
      document.getElementById("lint-paste")!.click();
    } finally {
      Reflect.deleteProperty(status, "scrollIntoView");
    }
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
  });
  it("keeps the drop zone lit while the pointer crosses its children", () => {
    const zone = document.getElementById("drop")!;
    const child = zone.querySelector("p")!;
    const fire = (el: Element, type: string): boolean =>
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    fire(zone, "dragenter");
    expect(zone.classList.contains("over")).toBe(true);
    // Entering a child fires dragenter on the child and dragleave on the zone, in that order.
    fire(child, "dragenter");
    fire(zone, "dragleave");
    expect(zone.classList.contains("over")).toBe(true);
    // Leaving the child back onto the zone, then leaving the zone.
    fire(zone, "dragenter");
    fire(child, "dragleave");
    expect(zone.classList.contains("over")).toBe(true);
    fire(zone, "dragleave");
    expect(zone.classList.contains("over")).toBe(false);
  });
  it("unlights the drop zone by itself when dragover stops, even with a dragleave missed", () => {
    const zone = document.getElementById("drop")!;
    const fire = (el: Element, type: string): boolean =>
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    vi.useFakeTimers();
    try {
      // Two entries, no leaves: a drag cancelled with Escape over a child looks like this.
      fire(zone, "dragenter");
      fire(zone.querySelector("p")!, "dragenter");
      fire(zone, "dragover");
      vi.advanceTimersByTime(900);
      expect(zone.classList.contains("over")).toBe(true);
      fire(zone, "dragover");
      vi.advanceTimersByTime(900);
      expect(zone.classList.contains("over")).toBe(true);
      vi.advanceTimersByTime(200);
      expect(zone.classList.contains("over")).toBe(false);
      // The count was reset with the highlight, so the next drag behaves normally.
      fire(zone, "dragenter");
      fire(zone, "dragleave");
      expect(zone.classList.contains("over")).toBe(false);
      // A stray dragleave while the pointer is still inside is healed by the next dragover.
      fire(zone, "dragenter");
      fire(zone, "dragleave");
      fire(zone, "dragleave");
      fire(zone, "dragover");
      expect(zone.classList.contains("over")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("unlights the drop zone on a drop and starts the next drag from zero", () => {
    const zone = document.getElementById("drop")!;
    const fire = (el: Element, type: string): boolean =>
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    fire(zone, "dragenter");
    fire(zone.querySelector("p")!, "dragenter");
    fire(zone, "drop");
    expect(zone.classList.contains("over")).toBe(false);
    fire(zone, "dragenter");
    fire(zone, "dragleave");
    expect(zone.classList.contains("over")).toBe(false);
  });
  it("says it is reading files as soon as a folder input reports its files", async () => {
    const input = document.getElementById("folder-input") as HTMLInputElement;
    const file = Object.assign(new File(["table T\n"], "T.tmdl"), {
      webkitRelativePath: "Demo.SemanticModel/definition/tables/T.tmdl",
    });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    try {
      input.dispatchEvent(new Event("change"));
    } finally {
      Reflect.deleteProperty(input, "files");
    }
    const status = document.getElementById("status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe("Reading files...");
    await tick();
    await tick();
    expect(status.hidden).toBe(true);
    expect(document.querySelector("#results h2")!.textContent).toBe(
      "Results for Demo.SemanticModel (1 file)",
    );
  });
  it("lists the files it read for the sample and a folder, and none for a paste", async () => {
    const listed = (): string[] =>
      [...document.querySelectorAll("#results details.files li")].map((li) => li.textContent!);
    document.getElementById("try-sample")!.click();
    await tick();
    expect(listed()).toEqual(SAMPLE_FILES.map((f) => f.path));
    const input = document.getElementById("folder-input") as HTMLInputElement;
    const at = (path: string, text: string): File =>
      Object.assign(new File([text], path.slice(path.lastIndexOf("/") + 1)), {
        webkitRelativePath: path,
      });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        at("Proj/Demo.SemanticModel/definition/tables/T.tmdl", "table T\n"),
        at("Proj/pbiplint.config.json", "{}"),
      ],
    });
    try {
      input.dispatchEvent(new Event("change"));
    } finally {
      Reflect.deleteProperty(input, "files");
    }
    await tick();
    await tick();
    expect(listed()).toEqual(["../pbiplint.config.json (config)", "definition/tables/T.tmdl"]);
    (document.getElementById("paste") as HTMLTextAreaElement).value = "table T\n";
    document.getElementById("lint-paste")!.click();
    await tick();
    expect(document.querySelector("#results details.files")).toBeNull();
  });
  it("says when a dropped PBIP folder holds a model with no .tmdl files", async () => {
    const input = document.getElementById("folder-input") as HTMLInputElement;
    const at = (path: string, text: string): File =>
      Object.assign(new File([text], path.slice(path.lastIndexOf("/") + 1)), {
        webkitRelativePath: path,
      });
    const feed = (files: File[]): void => {
      Object.defineProperty(input, "files", { configurable: true, value: files });
      try {
        input.dispatchEvent(new Event("change"));
      } finally {
        Reflect.deleteProperty(input, "files");
      }
    };
    feed([
      at("Proj/New.SemanticModel/definition/tables/T.tmdl", "table T\n"),
      at("Proj/Old.SemanticModel/model.bim", "{}"),
    ]);
    await tick();
    await tick();
    expect(document.querySelector("#results h2")!.textContent).toBe(
      "Results for Proj/New.SemanticModel (1 file)",
    );
    expect(document.querySelector("#results .notice")!.textContent).toMatch(
      /^Proj\/Old\.SemanticModel holds no \.tmdl files/,
    );
    feed([at("Proj/Old.SemanticModel/model.bim", "{}")]);
    await tick();
    await tick();
    const status = document.getElementById("status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toMatch(/^Proj\/Old\.SemanticModel holds no \.tmdl files\./);
    expect(document.getElementById("results")!.hidden).toBe(true);
  });
  it("clears the last results when the next input fails", async () => {
    document.getElementById("try-sample")!.click();
    await tick();
    const results = document.getElementById("results")!;
    expect(results.hidden).toBe(false);
    expect(results.querySelector(".fix-first")).not.toBeNull();
    (document.getElementById("paste") as HTMLTextAreaElement).value = "";
    document.getElementById("lint-paste")!.click();
    const status = document.getElementById("status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe("Paste some TMDL first.");
    expect(results.hidden).toBe(true);
    expect(results.children.length).toBe(0);
  });
  it("lets the newest input win when two reads finish out of order", async () => {
    const input = document.getElementById("folder-input") as HTMLInputElement;
    let release: (() => void) | undefined;
    // A folder file whose read never settles until the test says so.
    const slow = Object.assign(new File(["table Slow\n"], "Slow.tmdl"), {
      webkitRelativePath: "Slow.SemanticModel/definition/tables/Slow.tmdl",
      text: () => new Promise<string>((resolve) => (release = () => resolve("table Slow\n"))),
    });
    Object.defineProperty(input, "files", { configurable: true, value: [slow] });
    try {
      input.dispatchEvent(new Event("change"));
    } finally {
      Reflect.deleteProperty(input, "files");
    }
    await tick();
    // The folder read is still waiting on its file, so a paste finishes first and owns the page.
    (document.getElementById("paste") as HTMLTextAreaElement).value = "table Pasted\n";
    document.getElementById("lint-paste")!.click();
    await tick();
    expect(document.querySelector("#results h2")!.textContent).toBe("Results for pasted TMDL");
    release!();
    await tick();
    await tick();
    // The superseded read comes back last and is dropped rather than replacing the paste.
    expect(document.querySelector("#results h2")!.textContent).toBe("Results for pasted TMDL");
    expect(document.getElementById("status")!.hidden).toBe(true);
  });
});
