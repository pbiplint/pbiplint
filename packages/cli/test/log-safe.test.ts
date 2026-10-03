import { describe, expect, it } from "vitest";
import { logSafe } from "../src/log-safe.js";

describe("logSafe", () => {
  it("writes the second # of ## before a word and [ as \\u0023, anywhere in a line", () => {
    expect(logSafe("a ##vso[task.setvariable variable=x]y")).toBe(
      "a #\\u0023vso[task.setvariable variable=x]y",
    );
    expect(logSafe("##[warning]w")).toBe("#\\u0023[warning]w");
    expect(logSafe("x ##VSO[a] ##teamcity[m] ##Task_1[b]")).toBe(
      "x #\\u0023VSO[a] #\\u0023teamcity[m] #\\u0023Task_1[b]",
    );
    // A third # before it leaves no ## before the word.
    expect(logSafe("###vso[a]")).toBe("##\\u0023vso[a]");
  });
  it("writes the first : of a line that starts with :: after its whitespace as \\u003a", () => {
    expect(logSafe("::warning::x")).toBe("\\u003a:warning::x");
    expect(logSafe("ok\n  ::error::x\n\t::a\n\u00a0::b")).toBe(
      "ok\n  \\u003a:error::x\n\t\\u003a:a\n\u00a0\\u003a:b",
    );
    expect(logSafe("a ::warning::x")).toBe("a ::warning::x");
  });
  it("leaves everything else as it is", () => {
    for (const s of [
      "",
      "plain text\n",
      "#vso[a]",
      "## [a]",
      "#\u0023x",
      "a::b",
      ": :x",
      '{\n  "a": "#1"\n}\n',
    ])
      expect(logSafe(s), s).toBe(s);
  });
});
