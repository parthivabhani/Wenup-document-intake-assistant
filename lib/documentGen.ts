import type { IntakeFields, IntakeState } from "./schema";

/**
 * Pure function: confirmed state -> draft document. No LLM involved, so the
 * document can only ever contain what's in the validated state, and the same
 * state always produces the same document.
 *
 * Unconfirmed values are deliberately ignored; missing values render as a
 * visible placeholder instead of being guessed.
 */

export const DISCLAIMER =
  "FICTIONAL DOCUMENT - NOT LEGAL ADVICE. This draft was generated for a technical demonstration. It is not a will, has no legal effect, and must not be relied on.";

export const PLACEHOLDER = "[not yet provided]";

export type DocumentSection = { heading: string; body: string[] };

export type DraftDocument = {
  title: string;
  disclaimer: string;
  sections: DocumentSection[];
  isDraftComplete: boolean;
};

export function generateDocument(state: IntakeState): DraftDocument {
  const f = state.fields;
  const name = f.full_name ?? PLACEHOLDER;

  const sections: DocumentSection[] = [
    {
      heading: "1. Declaration",
      body: [
        `I, ${name}, of ${f.home_address ?? PLACEHOLDER}, set out below my personal wishes.`,
        scopeSentence(f.covers_worldwide_assets),
      ],
    },
    { heading: "2. Family", body: [familySentence(f)] },
    {
      heading: "3. Executor",
      body: [executorSentence(f.executor)],
    },
    {
      heading: "4. Specific gifts",
      body: listOrNone(f.specific_gifts, "I do not wish to make any specific gifts."),
    },
    {
      heading: "5. Additional wishes",
      body: listOrNone(f.additional_wishes, "I have no additional wishes."),
    },
    {
      heading: "Signature",
      body: [`Signed: ${name}`, "Date: ____________________"],
    },
  ];

  return {
    title: "Personal Wishes Document (Draft)",
    disclaimer: DISCLAIMER,
    sections,
    isDraftComplete: sections.every((s) => s.body.every((line) => !line.includes(PLACEHOLDER))),
  };
}

/** Plain-text rendering, used for download. */
export function documentToText(doc: DraftDocument): string {
  const lines = [doc.title.toUpperCase(), "", doc.disclaimer, ""];
  for (const s of doc.sections) lines.push(s.heading, ...s.body, "");
  lines.push(doc.disclaimer);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------

function scopeSentence(worldwide: boolean | null): string {
  if (worldwide === null) return `Scope of assets: ${PLACEHOLDER}.`;
  return worldwide
    ? "These wishes apply to all of my assets worldwide."
    : "These wishes apply only to my assets in my country of residence, not to assets held abroad.";
}

function familySentence(f: IntakeFields): string {
  if (f.has_children === null) return `Children: ${PLACEHOLDER}.`;
  if (f.has_children === false) return "I have no children.";
  if (!f.children_names) return `I have children. Their names: ${PLACEHOLDER}.`;
  return `I have ${f.children_names.length === 1 ? "one child" : `${f.children_names.length} children`}: ${f.children_names.join(", ")}.`;
}

function executorSentence(e: IntakeFields["executor"]): string {
  const relationship = e.relationship ? `my ${e.relationship}` : PLACEHOLDER;
  return `I appoint ${e.name ?? PLACEHOLDER} (${relationship}) as the executor of my wishes.`;
}

function listOrNone(items: string[] | null, noneText: string): string[] {
  if (items === null) return [PLACEHOLDER];
  if (items.length === 0) return [noneText];
  return items.map((item, i) => `${i + 1}. ${item}`);
}
