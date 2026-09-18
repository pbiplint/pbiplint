import { describe, expect, it } from "vitest";
import { helpText } from "../sync-rule-pages.mjs";

describe("helpText", () => {
  it("unwraps a code span rather than deleting the backticks around it", () => {
    expect(helpText("A `///` description must sit above its declaration.")).toBe(
      "A /// description must sit above its declaration.",
    );
  });

  it("keeps backticks that open nothing, such as a fence a sentence names", () => {
    // The page says what a TMDL expression block looks like; deleting the backticks left the
    // sentence saying "open and close with  on their own lines".
    expect(helpText("Expression blocks open and close with ``` on their own lines.")).toBe(
      "Expression blocks open and close with ``` on their own lines.",
    );
  });

  it("reads a span written with two backticks, so it can hold one of its own", () => {
    expect(helpText("Write `` `x` `` to show a code span.")).toBe("Write `x` to show a code span.");
  });

  it("drops the fence lines around a block and keeps what they wrapped", () => {
    expect(helpText("Before\n```tmdl\ntable A\n```\nAfter")).toBe("Before\ntable A\nAfter");
  });

  it("keeps a heading as a line and a link as its text and url", () => {
    expect(helpText("### How to fix it")).toBe("How to fix it");
    expect(helpText("See [the page](https://pbiplint.com/rules/x).")).toBe(
      "See the page (https://pbiplint.com/rules/x).",
    );
  });
});
