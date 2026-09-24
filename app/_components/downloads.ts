import { documentToText, generateDocument } from "@/lib/documentGen";
import type { IntakeState } from "@/lib/schema";

/** Browser downloads of the draft. Shared by the document tab and the "draft ready" prompts. */

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTxt(state: IntakeState) {
  const text = documentToText(generateDocument(state));
  saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "personal-wishes-draft.txt");
}

export async function downloadPdf(state: IntakeState) {
  // Loaded on demand so the PDF library isn't in the initial bundle.
  const { documentToPdf } = await import("@/lib/documentPdf");
  saveBlob(documentToPdf(generateDocument(state)).output("blob"), "personal-wishes-draft.pdf");
}
