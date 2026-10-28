/** The built-in classes an error may name; any other name is shown as `Error`. */
const CLASSES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
  "InternalError",
]);

/** What V8, WebKit, and Firefox say when the stack runs out. */
const OUT_OF_STACK = new Set([
  "Maximum call stack size exceeded",
  "Maximum call stack size exceeded.",
  "too much recursion",
]);

/**
 * The text a rule error prints: the thrown error's class alone, never its message, since a message
 * can hold the model's text (v3 spec, section 11.3, amended October 28, 2026). A name outside the
 * built-in classes gives `Error`, as does a `name` or `message` that throws when read. Running out
 * of stack space, the likeliest failure on deep M, is named, its message compared and not printed.
 * Anything thrown that is not an `Error` gives `a value that is not an Error`.
 */
export function errorKind(e: unknown): string {
  try {
    if (!(e instanceof Error)) return "a value that is not an Error";
    const name = String(e.name);
    const kind = CLASSES.has(name) ? name : "Error";
    return OUT_OF_STACK.has(String(e.message)) ? `${kind} (out of stack space)` : kind;
  } catch {
    return "Error";
  }
}
