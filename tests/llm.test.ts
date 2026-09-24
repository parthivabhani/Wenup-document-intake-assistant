import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, parseTurnOutput, providersFromEnv, runTurn } from "@/lib/llm";
import { emptyState, type ChatMessage } from "@/lib/schema";
import { MALFORMED, VALID } from "./fixtures/llmResponses";
import { rateLimited, scriptedProvider } from "./helpers";

const userSays = (content: string): ChatMessage[] => [{ role: "user", content }];

describe("parseTurnOutput: schema validation of raw model output", () => {
  it("accepts a valid response", () => {
    expect(parseTurnOutput(VALID.multiField).ok).toBe(true);
  });

  it.each(Object.entries(MALFORMED).filter(([k]) => k !== "wrongValueType"))(
    "rejects malformed output: %s",
    (_name, raw) => {
      expect(parseTurnOutput(raw).ok).toBe(false);
    },
  );

  it("leaves per-field type checks to the state manager", () => {
    // The envelope is valid; stateManager rejects the individual bad value.
    expect(parseTurnOutput(MALFORMED.wrongValueType).ok).toBe(true);
  });
});

describe("runTurn: retries and fallbacks", () => {
  it("returns the first valid response", async () => {
    const { provider } = scriptedProvider("p1", [VALID.multiField]);
    const res = await runTurn(emptyState(), userSays("hi"), [provider]);
    expect(res).toMatchObject({ ok: true, provider: "p1", attempts: 1 });
  });

  it("retries once with a repair instruction after malformed output", async () => {
    const { provider, calls } = scriptedProvider("p1", [MALFORMED.notJson, VALID.multiField]);
    const res = await runTurn(emptyState(), userSays("I'm Jane"), [provider]);
    expect(res).toMatchObject({ ok: true, attempts: 2 });
    const retry = calls[1].messages;
    expect(retry[retry.length - 2]).toEqual({ role: "assistant", content: MALFORMED.notJson });
    expect(retry[retry.length - 1].content).toMatch(/did not match the required JSON format/);
  });

  it("gives up after two malformed outputs instead of looping", async () => {
    const { provider } = scriptedProvider("p1", [MALFORMED.notJson, MALFORMED.missingReply]);
    const { provider: p2, calls: p2Calls } = scriptedProvider("p2", [VALID.multiField]);
    const res = await runTurn(emptyState(), userSays("I'm Jane"), [provider, p2]);
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(2);
    expect(p2Calls).toHaveLength(0);
  });

  it("falls through to the next provider on a provider error", async () => {
    const { provider: p1 } = scriptedProvider("p1", [rateLimited("p1")]);
    const { provider: p2 } = scriptedProvider("p2", [VALID.multiField]);
    const res = await runTurn(emptyState(), userSays("I'm Jane"), [p1, p2]);
    expect(res).toMatchObject({ ok: true, provider: "p2", attempts: 2 });
  });

  it("never throws when every provider fails", async () => {
    const { provider: p1 } = scriptedProvider("p1", [rateLimited("p1")]);
    const { provider: p2 } = scriptedProvider("p2", [new Error("socket hang up")]);
    const res = await runTurn(emptyState(), userSays("I'm Jane"), [p1, p2]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors).toHaveLength(2);
  });

  it("stops trying providers once the turn deadline has passed", async () => {
    let clock = 0;
    const slow = scriptedProvider("slow", [rateLimited("slow")]);
    const next = scriptedProvider("next", [VALID.multiField]);
    const p1 = { ...slow.provider, complete: async (r: Parameters<typeof slow.provider.complete>[0]) => { clock += 50_000; return slow.provider.complete(r); } };
    const res = await runTurn(emptyState(), userSays("hi"), [p1, next.provider], { deadlineMs: 40_000, now: () => clock });
    expect(res.ok).toBe(false);
    expect(next.calls).toHaveLength(0);
  });

  it("sends the current state in the prompt and trims old history", async () => {
    const { provider, calls } = scriptedProvider("p1", [VALID.noUpdates]);
    const state = { ...emptyState(), fields: { ...emptyState().fields, full_name: "Jane Smith" } };
    const long: ChatMessage[] = Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));
    long.push({ role: "user", content: "latest" });
    await runTurn(state, long, [provider]);

    expect(calls[0].system).toContain('"full_name":"Jane Smith"');
    expect(calls[0].system).not.toMatch(/- full_name \(Full name\)/); // not listed as missing
    expect(calls[0].messages).toHaveLength(HISTORY_LIMIT);
    expect(calls[0].messages.at(-1)?.content).toBe("latest");
  });
});

describe("providersFromEnv: configuration", () => {
  it("uses the mock when no keys are configured", () => {
    const { mode, providers } = providersFromEnv({} as NodeJS.ProcessEnv);
    expect(mode).toBe("mock");
    expect(providers.map((p) => p.name)).toEqual(["mock"]);
  });

  it("builds a fallback chain from available keys", () => {
    const { mode, providers } = providersFromEnv({
      GROQ_API_KEY: "x",
      CEREBRAS_API_KEY: "y",
      GEMINI_API_KEY: "z",
    } as unknown as NodeJS.ProcessEnv);
    expect(mode).toBe("live");
    expect(providers.map((p) => p.name)).toEqual([
      "groq:openai/gpt-oss-120b",
      "cerebras:gpt-oss-120b",
      "groq:qwen/qwen3.8-27b",
      "gemini:gemini-3.6-flash",
      "groq:openai/gpt-oss-20b",
    ]);
  });

  it("works with only a Gemini key", () => {
    const { mode, providers } = providersFromEnv({ GEMINI_API_KEY: "z" } as unknown as NodeJS.ProcessEnv);
    expect(mode).toBe("live");
    expect(providers.map((p) => p.name)).toEqual(["gemini:gemini-3.6-flash"]);
  });

  it("LLM_PROVIDER=mock forces the mock even with keys", () => {
    const { mode } = providersFromEnv({ GROQ_API_KEY: "x", LLM_PROVIDER: "mock" } as unknown as NodeJS.ProcessEnv);
    expect(mode).toBe("mock");
  });
});
