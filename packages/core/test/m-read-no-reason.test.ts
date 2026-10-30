import { describe, expect, it, vi } from "vitest";
import { readM } from "../src/m/read.js";
import { msg } from "../src/messages/format.js";
import { buildModel } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";

// Microsoft's parser always gives a reason for the M it cannot read, so a parse that fails with
// none is stood in for here: parseM then returns an empty message.
vi.mock("../src/m/parse.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/m/parse.js")>()),
  parseM: async () => ({ ok: false, message: "" }),
}));

describe("readM, when the parser gives no reason (#98)", () => {
  it("nests parse.m.noReason in the issue's message, and writes its English into the reason", async () => {
    const text = "table Sales\n\tpartition Sales = m\n\t\tsource = 1\n";
    const path = "definition/tables/Sales.tmdl";
    const m = await readM(buildModel([parseTmdl(path, text)]), [{ path, text }]);
    expect(m.issues).toEqual([
      {
        file: path,
        line: 3,
        column: 12,
        text: "source = 1",
        reason: "M could not be parsed: the parser gave no reason",
        message: msg("parse.m.notParsed", { message: msg("parse.m.noReason") }),
      },
    ]);
  });
});
