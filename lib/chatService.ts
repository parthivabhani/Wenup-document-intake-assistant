import { runTurn, type LLMMode, type LLMProvider } from "./llm";
import { FIELD_LABELS, type ChatRequest, type ChatResponse } from "./schema";
import { FIELD_QUESTIONS, nextQuestion } from "./questions";
import { userSignalledCorrection } from "./corrections";
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
    return {
      reply: `Sorry, I had trouble processing that. Could you try saying it another way? ${nextQuestion(state)}`,
      state,
      applied: [],
      rejected: [],
      meta: { mode: "fallback", provider: null, attempts: result.attempts },
    };
  }

  const { state: newState, applied, rejected, conflicts } = applyUpdates(state, result.output.updates, {
    userSignalledCorrection: userSignalledCorrection(messages),
  });

  let reply = result.output.reply;
  if (conflicts.length > 0) {
    reply = conflicts.map((c) => c.question).join(" ");
  } else if (rejected.some((r) => r.kind === "invalid")) {
    const field = rejected.find((r) => r.kind === "invalid")!.update.field;
    reply = `I wasn't able to record your ${FIELD_LABELS[field].toLowerCase()} from that. ${FIELD_QUESTIONS[field]}`;
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
