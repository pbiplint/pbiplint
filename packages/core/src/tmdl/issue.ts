import { formatMessage, type Message } from "../messages/format.js";
import type { ParseIssue } from "./types.js";

/**
 * A parse issue on `file`'s line `line`, quoting `text`, for the reason `message`, with its
 * `reason` the message in English. Every parser makes its issues here, so the two always agree.
 */
export const parseIssue = (
  file: string,
  line: number,
  text: string,
  message: Message,
): ParseIssue => ({ file, line, text, reason: formatMessage(message), message });
