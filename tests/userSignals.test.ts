import { describe, expect, it } from "vitest";
import { userExpressedUncertainty, userSignalledCorrection } from "@/lib/userSignals";
import type { ChatMessage } from "@/lib/schema";

const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content });

describe("userSignalledCorrection", () => {
  it.each([
    "Actually, make my sister Sarah the executor",
    "Sorry, I meant 14 Orchard Lane",
    "Please change the executor to Sarah",
    "Sarah instead of James",
    "That's wrong, I do have kids",
    "On second thought, only UK assets",
    "Not James but Sarah",
  ])("detects a correction in %j", (text) => {
    expect(userSignalledCorrection([user(text)])).toBe(true);
  });

  it.each([
    "I'd like to leave my watch to my son Tom.",
    "My sister Sarah is lovely",
    "Yes",
    "James",
  ])("does not treat %j as a correction on its own", (text) => {
    expect(userSignalledCorrection([assistant("Any gifts?"), user(text)])).toBe(false);
  });

  it("an answer to the app's own conflict question counts", () => {
    expect(
      userSignalledCorrection([
        assistant("Earlier you told me you don't have children, but now it sounds like you have a child named Tom. Which is correct?"),
        user("I do have a son, Tom"),
      ]),
    ).toBe(true);
  });

  it("is false when the last message isn't from the user", () => {
    expect(userSignalledCorrection([user("actually"), assistant("ok")])).toBe(false);
  });
});

describe("userExpressedUncertainty", () => {
  it.each(["idk what to leave", "idk...", "I'm not sure", "no idea", "I don't know yet", "maybe later"])(
    "detects uncertainty in %j",
    (text) => expect(userExpressedUncertainty([user(text)])).toBe(true),
  );

  it.each(["none", "No gifts, thanks", "Nothing else", "James"])("treats %j as a clear answer", (text) =>
    expect(userExpressedUncertainty([user(text)])).toBe(false),
  );
});
