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
};

export function ChatPanel({ messages, pending, error, onSend, onRetry }: Props) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasUserMessages = messages.some((m) => m.role === "user");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, error]);

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
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <p
              className={
                m.role === "user"
                  ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-white"
                  : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-lilac-soft px-4 py-2.5 text-[15px] leading-relaxed text-ink"
              }
            >
              <span className="sr-only">{m.role === "user" ? "You: " : "Assistant: "}</span>
              {m.content}
            </p>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start" aria-label="Assistant is typing">
            <div className="flex gap-1.5 rounded-full bg-lime px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot h-2 w-2 rounded-full bg-ink" />
              ))}
            </div>
          </div>
        )}

        {error && !pending && (
          <div role="alert" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="flex-1">Couldn&apos;t reach the assistant: {error}</span>
            <button onClick={onRetry} className="rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800">
              Try again
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!hasUserMessages && (
        <div className="flex flex-wrap gap-2 px-4 pb-2 sm:px-6">
          <span className="w-full text-xs font-semibold tracking-wide text-violet uppercase">Try a multi-detail answer</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setDraft((d) => (d ? `${d}. ${ex}` : ex))}
              className="rounded-full border border-lilac bg-white px-3 py-1.5 text-left text-sm text-ink hover:border-violet"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="border-t border-lilac/60 bg-white p-3 sm:p-4">
        <div className="flex items-end gap-2">
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
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-lilac bg-cream px-4 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink/40 focus:border-violet focus:ring-2 focus:ring-lilac"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="h-[44px] rounded-xl bg-violet px-5 font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
