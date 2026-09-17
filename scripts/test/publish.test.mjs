import { describe, expect, it } from "vitest";
import { viewState } from "../publish.mjs";

describe("viewState", () => {
  it("is published only when the registry answered with the version asked for", () => {
    expect(viewState({ status: 0, stdout: "0.1.0\n", stderr: "" }, "0.1.0")).toBe("published");
    expect(viewState({ status: 0, stdout: "0.0.9\n", stderr: "" }, "0.1.0")).toBe("unknown");
  });
  it("is missing only when the registry answered 404", () => {
    const notFound = {
      status: 1,
      stdout: "",
      stderr:
        "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/pbiplint\n",
    };
    expect(viewState(notFound, "0.2.0")).toBe("missing");
  });
  it("is unknown when the registry could not be reached, so the run stops short of publishing", () => {
    const offline = {
      status: 1,
      stdout: "",
      stderr: "npm error code ENOTFOUND\nnpm error network request failed\n",
    };
    expect(viewState(offline, "0.2.0")).toBe("unknown");
    expect(viewState({ error: new Error("spawn npm ENOENT") }, "0.2.0")).toBe("unknown");
  });
});
