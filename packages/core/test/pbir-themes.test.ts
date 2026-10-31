import { describe, expect, it } from "vitest";
import { lint, type LintFile } from "../src/engine/lint.js";
import { buildReport } from "../src/pbir/build.js";
import { isThemeFile } from "../src/pbir/themes.js";
import { isReportFile, routeFiles } from "../src/project/route.js";

const BASE = "StaticResources/SharedResources/BaseThemes/Base.json";
const CUSTOM = "StaticResources/RegisteredResources/Mine.json";

interface Named {
  base?: string;
  custom?: string;
  /** Each package's items, by package name. */
  packages?: Record<string, { name: string; path: string; type?: string }[]>;
}

const reportJson = ({ base, custom, packages }: Named): LintFile => ({
  path: "definition/report.json",
  text: JSON.stringify({
    themeCollection: {
      ...(base ? { baseTheme: { name: base, type: "SharedResources" } } : {}),
      ...(custom ? { customTheme: { name: custom, type: "RegisteredResources" } } : {}),
    },
    resourcePackages: Object.entries(packages ?? {}).map(([name, items]) => ({
      name,
      type: name,
      items,
    })),
  }),
});

const STOCK: Named = {
  base: "Base",
  custom: "Mine.json",
  packages: {
    SharedResources: [{ name: "Base", path: "BaseThemes/Base.json", type: "BaseTheme" }],
    RegisteredResources: [{ name: "Mine.json", path: "Mine.json", type: "CustomTheme" }],
  },
};

const theme = (path: string, body: object = { name: "t" }): LintFile => ({
  path,
  text: JSON.stringify(body),
});

const themes = (files: LintFile[]) => buildReport(files).report.themes;

describe("isThemeFile", () => {
  it("accepts JSON directly in the three theme folders, at the report root or below a report", () => {
    for (const p of [
      BASE,
      "StaticResources/SharedResources/BuiltInThemes/a.json",
      CUSTOM,
      `X.Report/${BASE}`,
      `a/X.Report/${CUSTOM}`,
    ]) {
      expect(isThemeFile(p), p).toBe(true);
      expect(isReportFile(p), p).toBe(true);
    }
  });
  it("refuses anything else under StaticResources", () => {
    for (const p of [
      "StaticResources/x.json",
      "StaticResources/SharedResources/a.json",
      "StaticResources/RegisteredResources/sub/a.json",
      "StaticResources/RegisteredResources/a.png",
      "StaticResources/SharedResources/BaseThemes/a.tmdl",
    ]) {
      expect(isThemeFile(p), p).toBe(false);
      expect(isReportFile(p), p).toBe(false);
    }
  });
  it("routes a theme file to the report, and StaticResources' other files nowhere", () => {
    const { report, model } = routeFiles([
      { path: CUSTOM, text: "" },
      { path: "StaticResources/x.json", text: "" },
    ]);
    expect(report.map((f) => f.path)).toEqual([CUSTOM]);
    expect(model).toEqual([]);
  });
});

describe("report.themes", () => {
  it("reads the base and custom themes report.json names", () => {
    const { base, custom } = themes([
      reportJson(STOCK),
      theme(BASE, { name: "Base", foreground: "#111111" }),
      theme(CUSTOM, { name: "Mine", foreground: "#222222" }),
    ]);
    expect(base).toMatchObject({ name: "Base", state: "read", file: BASE });
    expect(base!.json).toEqual({ name: "Base", foreground: "#111111" });
    expect(custom).toMatchObject({ name: "Mine.json", state: "read", file: CUSTOM });
    expect(custom!.text).toContain("#222222");
  });
  it("matches an item by name, whatever its type", () => {
    const { custom } = themes([
      reportJson({
        custom: "Mine.json",
        packages: { RegisteredResources: [{ name: "Mine.json", path: "Mine.json", type: "Image" }] },
      }),
      theme(CUSTOM),
    ]);
    expect(custom?.state).toBe("read");
  });
  it("prefers the package the theme's type names", () => {
    const { custom } = themes([
      reportJson({
        custom: "Mine.json",
        packages: {
          SharedResources: [{ name: "Mine.json", path: "BaseThemes/Base.json" }],
          RegisteredResources: [{ name: "Mine.json", path: "Mine.json" }],
        },
      }),
      theme(BASE),
      theme(CUSTOM),
    ]);
    expect(custom?.file).toBe(CUSTOM);
  });
  it("is absent when no file was given, when no item names it, or when its path leaves the package", () => {
    const paths = ["../../definition/report.json", "/Mine.json", "a/../Mine.json", "..\\Mine.json"];
    for (const path of paths) {
      const { custom } = themes([
        reportJson({ custom: "Mine.json", packages: { RegisteredResources: [{ name: "Mine.json", path }] } }),
        theme(CUSTOM),
      ]);
      expect(custom, path).toEqual({ name: "Mine.json", state: "absent" });
    }
    expect(themes([reportJson(STOCK)]).base).toEqual({ name: "Base", state: "absent" });
    expect(themes([reportJson({ base: "Base" }), theme(BASE)]).base).toEqual({
      name: "Base",
      state: "absent",
    });
  });
  it("has no themes when report.json names none, or there is no report.json", () => {
    expect(themes([reportJson({}), theme(CUSTOM)])).toEqual({});
    expect(themes([theme(CUSTOM)])).toEqual({});
  });
  it("raises a PARSE_ISSUE for a named theme that does not parse, and none for an unnamed one", () => {
    const broken = { path: CUSTOM, text: "{ not json" };
    const named = buildReport([reportJson(STOCK), broken, theme(BASE)]).report;
    expect(named.themes.custom).toMatchObject({ state: "unparsed", file: CUSTOM });
    expect(named.issues.map((i) => i.file)).toEqual([CUSTOM]);
    const unnamed = buildReport([reportJson({ base: "Base", packages: STOCK.packages }), broken]);
    expect(unnamed.report.issues).toEqual([]);
  });
  it("treats a named theme whose root is not an object as one that does not parse", () => {
    const { report } = buildReport([reportJson(STOCK), { path: CUSTOM, text: "[]" }]);
    expect(report.themes.custom?.state).toBe("unparsed");
    expect(report.issues).toHaveLength(1);
  });
  it("leaves the findings alone when an unnamed theme folder file is broken", async () => {
    const files = [
      reportJson({}),
      { path: "definition/pages/pages.json", text: JSON.stringify({ pageOrder: [] }) },
    ];
    const before = await lint(files);
    const after = await lint([...files, { path: CUSTOM, text: "{ not json" }]);
    expect(after.findings).toEqual(before.findings);
    expect(after.diagnostics).toEqual(before.diagnostics);
  });
});
