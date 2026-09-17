#!/usr/bin/env node
// pbip-lint is an alias for pbiplint, so a guessed hyphen still installs and runs the right thing.
// Importing the real command in process keeps its exit code, its output, and its EPIPE handling,
// with no second process to forward signals to. The specifier below is pinned to the bin that
// pbiplint declares by packages/alias/test/alias.test.ts, so a rename cannot break it quietly.
import "pbiplint/dist/pbiplint.mjs";
