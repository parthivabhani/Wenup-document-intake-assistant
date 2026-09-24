import { z } from "zod";

/**
 * Single source of truth for the shape of everything the app exchanges.
 *
 * Conventions used throughout:
 *   - `null`  = unknown / not yet provided. Never guessed.
 *   - `[]`    = the user explicitly said "none" (e.g. no specific gifts).
 */

// ---------------------------------------------------------------------------
// Collected fields
// ---------------------------------------------------------------------------

const Text = z.string().trim().min(1).max(500);
const TextList = z.array(Text).max(20);

export const IntakeFieldsSchema = z.object({
  full_name: Text.nullable(),
  home_address: Text.nullable(),
  covers_worldwide_assets: z.boolean().nullable(),
  has_children: z.boolean().nullable(),
  children_names: TextList.nullable(),
  executor: z.object({
    name: Text.nullable(),
    relationship: Text.nullable(),
  }),
  specific_gifts: TextList.nullable(),
  additional_wishes: TextList.nullable(),
});
export type IntakeFields = z.infer<typeof IntakeFieldsSchema>;

/**
 * Flat, addressable names for every leaf field. The LLM refers to fields by
 * these keys, which keeps updates to nested values (executor.*) simple.
 */
export const FIELD_KEYS = [
  "full_name",
  "home_address",
  "covers_worldwide_assets",
  "has_children",
  "children_names",
  "executor.name",
  "executor.relationship",
  "specific_gifts",
  "additional_wishes",
] as const;
export const FieldKeySchema = z.enum(FIELD_KEYS);
export type FieldKey = z.infer<typeof FieldKeySchema>;

/** Per-field validator for the value an update is allowed to set (non-null). */
export const FIELD_VALUE_SCHEMAS = {
  full_name: Text,
  home_address: Text,
  covers_worldwide_assets: z.boolean(),
  has_children: z.boolean(),
  children_names: TextList,
  "executor.name": Text,
  "executor.relationship": Text,
  specific_gifts: TextList,
  additional_wishes: TextList,
} satisfies Record<FieldKey, z.ZodType>;

export type FieldValue = string | boolean | string[];

export const FIELD_LABELS: Record<FieldKey, string> = {
  full_name: "Full name",
  home_address: "Home address",
  covers_worldwide_assets: "Covers worldwide assets",
  has_children: "Has children",
  children_names: "Children's names",
  "executor.name": "Executor's name",
  "executor.relationship": "Executor's relationship",
  specific_gifts: "Specific gifts",
  additional_wishes: "Additional wishes",
};

// ---------------------------------------------------------------------------
// Full application state (what the client holds and the server validates)
// ---------------------------------------------------------------------------

/** A value the user mentioned but did not clearly confirm. Not used in the document. */
export const UnconfirmedEntrySchema = z.object({
  field: FieldKeySchema,
  value: z.union([z.string(), z.boolean(), z.array(z.string())]),
  note: z.string().max(300),
});
export type UnconfirmedEntry = z.infer<typeof UnconfirmedEntrySchema>;

export const IntakeStateSchema = z.object({
  fields: IntakeFieldsSchema,
  unconfirmed: z.array(UnconfirmedEntrySchema).max(FIELD_KEYS.length),
});
export type IntakeState = z.infer<typeof IntakeStateSchema>;

export function emptyState(): IntakeState {
  return {
    fields: {
      full_name: null,
      home_address: null,
      covers_worldwide_assets: null,
      has_children: null,
      children_names: null,
      executor: { name: null, relationship: null },
      specific_gifts: null,
      additional_wishes: null,
    },
    unconfirmed: [],
  };
}

// ---------------------------------------------------------------------------
// LLM output contract
// ---------------------------------------------------------------------------

/**
 * One proposed change from the model. `value: null` means "the user retracted
 * this / it is now unknown". `status: "unconfirmed"` means the user said
 * something relevant but ambiguous, so it's held aside and not applied.
 *
 * `is_correction` is the model's declaration that the user explicitly changed
 * an earlier answer. Without it, stateManager refuses to overwrite a known
 * value and asks the user which version is right.
 *
 * `value` is loosely typed here on purpose: the per-field type check happens in
 * stateManager, so one bad field is rejected without discarding the whole turn.
 */
export const FieldUpdateSchema = z.object({
  field: FieldKeySchema,
  value: z.union([z.string(), z.boolean(), z.array(z.string()), z.null()]),
  status: z.enum(["confirmed", "unconfirmed"]),
  is_correction: z
    .boolean()
    .describe("True only if the user explicitly changed a previous answer."),
  note: z
    .string()
    .nullable()
    .describe("Why the value is unconfirmed, or null when confirmed."),
});
export type FieldUpdate = z.infer<typeof FieldUpdateSchema>;

export const LLMTurnOutputSchema = z.object({
  updates: z
    .array(FieldUpdateSchema)
    .describe("Field changes stated by the user in their latest message. Empty if none."),
  reply: z
    .string()
    .min(1)
    .describe("The assistant's next message to the user."),
});
export type LLMTurnOutput = z.infer<typeof LLMTurnOutputSchema>;

// ---------------------------------------------------------------------------
// HTTP API contract: POST /api/chat
// ---------------------------------------------------------------------------

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  /** Full visible conversation; the last message must be the user's new turn. */
  messages: z
    .array(ChatMessageSchema)
    .min(1)
    .max(100)
    .refine((m) => m[m.length - 1].role === "user", {
      message: "The last message must be from the user",
    }),
  state: IntakeStateSchema,
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const RejectedUpdateSchema = z.object({
  update: FieldUpdateSchema,
  /** invalid = wrong type/shape; conflict = contradicts state; ignored = harmless no-op. */
  kind: z.enum(["invalid", "conflict", "ignored"]),
  reason: z.string(),
});
export type RejectedUpdate = z.infer<typeof RejectedUpdateSchema>;

export const ChatResponseSchema = z.object({
  reply: z.string(),
  state: IntakeStateSchema,
  applied: z.array(FieldUpdateSchema),
  rejected: z.array(RejectedUpdateSchema),
  meta: z.object({
    /** "llm" = model answered; "mock" = no key configured; "fallback" = model failed, safe reply used. */
    mode: z.enum(["llm", "mock", "fallback"]),
    provider: z.string().nullable(),
    attempts: z.number().int(),
  }),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
