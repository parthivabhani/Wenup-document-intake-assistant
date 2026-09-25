import { describe, expect, it } from "vitest";
import { handleChatTurn } from "@/lib/chatService";
import { generateDocument, documentToText } from "@/lib/documentGen";
import { createMockProvider } from "@/lib/llm/mockProvider";
import { applyUpdates, isComplete } from "@/lib/stateManager";
import { emptyState, type ChatMessage, type IntakeState } from "@/lib/schema";
import { AMBIGUOUS, CONTRADICTORY, MALFORMED, OBSERVED, VALID } from "./fixtures/llmResponses";
import { rateLimited, scriptedProvider } from "./helpers";

const live = (...script: string[]) => ({
  mode: "live" as const,
  providers: [scriptedProvider("test", script).provider],
});
const say = (content: string): ChatMessage[] => [{ role: "user", content }];

describe("handleChatTurn with scripted model outputs", () => {
  it("valid multi-field answer updates state and passes the reply through", async () => {
    const res = await handleChatTurn({ messages: say("I'm Jane Smith, my brother James is executor"), state: emptyState() }, live(VALID.multiField));
    expect(res.state.fields.full_name).toBe("Jane Smith");
    expect(res.state.fields.executor).toEqual({ name: "James", relationship: "brother" });
    expect(res.reply).toMatch(/home address/);
    expect(res.meta).toEqual({ mode: "llm", provider: "test", attempts: 1 });
  });

  it("a correction overwrites the earlier answer", async () => {
    const first = await handleChatTurn({ messages: say("..."), state: emptyState() }, live(VALID.multiField));
    const second = await handleChatTurn({ messages: say("Actually make it my sister Sarah"), state: first.state }, live(VALID.correction));
    expect(second.state.fields.executor).toEqual({ name: "Sarah", relationship: "sister" });
  });

  it("a model-flagged 'correction' is refused when the user's words don't support it", async () => {
    const first = await handleChatTurn({ messages: say("..."), state: emptyState() }, live(VALID.multiField));
    const second = await handleChatTurn({ messages: say("My sister Sarah is lovely"), state: first.state }, live(VALID.correction));
    expect(second.state.fields.executor).toEqual({ name: "James", relationship: "brother" });
    expect(second.reply).toMatch(/Which is correct\?/);
  });

  it("answering the app's own conflict question counts as a correction", async () => {
    const first = await handleChatTurn({ messages: say("..."), state: emptyState() }, live(VALID.multiField));
    const second = await handleChatTurn(
      {
        messages: [
          { role: "assistant", content: `Earlier you told me your executor's name is "James", but now it sounds like your executor's name is "Sarah". Which is correct?` },
          { role: "user", content: "Sarah, my sister" },
        ],
        state: first.state,
      },
      live(VALID.correction),
    );
    expect(second.state.fields.executor).toEqual({ name: "Sarah", relationship: "sister" });
  });

  it("an ambiguous answer is held as unconfirmed and triggers a follow-up, not a guess", async () => {
    const res = await handleChatTurn({ messages: say("Maybe James? Or my sister"), state: emptyState() }, live(AMBIGUOUS.hedgedExecutor));
    expect(res.state.fields.executor.name).toBeNull();
    expect(res.state.unconfirmed).toHaveLength(1);
    expect(res.reply).toMatch(/\?$/);
  });

  it("an unclear answer changes nothing and asks again", async () => {
    const res = await handleChatTurn({ messages: say("Not sure"), state: emptyState() }, live(AMBIGUOUS.unclear));
    expect(res.state).toEqual(emptyState());
    expect(res.reply).toMatch(/\?$/);
  });

  it("a contradiction the model missed is blocked by code and turned into a question", async () => {
    const noKids = applyUpdates(emptyState(), [{ field: "has_children", value: false, status: "confirmed", is_correction: false, note: null }]).state;
    const res = await handleChatTurn({ messages: say("my son Tom gets the car"), state: noKids }, live(CONTRADICTORY.namesChildDespiteNoChildren));
    expect(res.state.fields.children_names).toEqual([]);
    expect(res.rejected).toHaveLength(1);
    expect(res.reply).not.toMatch(/added Tom/);
    expect(res.reply).toMatch(/Tom/);
    expect(res.reply).toMatch(/Which is correct\?/);
  });

  it("a wrongly typed value is rejected and the model's false acknowledgement is replaced", async () => {
    const res = await handleChatTurn({ messages: say("yes I have kids"), state: emptyState() }, live(MALFORMED.wrongValueType));
    expect(res.state.fields.has_children).toBeNull();
    expect(res.reply).not.toMatch(/Great, noted/);
    expect(res.reply).toMatch(/Do you have any children\?/);
  });

  it("when no provider is reachable, it says so instead of asking the user to rephrase", async () => {
    const down = { mode: "live" as const, providers: [scriptedProvider("p1", [rateLimited("p1")]).provider] };
    const res = await handleChatTurn({ messages: say("I'm Jane"), state: emptyState() }, down);
    expect(res.meta.mode).toBe("fallback");
    expect(res.reply).toMatch(/temporarily unavailable/);
    expect(res.reply).not.toMatch(/saying it another way/);
  });

  it("malformed output twice falls back to a clarifying question without crashing", async () => {
    const res = await handleChatTurn({ messages: say("hello"), state: emptyState() }, live(MALFORMED.notJson, MALFORMED.truncatedJson));
    expect(res.meta.mode).toBe("fallback");
    expect(res.state).toEqual(emptyState());
    expect(res.reply).toMatch(/What is your full name\?/);
  });
});

describe("handleChatTurn: regressions from manual testing", () => {
  it("'my mom' keeps the relationship but not 'mom' as a name, and asks for her name", async () => {
    const res = await handleChatTurn({ messages: say("my mom"), state: emptyState() }, live(OBSERVED.relationshipAsName));
    expect(res.state.fields.executor).toEqual({ name: null, relationship: "mother" });
    expect(res.rejected.map((r) => [r.update.field, r.kind])).toEqual([["executor.name", "invalid"]]);
    expect(res.reply).toBe("Noted that your executor is your mother. What is their name?");
  });

  it("'idk' is not 'none': an uncertain empty list is held for confirmation", async () => {
    const res = await handleChatTurn({ messages: say("idk what to leave"), state: emptyState() }, live(OBSERVED.unsureRecordedAsNone));
    expect(res.state.fields.specific_gifts).toBeNull();
    expect(res.state.unconfirmed).toEqual([
      { field: "specific_gifts", value: [], note: "You sounded unsure; confirm there are none" },
    ]);
    expect(res.reply).toMatch(/Should I record that you have no specific gifts/);
  });

  it("'make my mom the executor instead': clears the old name and asks for the new one", async () => {
    const s1 = applyUpdates(emptyState(), [
      { field: "executor.name", value: "James", status: "confirmed", is_correction: false, note: null },
      { field: "executor.relationship", value: "brother", status: "confirmed", is_correction: false, note: null },
    ]).state;
    const res = await handleChatTurn({ messages: say("Actually, make my mom the executor instead."), state: s1 }, live(OBSERVED.executorChangedNameNotAsked));
    expect(res.state.fields.executor).toEqual({ name: null, relationship: "mother" });
    expect(res.reply).toBe("Noted, your executor is now your mother. What is their name?");
  });

  it("a false 'the draft is complete' claim is replaced by the real next question", async () => {
    const s1 = applyUpdates(emptyState(), [
      { field: "full_name", value: "Jane", status: "confirmed", is_correction: false, note: null },
    ]).state;
    const res = await handleChatTurn({ messages: say("idk what else to add"), state: s1 }, live(OBSERVED.falseCompletionClaim));
    expect(res.reply).not.toMatch(/complete/i);
    expect(res.reply).toMatch(/home address\?/);
  });

  it("a clear 'none' is still recorded as none", async () => {
    const res = await handleChatTurn({ messages: say("No gifts, thanks"), state: emptyState() }, live(OBSERVED.unsureRecordedAsNone));
    expect(res.state.fields.specific_gifts).toEqual([]);
  });
});

describe("mock provider: full interview offline", () => {
  it("collects every field and produces a complete document", async () => {
    const llm = { mode: "mock" as const, providers: [createMockProvider()] };
    const answers = [
      "Hello",
      "Jane Smith",
      "12 Orchard Lane, Bristol",
      "yes",
      "yes",
      "Tom, Sue",
      "James Smith",
      "brother",
      "My piano to Sue",
      "none",
    ];
    let state: IntakeState = emptyState();
    const messages: ChatMessage[] = [];
    for (const answer of answers) {
      messages.push({ role: "user", content: answer });
      const res = await handleChatTurn({ messages, state }, llm);
      expect(res.meta.mode).toBe("mock");
      state = res.state;
      messages.push({ role: "assistant", content: res.reply });
    }

    expect(isComplete(state)).toBe(true);
    expect(state.fields.children_names).toEqual(["Tom", "Sue"]);
    expect(state.fields.additional_wishes).toEqual([]);
    const text = documentToText(generateDocument(state));
    expect(text).toContain("I appoint James Smith (my brother)");
  });

  it("asks again when a yes/no answer can't be understood", async () => {
    const llm = { mode: "mock" as const, providers: [createMockProvider()] };
    const state = applyUpdates(emptyState(), [
      { field: "full_name", value: "Jane", status: "confirmed", is_correction: false, note: null },
      { field: "home_address", value: "1 Road", status: "confirmed", is_correction: false, note: null },
    ]).state;
    const res = await handleChatTurn({ messages: say("hmm, depends"), state }, llm);
    expect(res.state).toEqual(state);
    expect(res.reply).toMatch(/didn't catch that/);
  });
});
