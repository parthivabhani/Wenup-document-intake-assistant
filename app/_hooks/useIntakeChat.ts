"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatResponseSchema,
  IntakeStateSchema,
  emptyState,
  type ChatMessage,
  type ChatResponse,
  type IntakeState,
} from "@/lib/schema";
import { z } from "zod";

export const GREETING =
  "Hello! I'll help you put together a draft Personal Wishes Document. Answer in your own words; you can give several details at once and correct anything later. To start, what is your full name?";

const STORAGE_KEY = "intake-session-v1";
const SessionSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  state: IntakeStateSchema,
});

export type TurnInfo = Pick<ChatResponse, "applied" | "rejected" | "meta">;

/**
 * Client-side session: the conversation and the latest server-confirmed state.
 * The UI never edits state itself; it only renders what the server returned.
 * Kept in sessionStorage so a page refresh doesn't lose the interview.
 */
export function useIntakeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: GREETING }]);
  const [state, setState] = useState<IntakeState>(emptyState);
  const [lastTurn, setLastTurn] = useState<TurnInfo | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restored = useRef(false);

  // Restore after mount (sessionStorage isn't available during server render).
  useEffect(() => {
    try {
      const saved = SessionSchema.safeParse(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null"));
      if (saved.success) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
        setMessages(saved.data.messages);
        setState(saved.data.state);
      }
    } catch {
      /* storage unavailable: start fresh */
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, state }));
    } catch {
      /* ignore */
    }
  }, [messages, state]);

  const send = useCallback(
    async (text: string, history: ChatMessage[] = messages) => {
      const content = text.trim();
      if (!content || pending) return;

      const outgoing: ChatMessage[] = [...history, { role: "user", content }];
      setMessages(outgoing);
      setPending(true);
      setError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: outgoing, state }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message = (body as { error?: string } | null)?.error;
          throw new Error(message ?? `Request failed (${res.status})`);
        }
        // Validate the server's response too: the UI only ever renders schema-valid state.
        const data = ChatResponseSchema.parse(body);
        setMessages([...outgoing, { role: "assistant", content: data.reply }]);
        setState(data.state);
        setLastTurn({ applied: data.applied, rejected: data.rejected, meta: data.meta });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setPending(false);
      }
    },
    [messages, pending, state],
  );

  /** Resend the last user message after a failed request. */
  const retry = useCallback(() => {
    const lastUser = messages[messages.length - 1];
    if (lastUser?.role !== "user") return;
    void send(lastUser.content, messages.slice(0, -1));
  }, [messages, send]);

  const reset = useCallback(() => {
    setMessages([{ role: "assistant", content: GREETING }]);
    setState(emptyState());
    setLastTurn(null);
    setError(null);
  }, []);

  return { messages, state, lastTurn, pending, error, send, retry, reset };
}
