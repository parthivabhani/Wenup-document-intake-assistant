import { z } from "zod";
import { LLMTurnOutputSchema, type ChatMessage, type IntakeState, type LLMTurnOutput } from "../schema";
import { createMockProvider } from "./mockProvider";
import { createOpenAICompatibleProvider } from "./openaiCompatible";
import { buildSystemPrompt, REPAIR_INSTRUCTION } from "./prompt";
import { LLMProviderError, type LLMProvider } from "./provider";

export { LLMProviderError, type LLMProvider } from "./provider";

/** How many recent messages to send. Older facts live in the state, so the transcript can be trimmed. */
export const HISTORY_LIMIT = 12;

/** Stop starting new attempts after this long, so a chain of slow providers can't exceed the host's function limit. */
export const TURN_DEADLINE_MS = 40_000;

/** Generated once from the Zod schema, so the model contract and the validator can't drift apart. */
const RESPONSE_SCHEMA = (() => {
  const schema: Record<string, unknown> = z.toJSONSchema(LLMTurnOutputSchema);
  delete schema.$schema; // providers reject the meta-schema key
  return schema;
})();

export type TurnResult =
  | { ok: true; output: LLMTurnOutput; provider: string; attempts: number }
  | { ok: false; attempts: number; errors: string[] };

/**
 * One conversational turn. Tries each provider in order:
 *   - provider/network error (rate limit, auth, timeout, 5xx) -> next provider
 *   - malformed or invalid output -> one repair retry on the same provider, then give up
 * Stops starting new attempts after `deadlineMs`. Never throws; the caller
 * decides the user-facing fallback.
 */
export async function runTurn(
  state: IntakeState,
  messages: ChatMessage[],
  providers: LLMProvider[],
  { deadlineMs = TURN_DEADLINE_MS, now = Date.now }: { deadlineMs?: number; now?: () => number } = {},
): Promise<TurnResult> {
  const startedAt = now();
  const system = buildSystemPrompt(state);
  const history = messages.slice(-HISTORY_LIMIT);
  const errors: string[] = [];
  let attempts = 0;

  for (const provider of providers) {
    let conversation = history;

    for (let attempt = 1; attempt <= 2; attempt++) {
      if (now() - startedAt > deadlineMs) {
        errors.push(`turn deadline of ${deadlineMs}ms reached; skipping ${provider.name}`);
        return { ok: false, attempts, errors };
      }
      attempts++;
      let raw: string;
      try {
        raw = await provider.complete({
          system,
          messages: conversation,
          responseSchema: RESPONSE_SCHEMA,
          context: { state },
        });
      } catch (err) {
        errors.push(err instanceof LLMProviderError ? err.message : `[${provider.name}] ${String(err)}`);
        break; // try the next provider
      }

      const parsed = parseTurnOutput(raw);
      if (parsed.ok) return { ok: true, output: parsed.output, provider: provider.name, attempts };

      errors.push(`[${provider.name}] invalid output (attempt ${attempt}): ${parsed.error}`);
      if (attempt === 2) return { ok: false, attempts, errors };
      conversation = [
        ...history,
        { role: "assistant", content: raw.slice(0, 2000) || "(empty)" },
        { role: "user", content: `${REPAIR_INSTRUCTION}\nProblem: ${parsed.error}` },
      ];
    }
  }

  return { ok: false, attempts, errors };
}

export function parseTurnOutput(
  raw: string,
): { ok: true; output: LLMTurnOutput } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Response is not valid JSON" };
  }
  const result = LLMTurnOutputSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "(root)"}: ${issue.message}` };
  }
  return { ok: true, output: result.data };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type LLMMode = "live" | "mock";

/**
 * Builds the provider chain from environment variables. Missing keys are not
 * an error: those providers are skipped, and with no keys at all the app runs
 * on the deterministic mock (clearly flagged in the UI).
 */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): {
  mode: LLMMode;
  providers: LLMProvider[];
} {
  if (env.LLM_PROVIDER === "mock") return { mode: "mock", providers: [createMockProvider()] };

  const providers: LLMProvider[] = [];
  if (env.GROQ_API_KEY) {
    providers.push(
      createOpenAICompatibleProvider({
        label: "groq",
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_MODEL || "openai/gpt-oss-120b",
        reasoningEffort: "low",
      }),
    );
  }
  if (env.CEREBRAS_API_KEY) {
    providers.push(
      createOpenAICompatibleProvider({
        label: "cerebras",
        baseURL: "https://api.cerebras.ai/v1",
        apiKey: env.CEREBRAS_API_KEY,
        model: env.CEREBRAS_MODEL || "gpt-oss-120b",
        reasoningEffort: "low",
      }),
    );
  }
  if (env.GROQ_API_KEY) {
    // Same key, different models: each has its own per-minute token budget on
    // Groq's free tier, so they add capacity as well as redundancy.
    providers.push(
      createOpenAICompatibleProvider({
        label: "groq",
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_FALLBACK_MODEL || "qwen/qwen3.8-27b",
      }),
    );
  }
  if (env.GEMINI_API_KEY) {
    // A different company's infrastructure: covers a full Groq outage. Placed after the
    // Groq models because on the free tier it's slower and often returns 503 (see AI_LOG.md).
    providers.push(
      createOpenAICompatibleProvider({
        label: "gemini",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL || "gemini-3.6-flash",
        reasoningEffort: "low",
      }),
    );
  }
  if (env.GROQ_API_KEY) {
    providers.push(
      createOpenAICompatibleProvider({
        label: "groq",
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: env.GROQ_API_KEY,
        model: "openai/gpt-oss-20b",
        reasoningEffort: "low",
      }),
    );
  }

  return providers.length > 0
    ? { mode: "live", providers }
    : { mode: "mock", providers: [createMockProvider()] };
}
