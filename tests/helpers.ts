import { LLMProviderError, type LLMProvider } from "@/lib/llm";
import type { LLMRequest } from "@/lib/llm/provider";

/** A provider that replays scripted outputs (strings) or failures (Errors) in order. */
export function scriptedProvider(name: string, script: (string | Error)[]) {
  const calls: LLMRequest[] = [];
  const provider: LLMProvider = {
    name,
    async complete(request) {
      calls.push(request);
      const next = script.shift();
      if (next === undefined) throw new Error(`${name}: script exhausted`);
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { provider, calls };
}

export const rateLimited = (provider: string) => new LLMProviderError(provider, "rate_limit", "HTTP 429");
