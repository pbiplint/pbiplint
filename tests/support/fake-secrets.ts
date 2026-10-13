import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * m-zoo, the fixture that plants the made-up credentials (v3 spec, sections 9.5 and 11.1). Built
 * from the module's path, as a happy-dom test must: there `new URL(..., import.meta.url)` resolves
 * against the page's address rather than the file.
 */
export const SECRETS_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/m-zoo.SemanticModel",
);

/** A made-up credential as fixtures write one: it matches no real provider's format. */
const FAKE = /pbiplint-fixture-[a-z]+-\d{4}-notreal/g;

/**
 * Every made-up credential under a fixture folder, read from its files, so one a fixture adds later
 * is covered without a change here.
 */
export function fakeSecrets(dir: string = SECRETS_FIXTURE): string[] {
  const found = new Set<string>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true }))
      if (e.isDirectory()) walk(join(d, e.name));
      else for (const m of readFileSync(join(d, e.name), "utf8").matchAll(FAKE)) found.add(m[0]);
  };
  walk(dir);
  return [...found].sort();
}

/**
 * The pieces of `secrets` that `text` holds (v3 spec, section 11.3): a whole value, or any run of 8
 * characters of it that takes in any of its distinctive part, the text between `pbiplint-fixture-`
 * and `-notreal`. Runs inside the shared prefix or suffix alone are not looked for, since they say
 * nothing of one value. Empty when the text holds none.
 */
export function leaks(text: string, secrets: readonly string[]): string[] {
  const start = "pbiplint-fixture-".length;
  const out = new Set<string>();
  for (const secret of secrets) {
    if (text.includes(secret)) out.add(secret);
    const end = secret.length - "-notreal".length;
    for (let i = Math.max(0, start - 7); i < end && i + 8 <= secret.length; i++) {
      const run = secret.slice(i, i + 8);
      if (text.includes(run)) out.add(run);
    }
  }
  return [...out];
}
