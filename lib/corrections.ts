import type { ChatMessage } from "./schema";

/**
 * Deterministic second key for overwriting a known value.
 *
 * The model marks updates with `is_correction`, but in testing it sometimes
 * flagged a plain contradiction ("leave my watch to my son Tom" after "I have
 * no children") as a correction. So an overwrite needs BOTH the model's flag
 * AND evidence in the user's own words:
 *   - correction language ("actually", "sorry, I meant", "change it to"...), or
 *   - a reply to the app's own "which is correct?" conflict question.
 *
 * Failure modes are deliberately lopsided: missing a genuine correction costs
 * one extra confirmation question; wrongly accepting one silently corrupts data.
 */
const CORRECTION_CUES =
  /\b(actually|sorry|apologies|my mistake|mistake|typo|i meant|meant to say|i mean|correct(ion)?|change|changed|update|instead|wrong|rather|scratch that|on second thought|not .{1,40} but|replace)\b/i;

export const CONFLICT_QUESTION_MARKER = "Which is correct?";

export function userSignalledCorrection(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (last?.role !== "user") return false;
  if (CORRECTION_CUES.test(last.content)) return true;

  const previous = messages[messages.length - 2];
  return previous?.role === "assistant" && previous.content.includes(CONFLICT_QUESTION_MARKER);
}
