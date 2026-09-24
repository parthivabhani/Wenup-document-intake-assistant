import { describe, expect, it } from "vitest";
import { generateDocument } from "@/lib/documentGen";
import { documentToPdf } from "@/lib/documentPdf";
import { emptyState, type IntakeState } from "@/lib/schema";

const complete: IntakeState = {
  fields: {
    full_name: "Jane Smith",
    home_address: "12 Orchard Lane, Bristol",
    covers_worldwide_assets: true,
    has_children: false,
    children_names: [],
    executor: { name: "James Smith", relationship: "brother" },
    specific_gifts: ["My piano to Sue"],
    additional_wishes: ["Be kind to everyone"],
  },
  unconfirmed: [],
};

// compress:false keeps text readable in the raw PDF, so we can assert on content.
const pdfText = (state: IntakeState) =>
  Buffer.from(documentToPdf(generateDocument(state)).output("arraybuffer")).toString("latin1");

describe("documentToPdf", () => {
  it("produces a PDF containing the confirmed details", () => {
    const raw = pdfText(complete);
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toContain("Jane Smith");
    expect(raw).toContain("James Smith");
    expect(raw).toContain("My piano to Sue");
  });

  it("always carries the fictional / not legal advice disclaimer", () => {
    for (const state of [complete, emptyState()]) {
      expect(pdfText(state)).toContain("FICTIONAL DOCUMENT - NOT LEGAL ADVICE");
    }
  });

  it("shows gaps as placeholders rather than guessing", () => {
    expect(pdfText(emptyState())).toContain("[not yet provided]");
  });

  it("paginates long content instead of running off the page", () => {
    const long = {
      ...complete,
      fields: { ...complete.fields, additional_wishes: Array.from({ length: 20 }, (_, i) => `Wish ${i + 1}: ${"a long sentence ".repeat(12)}`) },
    };
    expect(documentToPdf(generateDocument(long)).getNumberOfPages()).toBeGreaterThan(1);
  });
});
