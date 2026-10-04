// Stands in for @modelcontextprotocol/server/_shims in the bundle (build.mjs aliases it here).
// The SDK's own shim brings a JSON Schema validator built on ajv, which the server uses only to
// check the answer to an elicitation. pbiplint never asks for one, so the validator here refuses,
// and ajv stays out of the CLI's bundle.
import process from "node:process";

export class DefaultJsonSchemaValidator {
  getValidator(): never {
    throw new Error("pbiplint mcp asks for no elicitation, so it validates no JSON Schema");
  }
}

export { process };
