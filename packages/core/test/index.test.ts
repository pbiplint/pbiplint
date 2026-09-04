import { describe, expect, it } from "vitest";
import { VERSION } from "@pbiplint/core";

describe("core package", () => {
  it("exports a version string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
