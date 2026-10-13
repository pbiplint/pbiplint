import {
  DefaultSettings,
  TaskUtils,
  type Language,
  type Parser,
} from "@microsoft/powerquery-parser";

/** A place in M text, both 0-based: the line, and the UTF-16 code unit in that line. */
export interface MPosition {
  lineNumber: number;
  lineCodeUnit: number;
}

/** The parser's reading of one M expression: its tree, or why it has none and where. */
export type MParse =
  | { ok: true; ast: Language.Ast.TNode; nodeIdMapCollection: Parser.NodeIdMap.Collection }
  | { ok: false; message: string; position?: MPosition };

/**
 * The places a parser error can carry: the token an expected-token error found, the start of a
 * sequence or of tokens left over, or a lex error's grapheme position. Each has lineNumber and
 * lineCodeUnit, 0-based.
 */
interface ErrorWithPosition {
  foundToken?: { token: { positionStart: MPosition } };
  positionStart?: MPosition;
  graphemePosition?: MPosition;
}

/**
 * Parses one M expression with Microsoft's parser and its default settings, whose locale is en-US,
 * so every message is English. Never throws: an error in the parser itself is reported like a
 * parse error, with no position.
 */
export async function parseM(text: string): Promise<MParse> {
  let task;
  try {
    task = await TaskUtils.tryLexParse(DefaultSettings, text);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  if (TaskUtils.isParseStageOk(task))
    return { ok: true, ast: task.ast, nodeIdMapCollection: task.nodeIdMapCollection };
  const error = (task as { error?: { message?: string; innerError?: ErrorWithPosition } }).error;
  const inner = error?.innerError;
  const at =
    inner?.foundToken?.token.positionStart ?? inner?.positionStart ?? inner?.graphemePosition;
  return {
    ok: false,
    message: error?.message ?? "the parser gave no reason",
    ...(at ? { position: { lineNumber: at.lineNumber, lineCodeUnit: at.lineCodeUnit } } : {}),
  };
}
