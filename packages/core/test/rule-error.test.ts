import { describe, expect, it } from "vitest";
import { errorKind } from "../src/engine/rule-error.js";

// A rule error's text is the error's class alone (v3 spec, section 11.3, amended October 28,
// 2026): an exception's message can hold the model's text, so it is compared, never printed.
describe("errorKind", () => {
  it.each([
    [new Error("x"), "Error"],
    [new TypeError("x"), "TypeError"],
    [new RangeError("Maximum call stack size exceeded"), "RangeError (out of stack space)"],
    [new RangeError("Maximum call stack size exceeded."), "RangeError (out of stack space)"],
    [
      Object.assign(new Error("too much recursion"), { name: "InternalError" }),
      "InternalError (out of stack space)",
    ],
    [Object.assign(new Error("x"), { name: "NotAKnownClass" }), "Error"],
    ["thrown text", "a value that is not an Error"],
    [undefined, "a value that is not an Error"],
  ])("names %o as %j", (e, kind) => expect(errorKind(e)).toBe(kind));
  it("names an error whose name getter throws as Error", () => {
    const e = new Error("x");
    Object.defineProperty(e, "name", {
      get() {
        throw new Error("no");
      },
    });
    expect(errorKind(e)).toBe("Error");
  });
  it("never repeats the message", () => {
    expect(errorKind(new Error("a message with words"))).not.toContain("words");
  });
});
