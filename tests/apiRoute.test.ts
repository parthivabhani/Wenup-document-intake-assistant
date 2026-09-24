import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/chat/route";
import { ChatResponseSchema, emptyState } from "@/lib/schema";

/** HTTP contract of POST /api/chat, run against the mock provider. */

const post = (body: unknown, raw = false) =>
  POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `test-${Math.random()}` },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );

describe("POST /api/chat", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.LLM_PROVIDER = "mock";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns a response that matches the documented contract", async () => {
    const res = await post({ messages: [{ role: "user", content: "Jane Smith" }], state: emptyState() });
    expect(res.status).toBe(200);
    const body = ChatResponseSchema.parse(await res.json());
    expect(body.state.fields.full_name).toBe("Jane Smith");
    expect(body.meta.mode).toBe("mock");
  });

  it("400 on a non-JSON body", async () => {
    const res = await post("not json", true);
    expect(res.status).toBe(400);
  });

  it("400 when the client sends a state that violates the schema", async () => {
    const bad = { ...emptyState(), fields: { ...emptyState().fields, has_children: "yes" } };
    const res = await post({ messages: [{ role: "user", content: "hi" }], state: bad });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/has_children/);
  });

  it("400 when the last message is not from the user", async () => {
    const res = await post({ messages: [{ role: "assistant", content: "hi" }], state: emptyState() });
    expect(res.status).toBe(400);
  });
});
