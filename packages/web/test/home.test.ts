// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

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
    expect(results.querySelector(".summary")!.textContent).toContain("161 findings");
    expect(document.getElementById("status")!.hidden).toBe(true);
  });
  it("keeps the live region on the summary, not on the whole results section", async () => {
    document.getElementById("try-sample")!.click();
    await tick();
    const results = document.getElementById("results")!;
    expect(results.hasAttribute("aria-live")).toBe(false);
    expect(results.querySelector(".summary")!.getAttribute("aria-live")).toBe("polite");
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
});
