import type { ChatMessage, IntakeState } from "../schema";

/**
 * The boundary between the app and any language model. Everything above this
 * interface (prompting, validation, retries) is provider-agnostic; swapping
 * Groq for Anthropic, OpenAI or a local model means adding one implementation.
 */
export interface LLMProvider {
  /** Human-readable id, e.g. "groq:openai/gpt-oss-120b". Never contains secrets. */
  readonly name: string;
  /** Returns the model's raw text. Parsing and validation happen in the caller. */
  complete(request: LLMRequest): Promise<string>;
}

export type LLMRequest = {
  system: string;
  messages: ChatMessage[];
  /** JSON Schema the response must follow (enforced natively where supported). */
  responseSchema: Record<string, unknown>;
  /**
   * The structured inputs the prompt was built from. Real providers ignore it;
   * the deterministic mock uses it instead of reading natural language.
   */
  context: { state: IntakeState };
};

export type ProviderErrorKind = "auth" | "rate_limit" | "timeout" | "network" | "server" | "bad_request";

export class LLMProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(`[${provider}] ${kind}: ${message}`);
    this.name = "LLMProviderError";
  }
}
