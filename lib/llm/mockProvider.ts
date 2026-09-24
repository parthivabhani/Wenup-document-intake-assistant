import { FIELD_QUESTIONS, nextQuestion } from "../questions";
import { type FieldKey, type FieldUpdate, type FieldValue, type LLMTurnOutput } from "../schema";
import { applyUpdates, missingFields } from "../stateManager";
import type { LLMProvider, LLMRequest } from "./provider";

/**
 * Deterministic stand-in for a real model, used when no API key is configured.
 * It asks one field at a time and records the answer to the question it asked,
 * so the full app (state, validation, preview, document) can be demoed offline.
 *
 * It intentionally does NOT try to understand free text; that's the model's job.
 * It returns the same JSON contract a real model must, so the rest of the
 * pipeline can't tell the difference.
 */
export function createMockProvider(): LLMProvider {
  return {
    name: "mock",
    async complete({ messages, context }: LLMRequest): Promise<string> {
      const { state } = context;
      const answer = messages[messages.length - 1]?.content.trim() ?? "";
      const isFirstTurn = messages.filter((m) => m.role === "user").length === 1;

      const pending = state.unconfirmed[0];
      const target: FieldKey | undefined = pending?.field ?? missingFields(state)[0];

      let output: LLMTurnOutput;
      if (!target) {
        output = { updates: [], reply: nextQuestion(state) };
      } else if (isFirstTurn && /^(hi|hello|hey|start)\b/i.test(answer)) {
        output = { updates: [], reply: `Hello! ${FIELD_QUESTIONS[target]}` };
      } else {
        const value = pending ? confirmPending(answer, pending.value) : interpret(target, answer);
        if (value === undefined) {
          output = { updates: [], reply: `Sorry, I didn't catch that. ${nextQuestion(state)}` };
        } else {
          const update: FieldUpdate = { field: target, value, status: "confirmed", is_correction: false, note: null };
          const after = applyUpdates(state, [update]).state;
          output = { updates: [update], reply: nextQuestion(after) };
        }
      }
      return JSON.stringify(output);
    },
  };
}

const YES = /^(y|yes|yeah|yep|correct|right|true|i do|worldwide|all)\b/i;
const NO = /^(n|no|nope|none|false|i don'?t|not)\b/i;

/** Returns `undefined` when the answer can't be mapped to the field's type. */
function interpret(field: FieldKey, answer: string): FieldValue | null | undefined {
  switch (field) {
    case "covers_worldwide_assets":
    case "has_children":
      return YES.test(answer) ? true : NO.test(answer) ? false : undefined;
    case "children_names":
    case "specific_gifts":
    case "additional_wishes":
      if (NO.test(answer)) return [];
      return answer
        .split(/,|;|\band\b/i)
        .map((s) => s.trim())
        .filter(Boolean);
    default:
      return answer || undefined;
  }
}

function confirmPending(answer: string, value: FieldValue): FieldValue | null | undefined {
  if (YES.test(answer)) return value;
  if (NO.test(answer)) return null;
  return undefined;
}
