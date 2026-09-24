"use client";

import { useEffect, useState } from "react";
import { FIELD_KEYS } from "@/lib/schema";
import { missingFields } from "@/lib/stateManager";
import { ChatPanel } from "../_components/ChatPanel";
import { DocumentPreview } from "../_components/DocumentPreview";
import { SiteHeader } from "../_components/SiteHeader";
import { StatePanel } from "../_components/StatePanel";
import { useIntakeChat } from "../_hooks/useIntakeChat";

type View = "chat" | "info" | "document";
type Status = { mode: "live" | "mock"; providers: string[] } | null;

export default function IntakePage() {
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
      <div className="border-b border-lilac/60 bg-cream">
        <SiteHeader
          compact
          actions={
            <>
              <ModeBadge status={status} />
              <button onClick={startOver} className="btn btn-outline btn-sm">
                Start over
              </button>
            </>
          }
        />
      </div>

      {status?.mode === "mock" && (
        <p className="bg-amber-soft px-4 py-2 text-center text-xs text-amber sm:text-sm">
          <strong>Demo mode:</strong> no LLM API key is configured, so a simple scripted assistant is answering. It asks
          one question at a time and records answers as typed. Add a key to <code>.env.local</code> for the real
          conversational experience.
        </p>
      )}

      {/* Mobile view switcher */}
      <nav className="grid grid-cols-3 gap-1 border-b border-lilac/60 bg-cream p-1.5 text-sm font-bold lg:hidden" aria-label="Views">
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
            className={`rounded-full py-2 ${view === key ? "bg-ink text-white" : "text-ink/60"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 gap-5 lg:p-5">
        <div className={`min-h-0 w-full flex-col lg:flex lg:w-[44%] ${view === "chat" ? "flex" : "hidden"}`}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white lg:rounded-[2rem] lg:border lg:border-lilac/70">
            <ChatPanel
              messages={chat.messages}
              pending={chat.pending}
              error={chat.error}
              onSend={chat.send}
              onRetry={chat.retry}
            />
          </div>
        </div>

        {/* Mobile: single panel */}
        <div className={`min-h-0 w-full overflow-y-auto p-4 lg:hidden ${view === "chat" ? "hidden" : "block"}`}>
          {view === "info" ? infoView : documentView}
        </div>

        {/* Desktop: tabbed side panel */}
        <aside className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] bg-lilac-pale lg:flex" aria-label="Live preview">
          <div className="flex items-center gap-4 px-7 pt-6">
            <div className="flex rounded-full bg-white p-1 shadow-sm" role="tablist">
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
                  className={`rounded-full px-5 py-2 text-sm font-bold transition ${panel === key ? "bg-ink text-white" : "text-ink/60 hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-5 pb-7">{panel === "info" ? infoView : documentView}</div>
        </aside>
      </main>

      <footer className="hidden px-4 pb-2 text-center text-[11px] text-ink/55 lg:-mt-2 lg:block">
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
      className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex ${live ? "bg-mint/40" : "bg-amber-soft text-amber"}`}
    >
      <span className={`h-2 w-2 rounded-full ${live ? "bg-green-600" : "bg-amber"}`} aria-hidden />
      {live ? "Live model" : "Demo mode"}
    </span>
  );
}
