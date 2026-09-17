import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "examples/**",
      "tests/fixtures/**",
      "packages/web/rules/**",
      "packages/web/about/**",
      "**/test-results/**",
      "**/playwright-report/**",
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
    // Plain Node scripts under scripts/ run on Node, not in a browser.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
);
