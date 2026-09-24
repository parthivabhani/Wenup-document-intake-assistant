import { runTurn, type LLMMode, type LLMProvider } from "./llm";
import { FIELD_LABELS, type ChatRequest, type ChatResponse, type FieldUpdate, type IntakeState } from "./schema";
import { FIELD_QUESTIONS, nextQuestion } from "./questions";
import { userExpressedUncertainty, userSignalledCorrection } from "./userSignals";
import { applyUpdates } from "./stateManager";

/**
 * One chat turn, end to end: ask the model, validate and apply its proposed
 * updates, and decide what to say back. Pure application logic with injected
 * providers, so it's fully testable without HTTP or a real model.
 *
 * The model's reply is overridden whenever the code disagrees with it (a
 * contradiction was blocked, or a value was invalid), because the model may
 * have acknowledged something that never made it into the state.
 */
export async function handleChatTurn(
  { messages, state }: ChatRequest,
  llm: { mode: LLMMode; providers: LLMProvider[] },
): Promise<ChatResponse> {
  const result = await runTurn(state, messages, llm.providers);

  if (!result.ok) {
    console.error("LLM turn failed; using fallback question", result.errors);
    // Don't ask the user to rephrase when rephrasing can't help (no model reachable).
    const reply =
      result.reason === "unavailable"
        ? "Sorry, the assistant is temporarily unavailable, so I couldn't record that. Please try sending your message again in a moment."
        : `Sorry, I had trouble processing that. Could you try saying it another way? ${nextQuestion(state)}`;
    return {
      reply,
      state,
      applied: [],
      rejected: [],
      meta: { mode: "fallback", provider: null, attempts: result.attempts },
    };
  }

  const uncertain = userExpressedUncertainty(messages);
  const { updates, heldNone } = holdUncertainNone(result.output.updates, uncertain);

  const { state: newState, applied, rejected, conflicts } = applyUpdates(state, updates, {
    userSignalledCorrection: userSignalledCorrection(messages),
  });

  let reply = result.output.reply;
  const invalid = rejected.find((r) => r.kind === "invalid");
  if (conflicts.length > 0) {
    reply = conflicts.map((c) => c.question).join(" ");
  } else if (invalid) {
    reply = followUpForInvalid(invalid.update.field, newState);
  } else if (heldNone) {
    const label = FIELD_LABELS[heldNone].toLowerCase();
    reply = `That's fine, there's no rush. Should I record that you have no ${label}, or would you like to add some?`;
  }

  const notable = rejected.filter((r) => r.kind !== "ignored");
  if (notable.length > 0) console.warn("Rejected LLM updates", notable);

  return {
    reply,
    state: newState,
    applied,
    rejected,
    meta: {
      mode: llm.mode === "mock" ? "mock" : "llm",
      provider: result.provider,
      attempts: result.attempts,
    },
  };
}

/**
 * An explicit "none" ([]) proposed from a message where the user sounded unsure
 * ("idk what to leave") is held as unconfirmed instead of applied.
 */
function holdUncertainNone(
  updates: FieldUpdate[],
  uncertain: boolean,
): { updates: FieldUpdate[]; heldNone: FieldUpdate["field"] | null } {
  if (!uncertain) return { updates, heldNone: null };
  let heldNone: FieldUpdate["field"] | null = null;
  const adjusted = updates.map((u) => {
    if (u.status !== "confirmed" || !Array.isArray(u.value) || u.value.length > 0) return u;
    heldNone ??= u.field;
    return { ...u, status: "unconfirmed" as const, note: "You sounded unsure; confirm there are none" };
  });
  return { updates: adjusted, heldNone };
}

function followUpForInvalid(field: FieldUpdate["field"], state: IntakeState): string {
  const relationship = state.fields.executor.relationship;
  if (field === "executor.name" && relationship) {
    return `Noted that your executor is your ${relationship}. What is their name?`;
  }
  if (field === "children_names") return "What are your children's names?";
  return `I wasn't able to record your ${FIELD_LABELS[field].toLowerCase()} from that. ${FIELD_QUESTIONS[field]}`;
}
