# AI log

Tool: **Claude Code** (Claude Opus, desktop app) as a pair programmer, working in the repo with terminal access. I set the direction, constraints and review points; Claude wrote most of the code and ran the tests, evals and browser checks. The entries below are in the order things happened. They include the mistakes.

---

## 1. Setting the ground rules (before any code)

I wrote a `CLAUDE.md` for the project before starting, so the AI would follow my architecture instead of inventing its own:

> - `lib/schema.ts` — Zod schema, single source of truth for shape
> - `lib/llm.ts` — ONLY place that calls the LLM API. Returns structured JSON
> - `lib/stateManager.ts` — validates field_updates against schema, merges into state, never lets unvalidated data touch state
> - `lib/documentGen.ts` — pure function: state -> draft document text
> - `app/api/chat/route.ts` — orchestration only, no business logic
> - Never invent or guess a field value. Unconfirmed = null …
> - If the LLM response fails to parse/validate: retry once, then fall back to a clarifying question instead of crashing.

Then: *"lets plan it out, tell me everything you need"* with the brief attached.

**What I kept / changed from the AI's plan**
- It proposed extending my schema: `specific_gifts` / `additional_wishes` as **lists** (so `[]` can mean "none" and `null` can mean "unknown"), plus an `unconfirmed[]` area for hedged answers. I accepted both, because the brief says to *represent unknown or unconfirmed values explicitly*, and a single nullable string can't tell "no gifts" apart from "not asked yet".
- `lib/llm.ts` became a folder `lib/llm/` (interface, provider, mock, prompt). Same rule, since nothing outside it touches a model, but split for testability.
- It added `lib/chatService.ts` so the route stays "orchestration only" like my rule says. The turn logic needed somewhere testable that isn't HTTP.

## 2. Provider choice: probe before building

I had Groq and Cerebras keys. Instead of assuming, Claude probed both APIs first:
- Both list `gpt-oss-120b`, and Groq supports **strict JSON-schema output**. First test: "My brother James." → `{"name": "James"}`, no invented surname.
- **Cerebras returned `402 Payment required` on every request**, even plain chat. The key has no quota. I decided to keep Cerebras as an *optional* link in the chain rather than drop the code, since the chain skips it cleanly.
- My `.env.local` used names like `groq-api-key`. Vercel only accepts env var names made of letters, digits and underscores, so they were renamed to `GROQ_API_KEY` / `CEREBRAS_API_KEY`. The values were never printed.

## 3. Unit tests passed, but the first live eval found 4 real problems

The fixture-based tests all passed, but they only prove the *pipeline*, not the *model*. So we added `npm run test:live`: scripted scenarios against the real model that write a transcript. The second run looked very different from the first:

| Problem found | Cause | Fix |
|---|---|---|
| Turns silently answered by `gpt-oss-20b` | Groq free tier = **8k tokens/min per model**; one turn is about 1.6k tokens; 9 quick calls exhausted the primary | Measured usage; compact prompt (unindented state JSON, history 20→12); added `qwen3.8-27b` (own budget) to the chain; paced the eval |
| 20b recorded executor name as the literal string `"unconfirmed"` | Weaker model under the fallback | Same as above; the primary model doesn't do this |
| Hedged answer → reply "I wasn't able to record your executor's name" | **My code's bug, not the model's.** The model correctly sent `value: null, status: "unconfirmed"` ("unsure, no candidate") and I classified that as *invalid*, which overrides the reply | Rejections now have a `kind` (`invalid` / `conflict` / `ignored`); only `invalid` overrides the model's reply |
| "Leave my watch to my son Tom" after "no children" was recorded as a gift only | The model never touched `children_names`, so the code-level consistency check couldn't see the conflict | Prompt rule: mentioning your child by name must also update `children_names`, which routes the case into the deterministic check |

Also: the live suite was accidentally picked up by `npm test` (`*.live.test.ts` matches `*.test.ts`) and failed on timeouts. Excluded it in the Vitest config.

## 4. Contradiction vs correction: three iterations

This is where I pushed back on the AI's first design the most.

**v1: cross-field consistency rules in code.** `has_children: false` + names → drop this turn's conflicting updates and ask. Live transcript after the prompt fix:

> **User:** I'd like to leave my watch to my son Tom. *(state: has_children = false)*
> **Model:** applied `has_children = true`, `children_names = ["Tom"]` → "Got it. Could you tell me your home address?"

The model changed **both** fields together, which is internally consistent, so the rule passed it. The code couldn't tell a correction from a contradiction because nothing *declared* which it was.

**v2: the model must declare it.** Added `is_correction: boolean` to each update. The state manager refuses to overwrite a known, different value unless it's flagged, and asks instead:
> "Earlier you told me you don't have children, but now it sounds like you have a child named Tom. Which is correct?"

It doesn't count refinements ("James" → "James Smith") or list additions ("I also have a daughter") as overwrites, and it merges the has_children and children_names conflicts into one question. All live evals passed.

**v3: two-key rule, found by clicking through the real UI.** In the browser, with the full conversation as history, the same sentence produced:
> `has_children = true (correction)` · `children_names = ["Tom"] (correction)`

The model marked a contradiction as a correction. **So the model's flag alone can't be trusted.** Now an overwrite needs both the model's flag **and** evidence in the user's own words: correction language ("actually", "sorry", "I meant", "instead"…) or a reply to the app's own "Which is correct?" question (`lib/corrections.ts`).

I accepted a regex here knowingly. It's crude, but its failure mode is safe: a missed genuine correction costs one extra question, while a false correction would silently put wrong data in the document. Added this exact conversation as a live regression test. I'd replace the regex with a proper UI confirmation in production (see README).

## 5. Things suggested or considered and rejected

- **Letting the LLM write the document.** Rejected: the document must contain only validated state, so `documentGen` is a pure function with no LLM. It's deterministic, testable, and can't hallucinate a clause.
- **Conversation history as memory.** Rejected per the brief: state is sent in full each turn; history is trimmed to 12 messages and only used to understand short answers like "yes".
- **Separate backend on Render/Railway.** My first instinct was to host frontend and backend separately. Claude recommended a single Vercel deployment instead: Next.js API routes already run as serverless functions, and splitting would add CORS, two pipelines and duplicated types for no real benefit at this scale.
- **Model self-reported confidence scores** for ambiguity. Not used: numeric confidence from an LLM isn't calibrated. An explicit `status: "unconfirmed"` + note, handled by code, is easier to reason about and test.
- **Retrying the same provider on 429.** Rejected: waiting out a per-minute limit inside a request is slow; switching to a model with its own budget is faster.

## 6. Smaller corrections along the way

- `npm i -D vitest` failed on a peer conflict (`@types/node@20` vs Vitest 5's `>=22`). Fixed by matching `@types/node` to the Node 24 runtime, not `--force`.
- `z.toJSONSchema()` output includes a `$schema` key that providers reject in `response_format`, so it's stripped.
- Vitest config had to be `.mts` (ESM) to avoid a config-loader warning; typecheck runs `next typegen` first because Next 16 generates `LayoutProps` types.
- The preview server tool hung on "starting", so the dev server was run directly and tested with curl before browser testing.
- Before the first push: checked the remote was empty and scanned all commits for key patterns (`gsk_`, `csk-`) to make sure no secret was ever committed.

## 7. Evidence

- `tests/live/transcript.md`: latest real-model transcript for every scenario (provider, applied/rejected updates).
- Git history: one commit per stage (core → LLM layer → UI + correction rule → docs), with each fix explained in the commit message.
