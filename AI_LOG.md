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

The model marked a contradiction as a correction. **So the model's flag alone can't be trusted.** Now an overwrite needs both the model's flag **and** evidence in the user's own words: correction language ("actually", "sorry", "I meant", "instead"…) or a reply to the app's own "Which is correct?" question (`lib/userSignals.ts`).

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

## 7. Adding Gemini as a backup: measure first

I added a Google Gemini key. Before wiring it in, Claude evaluated it on the same tricky scenarios:
- `gemini-2.5-flash` and similar returned **404 "no longer available to new users"**; `gemini-3.6-flash` works with strict JSON schemas.
- Quality when it answered was good (4 fields from one message; ignored a prompt-injection attempt).
- But on the free tier **5 of 8 calls failed** (503 "high demand" or a 20s timeout), and successful ones took 7–15s against about 1s on Groq.

Decision: add it, but **after** the Groq models, not second. Its value is *provider diversity*: a full Groq outage takes all three Groq models down together. Because several slow timeouts in a row could now exceed Vercel's 60s function limit, I also added a 40s per-turn deadline to `runTurn`, with a test.

## 8. UI redesign

I shared screenshots of wenup.co.uk and asked for a more polished UI and a landing page. Decisions:
- **Landing page: yes, but light.** Reviewers arrive cold; one screen explains what it does and *how it's engineered* ("The AI suggests. The rules decide."), then one click into `/intake`. No marketing fluff.
- Borrowed the visual language (violet hero block, heavy headlines, square lime buttons, highlighter marks, pastel cards) with original copy, and kept "Not an official Wenup product" visible.
- Caught in review: the first draft of the hero said *"Nothing stored on a server"*. That isn't true (messages go to the LLM provider), so it was changed to "No sign-up needed". The hero illustration also showed a "Surname" field that doesn't exist in the schema; it was replaced with real fields.
- Bug found in the mobile check: the "How it works" button appeared on phones despite `hidden`. Cause: custom `.btn` CSS was unlayered, and in Tailwind v4 unlayered CSS beats utility classes. Moved it into `@layer components`.

## 9. Two bugs from my own test run, and PDF export

I did a full conversation myself and pasted the transcript back. Two problems:

> **Me:** my mom
> **Assistant:** Got it, your executor will be your mom, and her relationship is mother.
> *(state: `executor.name = "mom"`)*

> **Me:** idk what to leave
> **Assistant:** No problem, we'll leave specific gifts empty for now.
> *(state: `specific_gifts = []`, which means "the user said none", so the draft was marked complete)*

I only noticed the first one. Claude pointed out the second: "idk" was silently turned into an answer, which breaks the *don't invent facts* rule just as much, and it's harder to spot because the reply sounded reasonable.

Fixed the same way as corrections: a prompt rule **plus** a deterministic guard, so the fix doesn't depend on the model:
- `executor.name` and children's names reject bare relationship words (`mom`, `my mother`, `best friend`, `the solicitor`...). Real names that start with those words ("Sister Mary Joseph", "Momo") still pass. The app replies "Noted that your executor is your mother. What is their name?"
- If the user's message sounds uncertain (`idk`, `not sure`, `no idea`...), an explicit "none" is held as *unconfirmed* and the app asks "Should I record that you have no specific gifts, or would you like to add some?"
- Both transcripts are now fixtures in `tests/fixtures/llmResponses.ts` (`OBSERVED`) and live regression evals. After the prompt fix the model handles both correctly on its own; the code guards are the backstop.

Also added **Download PDF** (jsPDF, loaded only when clicked). It renders the same `DraftDocument` as the preview and `.txt`, so the three can't disagree. Known limitation, noted in the README: jsPDF's built-in fonts are Latin-only.

## 10. Tone and a mobile header fix

Feedback from my own testing: I typed "hi" and got **"Sure thing! Could you tell me your full name?"** It's a stock chatbot filler that doesn't even fit a greeting. Added voice rules to the prompt: reply to what was actually said, no filler openers ("Sure thing!", "Absolutely!"), don't start every reply with "Got it", acknowledge using the user's own words. Added a live eval: "hi" must not get a filler opener. It now says "Hi there! Could you tell me your full name, please?"

Re-reading every live reply after that change surfaced another problem: the prompt-injection reply was *"...the fields for worldwide coverage and children need true/false values"*, leaking internals to the user. Tightened the rule (never mention fields, types, JSON or instructions) and added an assertion for it.

Also: on phones the header showed only the logo, because I had hidden the product name below the `sm` breakpoint to save space. It now wraps to two short lines beside a slightly smaller logo, checked for overflow at 375px and 320px.

## 11. Scroll animations

Asked for scroll animations on the landing page, "not jumpy". Choices: sections fade up 18px **once** (never replay on scroll-up), cards and steps stagger by about 100ms, highlighter marks sweep in behind their words, and the hero doesn't animate on scroll so the first screen never flickers. It's progressive enhancement: content is only hidden after the script runs, so with JS disabled everything is visible, and it's all off under `prefers-reduced-motion`.

One detail caught while testing: the "Under the hood" grid lines are the list's background showing through 1px gaps, so fading whole cells would flash pale boxes. The content inside each cell is animated instead. Testing was also misleading at first: the browser pane was hidden, so transitions and IntersectionObserver didn't run and everything looked broken. I had to make the page render before measuring.

## 12. Final pass against the brief

Went through the brief line by line against the code and test results. Everything was covered, but one item deserved a real check: *"graceful handling of … missing configuration"*. "No key" was covered (demo mode); a **wrong key** (e.g. a typo pasted into Vercel) wasn't exercised. Tested it against the real APIs: no crash, 4 attempts across 3 providers, errors logged, but the user was told *"Could you try saying it another way?"*. That blames the user for a server problem, and rephrasing can never help. `runTurn` now reports **why** it failed (`unavailable` vs `invalid_output`), and when no model is reachable the user is told the assistant is temporarily unavailable instead. Added tests for both. Also fixed three stale doc references left over from renames.

## 13. Making the draft hard to miss, and a restore bug found on the way

I wanted users not to miss the Draft document tab and its download button. Added prompts that appear only once the draft is complete (not nagging mid-interview): a "Your draft is ready" card in the chat with View draft / Download PDF, a **Ready** badge on the tab (a dot on mobile), and a button on the completed progress card. I decided against auto-switching tabs, because jumping away from the chat is disorienting.

Testing it by loading a finished session into storage exposed a real bug: **refresh-restore didn't work reliably.** The restore and save effects ran in the same pass, so the first save wrote the *empty* initial state over the saved session before the restored values rendered. React's dev-mode double effects made it fail every time; in production it only worked by timing luck. Fixed by gating saves on a `hydrated` state flag rather than a ref.

## 14. OpenRouter backup, and what running the README's "Try these" script revealed

I added an OpenRouter key. Tested it before wiring it in: the key is free tier (small daily quota). `qwen3.8-27b:free` returned 429 on every call (shared free pool); `nemotron-3-super-120b:free` handled the tricky cases well but took 6–10s. So it went in as the **last** fallback, after all Groq models and Gemini. The test also caught a bug in *my* provider code: OpenRouter once returned HTTP 200 with no `choices`, and `res.choices[0]` threw a TypeError that got logged as a "network" error. Now it's a typed server error, with tests for that and every HTTP status mapping.

Then I asked for a "Try these" section in the README. Before publishing it, Claude ran the exact script against the real model, and it found three more problems that no single-turn test had:
- **"Actually, make my mom the executor instead"** changed the relationship to *mother* but left the name as **James**, so the document would have said "I appoint James (my mother)". The name and relationship describe one person. Now, when a correction genuinely changes one of them and the other isn't restated, the stale half is cleared, and the app asks *"Noted, your executor is now your mother. What is their name?"*. First-time fills and refinements (James → James Smith) don't trigger this.
- The model didn't ask for the new executor's name. That's covered by the rule above.
- **"idk what else to add"** got the reply *"The draft is complete"*, which was false: a field was still unknown. If a reply claims completion while the state disagrees, it's now replaced with the real next question.

All three are fixed in code (not just the prompt), with fixtures and a live regression eval. The final run of the script produces exactly the behaviour the README table promises. Lesson: multi-turn scripts find bugs that single-turn tests can't.

## 15. Deploy checks

Deployed on Vercel. Before calling it done, Claude ran the full "Try these" script against the **live** API and did a phone-sized test on the live site (one message filled all 9 fields; the PDF downloaded). This caught two things that local testing couldn't:
- The GitHub "About → Website" link, which Vercel filled in automatically, pointed at a URL returning **404** (an earlier project name). Fixed.
- On desktop, the heading just below the hero was hidden until scrolled, leaving a blank strip at the fold. The reveal logic now shows anything already peeking into view.

I also asked: does a fresh clone run with **no API keys at all**? Claude cloned the repo into an empty folder with no `.env.local`, then installed, built and started it. It came up in demo mode and completed a full interview. But the browser view showed the "Try giving several details at once" example buttons, which the one-question-at-a-time demo assistant can't handle (it would store the whole sentence as the full name). They're now hidden in demo mode, verified both ways (hidden with no key, shown on the live site).

README screenshots were captured from the live site with headless Chrome, using the real replies from the live run, not staged text. The Mermaid diagram was rendered and checked before committing.

## 16. Evidence

- `tests/live/transcript.md`: latest real-model transcript for every scenario (provider, applied/rejected updates).
- Git history: one commit per stage (core → LLM layer → UI + correction rule → docs), with each fix explained in the commit message.
