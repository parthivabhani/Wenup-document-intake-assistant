import { describe, expect, it } from "vitest";
import { DISCLAIMER, PLACEHOLDER, documentToText, generateDocument } from "@/lib/documentGen";
import { emptyState, type IntakeState } from "@/lib/schema";

const complete: IntakeState = {
  fields: {
    full_name: "Jane Smith",
    home_address: "12 Orchard Lane, Bristol, BS1 4AA",
    covers_worldwide_assets: true,
    has_children: true,
    children_names: ["Tom Smith", "Sue Smith"],
    executor: { name: "James Smith", relationship: "brother" },
    specific_gifts: ["My piano to Sue Smith", "My watch to Tom Smith"],
    additional_wishes: ["I would like a small, informal funeral."],
  },
  unconfirmed: [],
};

describe("generateDocument", () => {
  it("renders a complete state with no placeholders", () => {
    const doc = generateDocument(complete);
    const text = documentToText(doc);

    expect(doc.isDraftComplete).toBe(true);
    expect(text).not.toContain(PLACEHOLDER);
    expect(text).toContain("I, Jane Smith, of 12 Orchard Lane, Bristol, BS1 4AA");
    expect(text).toContain("all of my assets worldwide");
    expect(text).toContain("I have 2 children: Tom Smith, Sue Smith.");
    expect(text).toContain("I appoint James Smith (my brother)");
    expect(text).toContain("1. My piano to Sue Smith");
    expect(text).toContain("small, informal funeral");
  });

  it("always labels the document as fictional and not legal advice", () => {
    for (const state of [complete, emptyState()]) {
      const doc = generateDocument(state);
      expect(doc.disclaimer).toBe(DISCLAIMER);
      expect(documentToText(doc)).toMatch(/FICTIONAL DOCUMENT - NOT LEGAL ADVICE/);
    }
  });

  it("shows placeholders for missing values instead of guessing", () => {
    const doc = generateDocument(emptyState());
    expect(doc.isDraftComplete).toBe(false);
    expect(documentToText(doc)).toContain(`I, ${PLACEHOLDER}, of ${PLACEHOLDER}`);
  });

  it("renders explicit 'none' answers differently from unknown ones", () => {
    const doc = generateDocument({
      ...complete,
      fields: {
        ...complete.fields,
        has_children: false,
        children_names: [],
        covers_worldwide_assets: false,
        specific_gifts: [],
        additional_wishes: [],
      },
    });
    const text = documentToText(doc);
    expect(text).toContain("I have no children.");
    expect(text).toContain("not to assets held abroad");
    expect(text).toContain("I do not wish to make any specific gifts.");
    expect(text).toContain("I have no additional wishes.");
    expect(doc.isDraftComplete).toBe(true);
  });

  it("ignores unconfirmed values", () => {
    const doc = generateDocument({
      ...emptyState(),
      unconfirmed: [{ field: "full_name", value: "Maybe Jane", note: "unsure" }],
    });
    expect(documentToText(doc)).not.toContain("Maybe Jane");
  });

  it("is deterministic", () => {
    expect(generateDocument(complete)).toEqual(generateDocument(complete));
  });
});
