import js from "@eslint/js";
import tseslint from "typescript-eslint";

const TEMP_DIR =
  "Make a test's folder with tempDir from tests/support/temp-dir.ts, which removes it when the test ends.";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "examples/**",
      "tests/fixtures/**",
      "packages/web/rules/**",
      "packages/web/about/**",
      "packages/web/privacy/**",
      "**/test-results/**",
      "**/playwright-report/**",
      // Git-ignored working notes and research scratch, never part of a commit.
      ".superpowers/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      // A leading underscore marks a parameter that is intentionally unused, such as an
      // options argument a formatter accepts to keep one signature across all formatters.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // localeCompare with no locale sorts by whatever locale the machine running the code
      // happens to have, so generated pages, a report's findings, and the order files reach the
      // parser all depend on where the code ran. Tests are held to it too: a fixture that sorts
      // one way locally and another way in CI is the same hazard wearing a different hat.
      "no-restricted-syntax": [
        "error",
        {
          selector: 'CallExpression[callee.property.name="localeCompare"][arguments.length<2]',
          message:
            'Pass an explicit locale, as in localeCompare(other, "en"), so the order does not depend on the machine.',
        },
      ],
    },
  },
  {
    // Plain Node scripts under scripts/ run on Node, not in a browser. Node has had a global
    // fetch since 18; scripts/te-expectations.mjs fetches the survey's rule files with it.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", fetch: "readonly" },
    },
  },
  {
    // A unit test's folder comes from tempDir, which removes it when the test ends; the run's
    // guard sees only folders made that way. The browser suite has its own withTempFolder.
    files: ["packages/*/test/**", "scripts/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...["fs", "node:fs", "fs/promises", "node:fs/promises"].map((name) => ({
              name,
              importNames: ["mkdtemp", "mkdtempSync"],
              message: TEMP_DIR,
            })),
            ...["os", "node:os"].map((name) => ({
              name,
              importNames: ["tmpdir"],
              message: TEMP_DIR,
            })),
          ],
        },
      ],
      // The same functions reached through the module, as in os.tmpdir() or fs.mkdtempSync().
      "no-restricted-properties": [
        "error",
        ...["mkdtemp", "mkdtempSync", "tmpdir"].map((property) => ({
          property,
          message: TEMP_DIR,
        })),
      ],
    },
  },
);
