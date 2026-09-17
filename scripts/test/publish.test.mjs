import { describe, expect, it } from "vitest";
import { viewState } from "../publish.mjs";

describe("viewState", () => {
  it("is published only when the registry answered with the version asked for", () => {
    expect(viewState({ status: 0, stdout: "0.1.0\n", stderr: "" }, "0.1.0")).toBe("published");
    expect(viewState({ status: 0, stdout: "0.0.9\n", stderr: "" }, "0.1.0")).toBe("unknown");
  });
  // npm words a 404 differently depending on what is missing, and both wordings are real: "Not
  // Found - GET <registry>/<name>" when no such package exists at all, which happens only on a
  // first-ever publish, and "No match found for version" when the package is there and this
  // version is not, which is every release after the first. Both stderr samples below came from
  // running npm view against the real registry.
  it("is missing only when the registry answered 404", () => {
    const packageUnknown = {
      status: 1,
      stdout: "",
      stderr:
        "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/pbiplint\n",
    };
    expect(viewState(packageUnknown, "0.2.0")).toBe("missing");
    const versionUnknown = {
      status: 1,
      stdout: "",
      stderr: "npm error code E404\nnpm error 404 No match found for version 0.2.0\n",
    };
    expect(viewState(versionUnknown, "0.2.0")).toBe("missing");
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
