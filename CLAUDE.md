# Document Intake Assistant — Project Context

## What this is
A technical test app: conversational interview that collects structured info and generates a
fictional "Personal Wishes Document." Engineering quality and clear reasoning matter more than
feature count. Not production-ready — this is a scoped exercise.

## Stack
- Next.js 16 (App Router) + TypeScript, single repo, deployed on Vercel
- Zod 4 for schema + validation (also generates the JSON Schema sent to the model)
- OpenAI SDK against Groq (OpenAI-compatible); primary model openai/gpt-oss-120b
- Vitest: `npm test` (offline), `npm run test:live` (real model evals → tests/live/transcript.md)

## Structured schema (source of truth — NOT conversation history)
`null` = unknown, `[]` = user said "none". Hedged values go in `unconfirmed`, never in the document.
```ts
{
  fields: {
  full_name: string | null,
  home_address: string | null,
  covers_worldwide_assets: boolean | null,
  has_children: boolean | null,
  children_names: string[] | null,
  executor: { name: string | null, relationship: string | null },
  specific_gifts: string[] | null,
  additional_wishes: string[] | null
  },
  unconfirmed: { field, value, note }[]
}
```

## Architecture rules — keep these separated
- `lib/schema.ts` — Zod schemas: single source of truth for state, LLM output contract and HTTP API
- `lib/llm/` — ONLY place that talks to a model. `provider.ts` (interface), `openaiCompatible.ts`
  (Groq/Cerebras), `mockProvider.ts` (no-key demo + tests), `prompt.ts`, `index.ts` (runTurn: strict
  JSON output, one repair retry, provider fall-through, never throws; providersFromEnv)
- `lib/stateManager.ts` — the only code that changes state: per-field validation, overwrite guard,
  merge, derived facts, cross-field conflicts. Never lets unvalidated data touch state
- `lib/corrections.ts` — deterministic check that the user's words actually signal a correction
- `lib/chatService.ts` — one turn: runTurn → applyUpdates → choose reply (overrides model on conflict/invalid)
- `lib/documentGen.ts` — pure function: state -> draft document (no LLM)
- `app/api/chat/route.ts` — orchestration only: rate limit, validate body, call chatService
- `app/page.tsx` + `app/_components/*` — UI: chat + live state/document preview

## LLM behavior rules
- Never invent or guess a field value. Unconfirmed = null, shown as "not yet provided" in UI.
- Always pass current state to the LLM so it doesn't re-ask filled fields.
- Support multiple fields answered in one message.
- Corrections: overwriting a known value needs BOTH the model's `is_correction` flag AND a user
  correction cue / reply to our "Which is correct?" question. Otherwise ask (see AI_LOG.md §4).
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
