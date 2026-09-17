#!/usr/bin/env node
// Copies the repo-root license text next to the package so npm ships it.
// There is no NOTICE here: that file covers the vendored Microsoft ruleset, which this package
// does not contain. It travels with pbiplint, which is always installed alongside.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(here, "../../..", "LICENSE"), join(here, "..", "LICENSE"));
console.log("copied LICENSE to packages/alias");
