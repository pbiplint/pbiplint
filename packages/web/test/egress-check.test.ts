import { describe, expect, it } from "vitest";
import {
  browserCandidates,
  DEBUGGING_DISALLOWED,
  leavesOrigin,
  parseArgs,
} from "../egress/egress-check.mjs";

describe("leavesOrigin", () => {
  const origin = "https://pbiplint.z13.web.core.windows.net";
  it("passes the site's own files, at any path or query", () => {
    expect(leavesOrigin(`${origin}/`, origin)).toBe(false);
    expect(leavesOrigin(`${origin}/assets/home-abc.js?x=1`, origin)).toBe(false);
  });
  it("catches any web or socket request to another origin, including the same host on another port or scheme", () => {
    for (const url of [
      "https://pbiplint.com/latest/",
      "https://fonts.googleapis.com/css",
      "http://pbiplint.z13.web.core.windows.net/",
      "https://pbiplint.z13.web.core.windows.net:8443/",
      "wss://pbiplint.z13.web.core.windows.net/socket",
      "ws://example.com/",
    ])
      expect(leavesOrigin(url, origin), url).toBe(true);
  });
  it("ignores what never touches the network: data and blob URLs, and the browser's own pages", () => {
    for (const url of [
      "data:image/svg+xml,<svg/>",
      `blob:${origin}/6c1f0f7e`,
      "about:blank",
      "chrome-extension://abc/x.js",
    ])
      expect(leavesOrigin(url, origin), url).toBe(false);
  });
});

describe("parseArgs", () => {
  it("reads the site's address, and a browser to use", () => {
    expect(parseArgs(["https://lint.corp.example/"])).toEqual({
      url: "https://lint.corp.example/",
      browser: undefined,
    });
    expect(parseArgs(["https://lint.corp.example/", "--browser", "/opt/edge/msedge"])).toEqual({
      url: "https://lint.corp.example/",
      browser: "/opt/edge/msedge",
    });
  });
  it("refuses a missing or non-web address, a flag with no value, and a flag it does not know", () => {
    expect(() => parseArgs([])).toThrow("Usage:");
    expect(() => parseArgs(["file:///C:/site/index.html"])).toThrow("http or https");
    expect(() => parseArgs(["not a url"])).toThrow("http or https");
    expect(() => parseArgs(["https://a.example/", "--browser"])).toThrow("--browser needs");
    expect(() => parseArgs(["https://a.example/", "--proxy", "x"])).toThrow("--proxy");
  });
});

describe("browserCandidates", () => {
  it("looks for Edge and Chrome where Windows installs them", () => {
    const list = browserCandidates("win32", {
      PROGRAMFILES: "C:\\Program Files",
      "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local",
    });
    expect(list).toContain("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(list).toContain("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    expect(list).toContain("C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe");
  });
  it("looks in the Applications folder on a Mac and on the usual paths on Linux", () => {
    expect(browserCandidates("darwin", {})).toContain(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
    expect(browserCandidates("linux", {})).toContain("/usr/bin/google-chrome");
  });
});

describe("DEBUGGING_DISALLOWED", () => {
  it("recognizes the message a browser prints when policy turns remote debugging off", () => {
    expect(
      DEBUGGING_DISALLOWED.test("DevTools remote debugging is disallowed by the system admin."),
    ).toBe(true);
  });
});
