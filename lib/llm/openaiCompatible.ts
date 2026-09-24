import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import { LLMProviderError, type LLMProvider, type LLMRequest, type ProviderErrorKind } from "./provider";

/**
 * Works with any OpenAI-compatible Chat Completions API (Groq, Cerebras,
 * OpenAI, Together, local vLLM/Ollama...). Only the base URL, key and model differ.
 */
export type OpenAICompatibleConfig = {
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** For reasoning models such as gpt-oss. Lower = faster. */
  reasoningEffort?: "low" | "medium" | "high";
};

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): LLMProvider {
  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: config.timeoutMs ?? 20_000,
    maxRetries: 0, // retries and fallbacks are decided in one place: lib/llm/index.ts
  });
  const name = `${config.label}:${config.model}`;

  return {
    name,
    async complete(request: LLMRequest): Promise<string> {
      try {
        const res = await client.chat.completions.create({
          model: config.model,
          temperature: 0,
          max_completion_tokens: 1500,
          ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
          messages: [{ role: "system", content: request.system }, ...request.messages],
          response_format: {
            type: "json_schema",
            json_schema: { name: "intake_turn", strict: true, schema: request.responseSchema },
          },
        });
        const content = res.choices[0]?.message?.content;
        if (!content) throw new LLMProviderError(name, "server", "Empty response");
        return content;
      } catch (err) {
        throw toProviderError(name, err);
      }
    },
  };
}

function toProviderError(name: string, err: unknown): LLMProviderError {
  if (err instanceof LLMProviderError) return err;
  if (err instanceof APIConnectionTimeoutError) return new LLMProviderError(name, "timeout", "Request timed out");
  if (err instanceof APIError) {
    const status = err.status ?? 0;
    const kind: ProviderErrorKind =
      status === 401 || status === 402 || status === 403
        ? "auth"
        : status === 429
          ? "rate_limit"
          : status >= 500
            ? "server"
            : status === 0
              ? "network"
              : "bad_request";
    return new LLMProviderError(name, kind, `HTTP ${status || "n/a"}`);
  }
  return new LLMProviderError(name, "network", err instanceof Error ? err.message : String(err));
}
