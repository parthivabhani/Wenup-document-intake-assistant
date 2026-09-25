"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage } from "@/lib/schema";

const EXAMPLES = [
  "I'm Jane Smith and I live at 12 Orchard Lane, Bristol BS1 4AA",
  "My brother James will be my executor",
  "I have two kids, Tom and Sue",
];

type Props = {
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRetry: () => void;
  /** All details collected and confirmed: show the "draft ready" prompt. */
  draftReady: boolean;
  onViewDraft: () => void;
  onDownloadPdf: () => void;
  /** Demo mode (no API key): the scripted assistant takes one answer at a time, so hide the multi-detail examples. */
  demoMode?: boolean;
};

export function ChatPanel({
  messages,
  pending,
  error,
  onSend,
  onRetry,
  draftReady,
  onViewDraft,
  onDownloadPdf,
  demoMode = false,
}: Props) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasUserMessages = messages.some((m) => m.role === "user");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, error, draftReady]);

  useEffect(() => {
    if (!pending) inputRef.current?.focus();
  }, [pending]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || pending) return;
    onSend(draft);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) submit(e);
  }

  return (
    <section aria-label="Conversation" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-lilac/50 px-5 py-4 sm:px-6">
        <Avatar />
        <div>
          <p className="font-display text-base font-extrabold">Intake assistant</p>
          <p className="text-xs text-ink/60">Answer in your own words. You can correct anything later.</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="rise flex justify-end">
              <p className="max-w-[82%] rounded-[1.4rem] rounded-br-md bg-violet px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-white">
                <span className="sr-only">You: </span>
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="rise flex items-end gap-2.5">
              <Avatar small />
              <p className="max-w-[82%] rounded-[1.4rem] rounded-bl-md bg-lilac-pale px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
                <span className="sr-only">Assistant: </span>
                {m.content}
              </p>
            </div>
          ),
        )}

        {pending && (
          <div className="flex items-end gap-2.5" aria-label="Assistant is typing">
            <Avatar small />
            <div className="flex gap-1.5 rounded-full bg-lime px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot h-2 w-2 rounded-full bg-ink" />
              ))}
            </div>
          </div>
        )}

        {draftReady && !pending && (
          <div className="rise ml-9 rounded-3xl border-2 border-ink bg-lime p-5 shadow-[4px_4px_0_var(--color-ink)]" role="status">
            <p className="font-display text-lg font-black">Your draft is ready</p>
            <p className="mt-1 text-sm">
              Review it, then download it as a PDF. You can still change anything by telling me here.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={onViewDraft} className="btn btn-sm bg-ink text-white hover:bg-violet">
                View draft
              </button>
              <button onClick={onDownloadPdf} className="btn btn-outline btn-sm">
                Download PDF
              </button>
            </div>
          </div>
        )}

        {error && !pending && (
          <div role="alert" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="flex-1">Couldn&apos;t reach the assistant: {error}</span>
            <button onClick={onRetry} className="btn btn-sm bg-red-700 text-white hover:bg-red-800">
              Try again
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!hasUserMessages && !demoMode && (
        <div className="px-4 pb-3 sm:px-6">
          <p className="mb-2 font-display text-xs font-extrabold tracking-widest text-violet uppercase">
            Try giving several details at once
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setDraft((d) => (d ? `${d}. ${ex}` : ex));
                  inputRef.current?.focus();
                }}
                className="rounded-full border border-lilac bg-white px-3.5 py-1.5 text-left text-sm transition hover:border-violet hover:bg-lilac-pale"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={submit} className="border-t border-lilac/50 p-3 sm:p-4">
        <div className="flex items-end gap-2 rounded-[1.4rem] border-2 border-lilac bg-cream p-1.5 pl-4 focus-within:border-violet">
          <label htmlFor="chat-input" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder="Type your answer…"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-ink/40"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-lime transition hover:bg-violet disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 px-2 text-[11px] text-ink/45">Enter to send · Shift+Enter for a new line</p>
      </form>
    </section>
  );
}

function Avatar({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-lime font-display font-black text-ink ${small ? "h-7 w-7 text-xs" : "h-10 w-10 text-base"}`}
    >
      W
    </span>
  );
}
