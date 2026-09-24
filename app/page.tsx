"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { FIELD_KEYS } from "@/lib/schema";
import { missingFields } from "@/lib/stateManager";
import { ChatPanel } from "./_components/ChatPanel";
import { DocumentPreview } from "./_components/DocumentPreview";
import { StatePanel } from "./_components/StatePanel";
import { useIntakeChat } from "./_hooks/useIntakeChat";

type View = "chat" | "info" | "document";
type Status = { mode: "live" | "mock"; providers: string[] } | null;

export default function Home() {
  const chat = useIntakeChat();
  const [view, setView] = useState<View>("chat");
  const [panel, setPanel] = useState<Exclude<View, "chat">>("info");
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const done = FIELD_KEYS.length - missingFields(chat.state).length;

  function startOver() {
    if (window.confirm("Start over? This clears the conversation and all collected information.")) chat.reset();
  }

  const infoView = <StatePanel state={chat.state} lastTurn={chat.lastTurn} turnKey={chat.messages.length} />;
  const documentView = <DocumentPreview state={chat.state} />;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-lilac/60 bg-white px-4 py-3 sm:px-6">
        <Image src="/wenup-logo.svg" alt="WenUp" width={92} height={26} priority />
        <div className="h-6 w-px bg-lilac" aria-hidden />
        <h1 className="text-sm font-bold sm:text-base">Document Intake Assistant</h1>
        <div className="ml-auto flex items-center gap-2">
          <ModeBadge status={status} />
          <button onClick={startOver} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-violet hover:bg-lilac-soft">
            Start over
          </button>
        </div>
      </header>

      {status?.mode === "mock" && (
        <p className="bg-amber-soft px-4 py-2 text-center text-xs text-amber sm:text-sm">
          <strong>Demo mode:</strong> no LLM API key is configured, so a simple scripted assistant is answering. It asks one question at a
          time and records answers as typed. Add a key to <code>.env.local</code> for the real conversational experience.
        </p>
      )}

      {/* Mobile view switcher */}
      <nav className="grid grid-cols-3 border-b border-lilac/60 bg-white text-sm font-semibold lg:hidden" aria-label="Views">
        {(
          [
            ["chat", "Chat"],
            ["info", `Details ${done}/${FIELD_KEYS.length}`],
            ["document", "Document"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            aria-current={view === key}
            className={`py-2.5 ${view === key ? "border-b-2 border-violet text-violet" : "text-ink/60"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="flex min-h-0 flex-1">
        <div className={`min-h-0 w-full flex-col lg:flex lg:w-[46%] lg:border-r lg:border-lilac/60 ${view === "chat" ? "flex" : "hidden"}`}>
          <ChatPanel messages={chat.messages} pending={chat.pending} error={chat.error} onSend={chat.send} onRetry={chat.retry} />
        </div>

        {/* Mobile: single panel */}
        <div className={`min-h-0 w-full overflow-y-auto p-4 lg:hidden ${view === "chat" ? "hidden" : "block"}`}>
          {view === "info" ? infoView : documentView}
        </div>

        {/* Desktop: tabbed side panel */}
        <aside className="hidden min-h-0 flex-1 flex-col lg:flex" aria-label="Live preview">
          <div className="flex gap-1 border-b border-lilac/60 bg-white px-6 pt-3" role="tablist">
            {(
              [
                ["info", "Collected information"],
                ["document", "Draft document"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={panel === key}
                onClick={() => setPanel(key)}
                className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${panel === key ? "bg-cream text-ink" : "text-ink/60 hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">{panel === "info" ? infoView : documentView}</div>
        </aside>
      </main>

      <footer className="border-t border-lilac/60 bg-white px-4 py-2 text-center text-[11px] text-ink/60">
        Technical test by Parthiv Abhani for WenUp. Not an official WenUp product. The generated document is fictional and not legal advice.
      </footer>
    </div>
  );
}

function ModeBadge({ status }: { status: Status }) {
  if (!status) return null;
  const live = status.mode === "live";
  return (
    <span
      title={live ? `Provider chain: ${status.providers.join(" → ")}` : "No API key configured"}
      className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${live ? "bg-mint/40" : "bg-amber-soft text-amber"}`}
    >
      {live ? "● Live model" : "Demo mode"}
    </span>
  );
}
