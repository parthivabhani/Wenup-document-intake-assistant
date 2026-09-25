import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleProvider } from "@/lib/llm/openaiCompatible";
import { LLMProviderError } from "@/lib/llm/provider";
import { emptyState } from "@/lib/schema";

/** The HTTP boundary: odd-but-real provider responses must become typed errors, never crashes. */

const request = { system: "s", messages: [{ role: "user" as const, content: "hi" }], responseSchema: {}, context: { state: emptyState() } };
const provider = () => createOpenAICompatibleProvider({ label: "test", baseURL: "https://example.invalid/v1", apiKey: "k", model: "m" });
const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("openaiCompatible provider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the message content", async () => {
    respond(200, { choices: [{ message: { content: '{"updates":[],"reply":"hi"}' } }] });
    await expect(provider().complete(request)).resolves.toBe('{"updates":[],"reply":"hi"}');
  });

  it("HTTP 200 with no choices (seen from OpenRouter) is a server error, not a TypeError", async () => {
    respond(200, { id: "x", error: { message: "upstream failed" } });
    const err = await provider().complete(request).catch((e) => e);
    expect(err).toBeInstanceOf(LLMProviderError);
    expect(err.kind).toBe("server");
  });

  it.each([
    [401, "auth"],
    [402, "auth"],
    [429, "rate_limit"],
    [503, "server"],
    [400, "bad_request"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    respond(status, { error: { message: "nope" } });
    const err = await provider().complete(request).catch((e) => e);
    expect(err).toBeInstanceOf(LLMProviderError);
    expect(err.kind).toBe(kind);
  });
});
