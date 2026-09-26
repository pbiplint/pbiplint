import { showControls } from "@pbiplint/core";
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
    // As main does for every line it writes to stderr, the message's control characters are shown.
    process.stderr.write(
      `${showControls(`pbiplint: ${e instanceof Error ? e.message : String(e)}`)}\n`,
    );
    process.exitCode = 2;
  });
