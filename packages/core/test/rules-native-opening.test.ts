import { describe, expect, it } from "vitest";
import {
  FILTERS_PANE_STATE,
  LANDING_PAGE_NOT_SET,
  OPENING_PAGE_INVALID,
} from "../src/rules/pbiplint/opening.js";
import { j, lit, page, reportFindings, reportObjectIds } from "./report-helpers.js";

const pages = (header: Record<string, unknown>) => [
  { path: "definition/pages/pages.json", text: j({ pageOrder: ["p", "h"], ...header }) },
  page("p"),
  page("h", { visibility: "HiddenInViewMode" }),
];

const pretty = (v: unknown) => JSON.stringify(v, null, 2);
/** The 1-based line of the first occurrence of `needle` in `text`. */
const lineOf = (text: string, needle: string): number =>
  text.slice(0, text.indexOf(needle)).split("\n").length;
/** A report-level finding as the opening rules build it: no `object`, so config switches it off. */
const onReport = (file: string, line: number, detail: string) => ({
  objectType: "Report",
  objectName: "Report",
  objectId: "report",
  location: { file, line },
  detail,
});

describe("LANDING_PAGE_NOT_SET", () => {
  it("fires once on the report when pages.json names no landing page", () => {
    expect(reportObjectIds(LANDING_PAGE_NOT_SET, pages({ activePageName: "p" }))).toEqual([
      "report",
    ]);
    expect(
      reportObjectIds(LANDING_PAGE_NOT_SET, pages({ activePageName: "p", landingPageName: "p" })),
    ).toEqual([]);
  });
  it("names the page it opens on, at the activePageName line of pages.json", () => {
    const text = pretty({ pageOrder: ["p", "h"], activePageName: "p" });
    const files = [{ path: "definition/pages/pages.json", text }, ...pages({}).slice(1)];
    const line = lineOf(text, '"activePageName"');
    expect(line).toBeGreaterThan(1);
    expect(reportFindings(LANDING_PAGE_NOT_SET, files)).toEqual([
      onReport(
        "definition/pages/pages.json",
        line,
        'opens on "Page p", the page open when it was saved',
      ),
    ]);
  });
  it("opens on the first page when pages.json names no active page, and is quiet with no pages", () => {
    expect(reportFindings(LANDING_PAGE_NOT_SET, pages({}))).toEqual([
      onReport("definition/pages/pages.json", 1, 'opens on "Page p", the first page'),
    ]);
    // pageOrder decides which page is first, not the folder names.
    expect(reportFindings(LANDING_PAGE_NOT_SET, pages({ pageOrder: ["h", "p"] }))[0]!.detail).toBe(
      'opens on "Page h", the first page',
    );
    expect(
      reportObjectIds(LANDING_PAGE_NOT_SET, [
        { path: "definition/pages/pages.json", text: j({ pageOrder: [] }) },
      ]),
    ).toEqual([]);
    expect(
      reportObjectIds(LANDING_PAGE_NOT_SET, [{ path: "definition/report.json", text: j({}) }]),
    ).toEqual([]);
  });
  it("says nothing when pages.json was not read, because nothing then says which page opens", () => {
    // Absent: the pages are there, but no pages.json names an order or an active page.
    expect(
      reportObjectIds(LANDING_PAGE_NOT_SET, [
        { path: "definition/report.json", text: j({}) },
        page("a"),
        page("b"),
      ]),
    ).toEqual([]);
    // Unreadable: a pages.json saved mid-merge is a parse issue, not a report with no active page.
    const conflicted = [
      "{",
      '  "pageOrder": ["b", "a"],',
      "<<<<<<< HEAD",
      '  "activePageName": "b"',
      "=======",
      '  "activePageName": "a"',
      ">>>>>>> theirs",
      "}",
    ].join("\n");
    expect(
      reportObjectIds(LANDING_PAGE_NOT_SET, [
        { path: "definition/report.json", text: j({}) },
        { path: "definition/pages/pages.json", text: conflicted },
        page("a"),
        page("b"),
      ]),
    ).toEqual([]);
  });
  it("never names a page the report does not have", () => {
    expect(reportFindings(LANDING_PAGE_NOT_SET, pages({ activePageName: "gone" }))).toEqual([
      onReport(
        "definition/pages/pages.json",
        1,
        'no landing page set; the active page "gone" does not exist',
      ),
    ]);
  });
});

describe("OPENING_PAGE_INVALID", () => {
  it("fires when the landing page is missing, or without one when the active page is missing or hidden", () => {
    expect(reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "h" }))).toEqual([
      "report",
    ]);
    expect(reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "gone" }))).toEqual([
      "report",
    ]);
    expect(
      reportObjectIds(
        OPENING_PAGE_INVALID,
        pages({ activePageName: "p", landingPageName: "gone" }),
      ),
    ).toEqual(["report"]);
    expect(
      reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "h", landingPageName: "p" })),
    ).toEqual([]);
    // A hidden landing page is a supported design: readers always open on it (spec 8.2, amended 2026-09-23).
    expect(
      reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "p", landingPageName: "h" })),
    ).toEqual([]);
    expect(reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "p" }))).toEqual([]);
    // With neither page named, the report opens on the first page, which is there by definition.
    expect(reportObjectIds(OPENING_PAGE_INVALID, pages({}))).toEqual([]);
  });
  it("says which page is wrong and why, at the line of pages.json that names it", () => {
    const text = pretty({ pageOrder: ["p", "h"], activePageName: "h", landingPageName: "gone" });
    const header = { path: "definition/pages/pages.json", text };
    const rest = pages({}).slice(1);
    const landing = lineOf(text, '"landingPageName"');
    expect(landing).toBeGreaterThan(1);
    expect(reportFindings(OPENING_PAGE_INVALID, [header, ...rest])).toEqual([
      onReport("definition/pages/pages.json", landing, 'landing page "gone" does not exist'),
    ]);
    const activeText = pretty({ pageOrder: ["p", "h"], activePageName: "h" });
    expect(
      reportFindings(OPENING_PAGE_INVALID, [{ ...header, text: activeText }, ...rest]),
    ).toEqual([
      onReport(
        "definition/pages/pages.json",
        lineOf(activeText, '"activePageName"'),
        'active page "Page h" is hidden from readers',
      ),
    ]);
    expect(reportFindings(OPENING_PAGE_INVALID, pages({ activePageName: "gone" }))).toEqual([
      onReport("definition/pages/pages.json", 1, 'active page "gone" does not exist'),
    ]);
  });
});

describe("FILTERS_PANE_STATE", () => {
  const report = (pane: Record<string, unknown>) => [
    {
      path: "definition/report.json",
      text: j({ objects: { outspacePane: [{ properties: pane }] } }),
    },
  ];
  it("says nothing without a policy, and fires when the saved state disagrees with one", () => {
    expect(reportObjectIds(FILTERS_PANE_STATE, report({ expanded: lit("true") }))).toEqual([]);
    expect(
      reportObjectIds(FILTERS_PANE_STATE, report({ expanded: lit("true") }), undefined, {
        expect: "closed",
      }),
    ).toEqual(["report"]);
    expect(
      reportObjectIds(FILTERS_PANE_STATE, report({ expanded: lit("true") }), undefined, {
        expect: "open",
      }),
    ).toEqual([]);
    // An absent `expanded` is open: Desktop writes "false" for a collapsed pane and no key for an open one.
    expect(reportObjectIds(FILTERS_PANE_STATE, report({}), undefined, { expect: "open" })).toEqual(
      [],
    );
    expect(
      reportObjectIds(FILTERS_PANE_STATE, report({}), undefined, { expect: "closed" }),
    ).toEqual(["report"]);
    expect(
      reportObjectIds(FILTERS_PANE_STATE, report({ visible: lit("false") }), undefined, {
        expect: "closed",
      }),
    ).toEqual(["report"]);
  });
  it("claims a saved state only when report.json records one", () => {
    const details = (pane: Record<string, unknown>, expect: string) =>
      reportFindings(FILTERS_PANE_STATE, report(pane), undefined, { expect }).map((f) => f.detail);
    expect(details({}, "closed")).toEqual([
      "open by default (report.json does not record it); the policy expects closed",
    ]);
    expect(details({ expanded: lit("true") }, "closed")).toEqual([
      "saved open; the policy expects closed",
    ]);
    expect(details({ expanded: lit("false") }, "open")).toEqual([
      "saved closed; the policy expects open",
    ]);
    expect(details({ visible: lit("false"), expanded: lit("true") }, "open")).toEqual([
      "saved hidden from readers; the policy expects open",
    ]);
  });
  it("points at the property that decides the state in report.json", () => {
    const text = (properties: Record<string, unknown>) =>
      pretty({
        themeCollection: { baseTheme: { name: "CY24SU10" } },
        objects: { outspacePane: [{ properties }] },
      });
    const run = (t: string, expect: string) =>
      reportFindings(FILTERS_PANE_STATE, [{ path: "definition/report.json", text: t }], undefined, {
        expect,
      });
    const expanded = text({ expanded: lit("true") });
    const line = lineOf(expanded, '"expanded"');
    expect(line).toBeGreaterThan(1);
    expect(run(expanded, "closed")).toEqual([
      onReport("definition/report.json", line, "saved open; the policy expects closed"),
    ]);
    // `visible: false` hides the pane whatever `expanded` says, so it is the line that decides.
    const hidden = text({ expanded: lit("true"), visible: lit("false") });
    expect(run(hidden, "open")[0]!.location).toEqual({
      file: "definition/report.json",
      line: lineOf(hidden, '"visible"'),
    });
    expect(run(text({}), "closed")[0]!.location).toEqual({
      file: "definition/report.json",
      line: 1,
    });
  });
});
