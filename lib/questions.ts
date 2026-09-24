import { FIELD_LABELS, type FieldKey, type IntakeState } from "./schema";
import { missingFields } from "./stateManager";

/**
 * Deterministic interview questions. Used by the mock provider and as the
 * safe fallback when the model fails, so the interview always makes progress
 * even without a working LLM.
 */
export const FIELD_QUESTIONS: Record<FieldKey, string> = {
  full_name: "What is your full name?",
  home_address: "What is your home address?",
  covers_worldwide_assets:
    "Should this document cover your assets worldwide, or only those in one country?",
  has_children: "Do you have any children?",
  children_names: "What are your children's names?",
  "executor.name": "Who would you like to appoint as your executor?",
  "executor.relationship": "What is your executor's relationship to you?",
  specific_gifts:
    "Are there any specific gifts you'd like to leave to someone? (It's fine to say none.)",
  additional_wishes:
    "Do you have any additional wishes you'd like to include? (It's fine to say none.)",
};

export const COMPLETE_MESSAGE =
  "Thank you, I have everything I need. Your draft document is ready in the preview. You can still correct anything by telling me what to change.";

export function nextQuestion(state: IntakeState): string {
  const pending = state.unconfirmed[0];
  if (pending) {
    return `Just to confirm your ${FIELD_LABELS[pending.field].toLowerCase()}: ${formatValue(pending.value)}. Is that right?`;
  }
  const [next] = missingFields(state);
  return next ? FIELD_QUESTIONS[next] : COMPLETE_MESSAGE;
}

function formatValue(value: string | boolean | string[]): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return value;
}
