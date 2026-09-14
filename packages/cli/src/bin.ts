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
    process.stderr.write(`pbiplint: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 2;
  });
