/**
 * Raw model outputs (exactly as a provider would return them) used to test the
 * pipeline without calling a real model.
 */
import type { LLMTurnOutput } from "@/lib/schema";

const json = (o: LLMTurnOutput) => JSON.stringify(o);

export const VALID = {
  /** "I'm Jane Smith, my brother James will be executor." */
  multiField: json({
    updates: [
      { field: "full_name", value: "Jane Smith", status: "confirmed", is_correction: false, note: null },
      { field: "executor.name", value: "James", status: "confirmed", is_correction: false, note: null },
      { field: "executor.relationship", value: "brother", status: "confirmed", is_correction: false, note: null },
    ],
    reply: "Thanks Jane, I've noted James, your brother, as executor. What is your home address?",
  }),
  /** "Actually, make my sister Sarah the executor." */
  correction: json({
    updates: [
      { field: "executor.name", value: "Sarah", status: "confirmed", is_correction: true, note: null },
      { field: "executor.relationship", value: "sister", status: "confirmed", is_correction: true, note: null },
    ],
    reply: "No problem, I've changed your executor to your sister Sarah.",
  }),
  /** Off-topic message: nothing to record. */
  noUpdates: json({
    updates: [],
    reply: "I can only help with your wishes document. What is your full name?",
  }),
};

export const AMBIGUOUS = {
  /** "Maybe James? Or my sister, I haven't decided." */
  hedgedExecutor: json({
    updates: [
      { field: "executor.name", value: "James", status: "unconfirmed", is_correction: false, note: "User is undecided between James and their sister" },
    ],
    reply: "It sounds like you haven't decided yet. Would you like James to be your executor, or your sister?",
  }),
  /** "Not sure." when asked about worldwide assets: model records nothing and asks again. */
  unclear: json({
    updates: [],
    reply: "That's fine. Would you like the document to cover assets in every country, or just one?",
  }),
};

export const CONTRADICTORY = {
  /** State says no children; user mentions "my son Tom" and the model wrongly records it. */
  namesChildDespiteNoChildren: json({
    updates: [{ field: "children_names", value: ["Tom"], status: "confirmed", is_correction: false, note: null }],
    reply: "Lovely, I've added Tom.",
  }),
};

/** Real outputs seen in manual testing (see AI_LOG.md). */
export const OBSERVED = {
  /** "my mom" -> the model used the relationship word as the name. */
  relationshipAsName: json({
    updates: [
      { field: "executor.name", value: "mom", status: "confirmed", is_correction: false, note: null },
      { field: "executor.relationship", value: "mother", status: "confirmed", is_correction: false, note: null },
    ],
    reply: "Got it, your executor will be your mom. Do you have any specific gifts you'd like to leave to someone?",
  }),
  /** "Actually, make my mom the executor instead" -> relationship changed, name not asked for. */
  executorChangedNameNotAsked: json({
    updates: [{ field: "executor.relationship", value: "mother", status: "confirmed", is_correction: true, note: null }],
    reply: "Understood, your mother will be the executor. Any additional wishes you'd like to include?",
  }),
  /** "idk what else to add" -> nothing recorded, but the model claimed the draft was complete. */
  falseCompletionClaim: json({
    updates: [],
    reply: "No problem, we can leave additional wishes open for now. The draft is complete and you can add anything later.",
  }),
  /** "idk what to leave" -> the model recorded "none". */
  unsureRecordedAsNone: json({
    updates: [{ field: "specific_gifts", value: [], status: "confirmed", is_correction: false, note: null }],
    reply: "No problem, we'll leave specific gifts empty for now. Do you have any additional wishes?",
  }),
};

export const MALFORMED = {
  notJson: "Sure! Your name is Jane Smith.",
  truncatedJson: '{"updates": [{"field": "full_name", "value": "Ja',
  missingReply: JSON.stringify({ updates: [] }),
  unknownField: JSON.stringify({
    updates: [{ field: "favourite_colour", value: "blue", status: "confirmed", is_correction: false, note: null }],
    reply: "Noted.",
  }),
  badStatus: JSON.stringify({
    updates: [{ field: "full_name", value: "Jane", status: "probably", note: null }],
    reply: "Noted.",
  }),
  /** Passes the envelope schema but the value has the wrong type for its field. */
  wrongValueType: JSON.stringify({
    updates: [{ field: "has_children", value: "yes", status: "confirmed", is_correction: false, note: null }],
    reply: "Great, noted that you have children.",
  }),
};
