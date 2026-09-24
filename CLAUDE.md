# Document Intake Assistant — Project Context

## What this is
A technical test app: conversational interview that collects structured info and generates a
fictional "Personal Wishes Document." Engineering quality and clear reasoning matter more than
feature count. Not production-ready — this is a scoped exercise.

## Stack
- Next.js (App Router) + TypeScript, single repo
- Zod for schema + validation
- Anthropic/OpenAI SDK for the LLM call (structured JSON output)
- Vitest for tests

## Structured schema (source of truth — NOT conversation history)
```ts
{
  full_name: string | null,
  home_address: string | null,
  covers_worldwide_assets: boolean | null,
  has_children: boolean | null,
  children_names: string[] | null,
  executor: { name: string | null, relationship: string | null },
  specific_gifts: string | null,
  additional_wishes: string | null
}
```

## Architecture rules — keep these separated
- `lib/schema.ts` — Zod schema, single source of truth for shape
- `lib/llm.ts` — ONLY place that calls the LLM API. Returns structured JSON:
  { assistant_reply, field_updates, needs_clarification }
- `lib/stateManager.ts` — validates field_updates against schema, merges into state,
  never lets unvalidated data touch state
- `lib/documentGen.ts` — pure function: state -> draft document text
- `app/api/chat/route.ts` — orchestration only, no business logic
- `app/page.tsx` — UI: chat + live state/document preview

## LLM behavior rules
- Never invent or guess a field value. Unconfirmed = null, shown as "not yet provided" in UI.
- Always pass current state to the LLM so it doesn't re-ask filled fields.
- Support multiple fields answered in one message.
- Support corrections — a later answer overwrites a field, no special-casing needed.
- If the LLM response fails to parse/validate: retry once, then fall back to a
  clarifying question instead of crashing.

## Testing priorities (don't skip these)
- state merge logic (valid updates, partial updates, corrections)
- schema validation rejects malformed LLM output
- document generation from a sample complete state
- ambiguous/missing field triggers a follow-up rather than a guess

## AI log
Keep AI_LOG.md updated as we go — key prompts used, any output you corrected or rejected,
and why. Be candid, not polished.

## Explicitly out of scope
- Auth, persistence beyond session, real legal validity, styling polish before logic works

@AGENTS.md
