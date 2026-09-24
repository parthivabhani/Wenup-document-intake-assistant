"use client";

import { Fragment } from "react";
import { PLACEHOLDER, generateDocument } from "@/lib/documentGen";
import type { IntakeState } from "@/lib/schema";
import { downloadPdf, downloadTxt } from "./downloads";

export function DocumentPreview({ state }: { state: IntakeState }) {
  // Same pure function the server would use: the preview can't drift from the state.
  const doc = generateDocument(state);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${doc.isDraftComplete ? "bg-lime" : "bg-white text-ink/70"}`}
        >
          {doc.isDraftComplete ? "✓ Draft complete" : "Draft in progress: gaps are highlighted"}
        </span>
        <div className="flex gap-2">
          <button onClick={() => downloadPdf(state)} className="btn btn-violet btn-sm">
            Download PDF
          </button>
          <button onClick={() => downloadTxt(state)} className="btn btn-outline btn-sm">
            .txt
          </button>
        </div>
      </div>

      <article className="rounded-sm bg-white px-7 py-9 shadow-[0_1px_0_#0001,0_12px_30px_-12px_#24006740] sm:px-12 sm:py-12">
        <p role="note" className="mb-8 -rotate-[0.6deg] border-2 border-ink bg-lime px-4 py-3 font-display text-xs leading-relaxed font-extrabold">
          {doc.disclaimer}
        </p>
        <h2 className="mb-8 border-b-2 border-ink pb-4 font-serif text-3xl font-bold">{doc.title}</h2>
        {doc.sections.map((s) => (
          <section key={s.heading} className="mb-6">
            <h3 className="mb-2 font-display text-xs font-extrabold tracking-widest text-violet uppercase">{s.heading}</h3>
            {s.body.map((line, i) => (
              <p key={i} className="font-serif text-[16px] leading-relaxed">
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
            <mark className="rounded-sm bg-lilac-soft px-1.5 py-0.5 font-sans text-xs font-semibold text-violet">not yet provided</mark>
          )}
        </Fragment>
      ))}
    </>
  );
}
