import { describe, expect, it } from "vitest";
import { exampleMarkdown, helpMarkdown, helpText } from "../sync-rule-pages.mjs";

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

  it("drops the bold markers on a caption so it reads as a plain line", () => {
    expect(helpText("**Fires the rule**\n\n```tmdl\ntable A\n```")).toBe(
      "Fires the rule\n\ntable A",
    );
  });
});

describe("exampleMarkdown", () => {
  it("captions the two fences and reduces their info strings to tmdl", () => {
    expect(exampleMarkdown("```tmdl fires\ntable A\n```\n\n```tmdl fixed\ntable B\n```")).toBe(
      "**Fires the rule**\n\n```tmdl\ntable A\n```\n\n**After the fix**\n\n```tmdl\ntable B\n```",
    );
  });
  it("captions pbir fences with their file, bare for a tree, and reduces their info strings to json", () => {
    expect(
      exampleMarkdown("```pbir fires visual.json\n{}\n```\n\n```pbir fixed tree.json\n{}\n```"),
    ).toBe(
      "**Fires the rule in visual.json**\n\n```json\n{}\n```\n\n**After the fix**\n\n```json\n{}\n```",
    );
  });
});

describe("helpMarkdown", () => {
  const mechanics =
    'To ignore this rule on one object, add `annotation pbiplint.ignore = X` under the object in its TMDL file. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `"X": "off"` under `rules` in `pbiplint.config.json`.';
  it("mirrors the page minus What it checks, captions the example, and appends the mechanics", () => {
    const s = {
      Example: "```tmdl fires\ntable A\n```\n\n```tmdl fixed\ntable B\n```",
      "Why it matters": "Why.",
      "How to fix it": "How.",
      "When to ignore it": "Never.",
      Quirks: "- One.",
    };
    expect(helpMarkdown(s, "https://pbiplint.com/rules/x", "X", ["Column"])).toBe(
      [
        "### Example",
        "",
        "**Fires the rule**",
        "",
        "```tmdl",
        "table A",
        "```",
        "",
        "**After the fix**",
        "",
        "```tmdl",
        "table B",
        "```",
        "",
        "### Why it matters",
        "",
        "Why.",
        "",
        "### How to fix it",
        "",
        "How.",
        "",
        "### When to ignore it",
        "",
        "Never.",
        "",
        mechanics,
        "",
        "### Quirks",
        "",
        "- One.",
        "",
        "Read more: https://pbiplint.com/rules/x",
      ].join("\n"),
    );
  });
  it("leaves out the sections a page does not have", () => {
    expect(helpMarkdown({ "Why it matters": "Why.", "How to fix it": "How." }, "u", "X", [])).toBe(
      "### Why it matters\n\nWhy.\n\n### How to fix it\n\nHow.\n\nRead more: u",
    );
  });
});
