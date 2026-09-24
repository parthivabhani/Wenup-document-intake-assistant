"use client";

import { Fragment } from "react";
import { PLACEHOLDER, documentToText, generateDocument } from "@/lib/documentGen";
import type { IntakeState } from "@/lib/schema";

export function DocumentPreview({ state }: { state: IntakeState }) {
  // Same pure function the server would use: the preview can't drift from the state.
  const doc = generateDocument(state);

  function download() {
    const blob = new Blob([documentToText(doc)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "personal-wishes-draft.txt" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${doc.isDraftComplete ? "bg-mint/50" : "bg-lilac-soft text-ink/70"}`}
        >
          {doc.isDraftComplete ? "Draft complete" : "Draft in progress"}
        </span>
        <button onClick={download} className="rounded-lg border border-violet px-3 py-1.5 text-sm font-semibold text-violet hover:bg-violet hover:text-white">
          Download .txt
        </button>
      </div>

      <article className="rounded-2xl border border-lilac/60 bg-white px-6 py-7 shadow-sm sm:px-8">
        <p role="note" className="mb-6 rounded-lg border-2 border-ink bg-lime px-4 py-3 text-xs leading-relaxed font-semibold">
          {doc.disclaimer}
        </p>
        <h2 className="mb-5 font-serif text-2xl font-bold">{doc.title}</h2>
        {doc.sections.map((s) => (
          <section key={s.heading} className="mb-5">
            <h3 className="mb-1.5 text-sm font-bold tracking-wide text-violet uppercase">{s.heading}</h3>
            {s.body.map((line, i) => (
              <p key={i} className="font-serif text-[15px] leading-relaxed">
                <WithPlaceholders text={line} />
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}

/** Renders "[not yet provided]" markers visibly so gaps are obvious, never silently filled. */
function WithPlaceholders({ text }: { text: string }) {
  const parts = text.split(PLACEHOLDER);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <mark className="rounded bg-lilac-soft px-1 font-sans text-xs text-ink/60 italic">not yet provided</mark>
          )}
        </Fragment>
      ))}
    </>
  );
}
