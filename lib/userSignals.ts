import type { ChatMessage } from "./schema";

/**
 * Deterministic checks on the user's own words, used as a second opinion on
 * what the model proposes. Both are deliberately conservative.
 */

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

/**
 * "idk", "not sure", "no idea"... In testing, the model turned "idk what to leave"
 * into specific_gifts = [] ("none"), which silently completed the draft. Uncertainty
 * is not an answer, so an explicit "none" given in an uncertain message is held
 * for confirmation instead of being applied.
 */
const UNCERTAINTY_CUES =
  /\b(idk|dunno|not sure|unsure|no idea|don'?t know|do not know|haven'?t decided|not decided|undecided|maybe|perhaps|i guess|not yet)\b/i;

export function userExpressedUncertainty(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  return last?.role === "user" && UNCERTAINTY_CUES.test(last.content);
}
