import { describe, expect, it } from "vitest";
import { lookup, stylePresetOf, type Query } from "../src/colour/cascade.js";
import type { ThemeFile } from "../src/pbir/types.js";

const read = (json: Record<string, unknown>, file: string): ThemeFile => ({
  name: file,
  state: "read",
  file,
  json,
});
const BASE_FILE = "StaticResources/SharedResources/BaseThemes/B.json";
const CUSTOM_FILE = "StaticResources/RegisteredResources/C.json";

const query = (over: Partial<Query>): Query => ({
  themes: {},
  visualType: "card",
  object: "title",
  property: "fontColor",
  ...over,
});
const own = (entries: unknown) => ({
  entries,
  source: "visual" as const,
  file: "definition/pages/p/visuals/v/visual.json",
  pointer: "/visual/visualContainerObjects/title",
});

describe("lookup, layer by layer", () => {
  const base = read(
    { visualStyles: { card: { "*": { title: [{ fontColor: "b" }] } } } },
    BASE_FILE,
  );
  const custom = read(
    { visualStyles: { card: { "*": { title: [{ fontColor: "c" }] } } } },
    CUSTOM_FILE,
  );
  const mine = own([{ properties: { fontColor: "o" } }]);

  it("takes the visual's own setting over the custom theme over the base theme", () => {
    expect(lookup(query({ own: mine, themes: { base, custom } }))).toEqual({
      found: true,
      value: "o",
      source: "visual",
      file: mine.file,
      pointer: "/visual/visualContainerObjects/title/0/properties/fontColor",
    });
    expect(lookup(query({ themes: { base, custom } }))).toEqual({
      found: true,
      value: "c",
      source: "customTheme",
      file: CUSTOM_FILE,
      pointer: "/visualStyles/card/*/title/0/fontColor",
    });
    expect(lookup(query({ themes: { base } }))).toEqual({
      found: true,
      value: "b",
      source: "baseTheme",
      file: BASE_FILE,
      pointer: "/visualStyles/card/*/title/0/fontColor",
    });
  });
  it("stops at a theme that was not read, since it may set the property", () => {
    const gone: ThemeFile = { name: "gone", state: "absent" };
    expect(lookup(query({ themes: { base, custom: gone } }))).toEqual({
      found: false,
      why: "theme-not-read",
    });
    expect(lookup(query({ themes: { base: gone, custom: read({}, CUSTOM_FILE) } }))).toEqual({
      found: false,
      why: "theme-not-read",
    });
    expect(lookup(query({ themes: { base: gone, custom } }))).toMatchObject({ value: "c" });
    expect(lookup(query({ own: mine, themes: { base: gone, custom: gone } }))).toMatchObject({
      value: "o",
    });
  });
  it("is not set when everything named was read and nothing sets it", () => {
    expect(lookup(query({}))).toEqual({ found: false, why: "not-set" });
    expect(lookup(query({ property: "other", themes: { base } }))).toEqual({
      found: false,
      why: "not-set",
    });
  });
});

describe("lookup inside one theme", () => {
  /** A theme with the property set on each of these cards, as [visual type, preset, object]. */
  const theme = (...cards: [string, string, string][]): ThemeFile => {
    const styles: Record<string, Record<string, Record<string, unknown[]>>> = {};
    for (const [type, preset, object] of cards) {
      ((styles[type] ??= {})[preset] ??= {})[object] = [
        { fontColor: `${type}/${preset}/${object}` },
      ];
    }
    return read({ visualStyles: styles }, BASE_FILE);
  };
  const order: [string, string, string][] = [
    ["card", "P", "title"],
    ["card", "P", "*"],
    ["card", "*", "title"],
    ["card", "*", "*"],
    ["*", "*", "title"],
    ["*", "*", "*"],
  ];
  it("goes from the named preset and card down to the theme's every-visual card", () => {
    for (let i = 0; i < order.length; i++) {
      const base = theme(...order.slice(i));
      expect(lookup(query({ preset: "P", themes: { base } }))).toMatchObject({
        value: order[i]!.join("/"),
      });
    }
  });
  it("skips a preset's cards when the visual names none", () => {
    const base = theme(["card", "P", "title"], ["card", "*", "*"]);
    expect(lookup(query({ themes: { base } }))).toMatchObject({ value: "card/*/*" });
  });
  it("leaves out the every-visual card when told to", () => {
    const base = theme(["*", "*", "title"]);
    expect(lookup(query({ wildcard: false, themes: { base } }))).toEqual({
      found: false,
      why: "not-set",
    });
    const group = theme(["card", "*", "title"]);
    expect(lookup(query({ wildcard: false, themes: { base: group } }))).toMatchObject({
      value: "card/*/title",
    });
  });
  it("escapes a pointer's segments", () => {
    const base = read(
      { visualStyles: { card: { "a/b~c": { title: [{ fontColor: "x" }] } } } },
      BASE_FILE,
    );
    expect(lookup(query({ preset: "a/b~c", themes: { base } }))).toMatchObject({
      pointer: "/visualStyles/card/a~1b~0c/title/0/fontColor",
    });
  });
  it("takes only a theme's own keys", () => {
    const base = read(
      { visualStyles: { card: { "*": { title: [{ fontColor: "x" }] } } } },
      BASE_FILE,
    );
    for (const key of ["__proto__", "constructor", "toString"]) {
      expect(lookup(query({ visualType: key, themes: { base } })), key).toEqual({
        found: false,
        why: "not-set",
      });
      expect(lookup(query({ property: key, themes: { base } })), key).toEqual({
        found: false,
        why: "not-set",
      });
      expect(lookup(query({ object: key, themes: { base } })), key).toEqual({
        found: false,
        why: "not-set",
      });
    }
  });
  it("survives a theme whose cards are not what the schema says", () => {
    const base = read({ visualStyles: { card: { "*": { title: "x" } }, "*": 1 } }, BASE_FILE);
    expect(lookup(query({ themes: { base } }))).toEqual({ found: false, why: "not-set" });
    expect(lookup(query({ themes: { base: read({ visualStyles: 3 }, BASE_FILE) } }))).toEqual({
      found: false,
      why: "not-set",
    });
  });
});

describe("lookup and states", () => {
  const entries = own([
    { properties: { fontColor: "default" } },
    { properties: { fontColor: "hover" }, selector: { id: "hover" } },
    { properties: { fontColor: "field" }, selector: { metadata: "Sales.Amount" } },
    { properties: { fontColor: "point" }, selector: { data: [{}] } },
  ]);
  it("takes the state's entry, then the default's, and never another state's", () => {
    expect(lookup(query({ own: entries, state: "hover" }))).toMatchObject({ value: "hover" });
    expect(lookup(query({ own: entries, state: "selected" }))).toMatchObject({ value: "default" });
    expect(lookup(query({ own: entries }))).toMatchObject({ value: "default" });
    const onlyHover = own([{ properties: { fontColor: "h" }, selector: { id: "hover" } }]);
    expect(lookup(query({ own: onlyHover }))).toEqual({ found: false, why: "not-set" });
  });
  it("takes an explicit default selector as the default", () => {
    const explicit = own([{ properties: { fontColor: "d" }, selector: { id: "default" } }]);
    expect(lookup(query({ own: explicit }))).toMatchObject({ value: "d" });
  });
  it("does not take a field's or a data point's entry for the element's", () => {
    const fieldOnly = own([{ properties: { fontColor: "f" }, selector: { metadata: "x" } }]);
    expect(lookup(query({ own: fieldOnly }))).toEqual({ found: false, why: "not-set" });
  });
  it("reads a theme's states by $id", () => {
    const base = read(
      {
        visualStyles: {
          card: { "*": { title: [{ fontColor: "d" }, { $id: "hover", fontColor: "h" }] } },
        },
      },
      BASE_FILE,
    );
    expect(lookup(query({ state: "hover", themes: { base } }))).toMatchObject({
      value: "h",
      pointer: "/visualStyles/card/*/title/1/fontColor",
    });
    expect(lookup(query({ themes: { base } }))).toMatchObject({ value: "d" });
  });
  it("lets the last matching entry win", () => {
    const twice = own([{ properties: { fontColor: "1" } }, { properties: { fontColor: "2" } }]);
    expect(lookup(query({ own: twice }))).toMatchObject({
      value: "2",
      pointer: "/visual/visualContainerObjects/title/1/properties/fontColor",
    });
  });
  it("passes over an entry that does not set the property", () => {
    const some = own([{ properties: { fontColor: "1" } }, { properties: { show: "x" } }]);
    expect(lookup(query({ own: some }))).toMatchObject({ value: "1" });
  });
});

describe("stylePresetOf", () => {
  it("reads the preset a visual names", () => {
    const json = {
      visual: {
        visualContainerObjects: {
          stylePreset: [{ properties: { name: { expr: { Literal: { Value: "'Bold'" } } } } }],
        },
      },
    };
    expect(stylePresetOf(json)).toBe("Bold");
  });
  it("is undefined when none is named", () => {
    for (const json of [undefined, {}, { visual: {} }, { visual: { visualContainerObjects: {} } }])
      expect(stylePresetOf(json)).toBeUndefined();
  });
});
