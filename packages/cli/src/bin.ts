import { errorKind } from "@pbiplint/core";
import { logSafe } from "./log-safe.js";
import { main } from "./main.js";

// `pbiplint model | head` closes stdout early; exit quietly instead of dumping an EPIPE stack.
process.stdout.on("error", (e) => {
  if ((e as NodeJS.ErrnoException).code === "EPIPE") process.exit(0);
  throw e;
});

main(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  cwd: () => process.cwd(),
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    // Only the class: a message can hold the model's text (v3 spec, section 11.3). The line is
    // fixed text, escaped for CI logs as every line main writes to stderr is.
    process.stderr.write(
      logSafe(
        `pbiplint: something went wrong: ${errorKind(e)}. Please report this at https://github.com/pbiplint/pbiplint/issues.\n`,
      ),
    );
    process.exitCode = 2;
  });
