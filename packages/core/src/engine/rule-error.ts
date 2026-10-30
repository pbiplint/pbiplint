import { formatMessage, msg, type Message } from "../messages/format.js";

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
 * What a rule error says of what was thrown: the thrown error's class alone, never its message,
 * since a message can hold the model's text (v3 spec, section 11.3, amended October 28, 2026). A
 * name outside the built-in classes gives `Error`, as does a `name` or `message` that throws when
 * read. Running out of stack space, the likeliest failure on deep M, is named, its message compared
 * and not printed. Anything thrown that is not an `Error` gives `a value that is not an Error`.
 */
export function errorKindMessage(e: unknown): Message {
  try {
    if (!(e instanceof Error)) return msg("ruleError.notAnError");
    const name = String(e.name);
    const kind = CLASSES.has(name) ? name : "Error";
    return msg(
      OUT_OF_STACK.has(String(e.message)) ? "ruleError.outOfStack" : "ruleError.errorClass",
      {
        class: kind,
      },
    );
  } catch {
    return msg("ruleError.errorClass", { class: "Error" });
  }
}

/** The text a rule error prints: `errorKindMessage` in English (`RangeError (out of stack space)`). */
export const errorKind = (e: unknown): string => formatMessage(errorKindMessage(e));
