#!/usr/bin/env node
// Copies the repo-root license texts next to the core package so npm ships them.
// The vendored Microsoft ruleset is MIT-licensed and its notice travels with the code.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const name of ["NOTICE", "LICENSE"]) {
  copyFileSync(join(here, "../../..", name), join(here, "..", name));
}
console.log("copied NOTICE and LICENSE to packages/core");
