import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../tests/support/temp-dir.js";
import { fetchSurveyRules } from "../fetch-survey-rules.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const entry = (id, path, text) => ({
  id,
  repository: "someone/rules",
  path,
  commit: "0123456789abcdef0123456789abcdef01234567",
  sha256: sha(text),
});

/** The parts of a fetch response the script reads. */
const response = (body, status) => ({
  status,
  ok: status >= 200 && status < 300,
  arrayBuffer: async () => Buffer.from(body),
});

/** A fetch that answers from a map of URL to body, and 404 for any other URL. */
const stub = (bodies) => async (url) =>
  bodies.has(url) ? response(bodies.get(url), 200) : response("Not Found", 404);

const base =
  "https://raw.githubusercontent.com/someone/rules/0123456789abcdef0123456789abcdef01234567/";

describe("fetchSurveyRules", () => {
  it("writes each file by its place in the list, and an index naming each one or why it is unavailable", async () => {
    const dir = tempDir("fetch-survey-rules");
    const a = '[{"ID":"A","Scope":"Measure","Expression":"true"}]';
    const c = '[{"ID":"C","Scope":"Table","Expression":"false"}]';
    const files = [
      entry("someone/rules/a.json", "a.json", a),
      entry("someone/rules/gone b.json", "gone b.json", "never fetched"),
      entry("someone/rules/c.json", "c.json", c),
    ];
    const bodies = new Map([
      [`${base}a.json`, a],
      [`${base}c.json`, c],
    ]);
    const index = await fetchSurveyRules(files, dir, stub(bodies));
    expect(index).toEqual({
      "someone/rules/a.json": "0.json",
      "someone/rules/gone b.json": { unavailable: `${base}gone%20b.json returned 404` },
      "someone/rules/c.json": "2.json",
    });
    expect(JSON.parse(readFileSync(join(dir, "index.json"), "utf8"))).toEqual(index);
    expect(readdirSync(dir).sort()).toEqual(["0.json", "2.json", "index.json"]);
    expect(readFileSync(join(dir, "2.json"), "utf8")).toBe(c);
  });

  it("stops on a file whose sha256 does not match, naming it", async () => {
    const dir = tempDir("fetch-survey-rules");
    const files = [entry("someone/rules/a.json", "a.json", "the published text")];
    const bodies = new Map([[`${base}a.json`, "changed text"]]);
    await expect(fetchSurveyRules(files, dir, stub(bodies))).rejects.toThrow(
      /someone\/rules\/a\.json: sha256 .*, expected /,
    );
  });

  it("stops on an answer other than 404 that is not a success", async () => {
    const dir = tempDir("fetch-survey-rules");
    const files = [entry("someone/rules/a.json", "a.json", "x")];
    const failing = async () => response("busy", 503);
    await expect(fetchSurveyRules(files, dir, failing)).rejects.toThrow(/returned 503/);
  });
});
