import Link from "next/link";
import { SiteHeader } from "./_components/SiteHeader";

const REPO = "https://github.com/parthivabhani/Wenup-document-intake-assistant";

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <SiteHeader
        actions={
          <>
            <a href="#how" className="btn btn-outline btn-sm hidden sm:inline-flex">
              How it works
            </a>
            <Link href="/intake" className="btn btn-violet btn-sm">
              Start your draft
            </Link>
          </>
        }
      />

      <main>
        <Hero />
        <Principles />
        <HowItWorks />
        <ClosingCta />
      </main>

      <footer className="border-t border-lilac/60 px-4 py-8 text-center text-sm text-ink/70">
        Built by Parthiv Abhani for the Wenup engineering technical test. Not an official Wenup product.
        <br />
        Any document produced is fictional and is not legal advice. ·{" "}
        <a href={REPO} className="font-semibold text-violet underline-offset-4 hover:underline">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-8">
      <div className="grid overflow-hidden rounded-[2.5rem] bg-violet lg:grid-cols-2">
        <div className="px-7 py-12 sm:px-14 sm:py-20">
          <h1 className="font-display text-5xl leading-[0.95] font-black tracking-tight text-cream sm:text-7xl">
            Your wishes,
            <br />
            drafted in a
            <br />
            conversation.
          </h1>
          <p className="mt-6 max-w-md text-lg text-cream/90">
            Answer a few questions in your own words. Watch your details fill in live, and get a clear draft Personal
            Wishes Document at the end.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/intake" className="btn btn-lime">
              Start your draft <Arrow />
            </Link>
            <a href="#how" className="btn btn-outline">
              See how it works
            </a>
          </div>
          <p className="mt-6 text-sm text-cream/70">About 5 minutes · No sign-up needed</p>
        </div>

        <div className="relative hidden items-center justify-center bg-lilac-soft p-10 lg:flex" aria-hidden>
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

/** A static illustration of the app: a chat exchange feeding the structured state. */
function ProductPreview() {
  return (
    <div className="relative w-full max-w-md">
      <div className="space-y-3">
        <div className="max-w-[80%] rounded-3xl rounded-bl-md bg-white px-5 py-3.5 text-[15px] shadow-sm">
          Who would you like to appoint as your executor?
        </div>
        <div className="ml-auto max-w-[70%] rounded-3xl rounded-br-md bg-ink px-5 py-3.5 text-[15px] text-white shadow-sm">
          My brother James.
        </div>
      </div>

      <div className="mt-6 rotate-[-1.5deg] rounded-3xl border-2 border-ink bg-white p-5 shadow-[6px_6px_0_var(--color-ink)]">
        <p className="mb-3 font-display text-xs font-extrabold tracking-widest text-violet uppercase">Captured</p>
        <dl className="space-y-2.5 text-sm">
          <Row label="Executor's name" value="James" />
          <Row label="Relationship" value="brother" />
          <Row label="Home address" value="not yet provided" muted />
        </dl>
      </div>

      <p className="absolute -right-4 -bottom-8 rotate-[3deg] bg-lime px-3 py-1.5 font-display text-sm font-extrabold">
        Only what you said.
      </p>
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-semibold">{label}</dt>
      <dd className={muted ? "text-ink/50 italic" : ""}>{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

const PRINCIPLES = [
  {
    title: "Answer naturally",
    body: "Give several details in one sentence, in any order. “I'm Jane, I live in Bristol and my brother James is executor” fills three fields at once.",
    tone: "bg-lilac-soft",
    icon: "chat",
  },
  {
    title: "Nothing invented",
    body: "If you haven't said it, it isn't filled in. Unknown details stay visibly “not yet provided”, and hedged answers wait for your confirmation.",
    tone: "bg-lime",
    icon: "hand",
  },
  {
    title: "Contradictions caught",
    body: "Say you have no children, then mention your son? You'll be asked which is right, rather than having your earlier answer quietly overwritten.",
    tone: "bg-white border-2 border-lilac",
    icon: "shield",
  },
  {
    title: "Change your mind anytime",
    body: "“Actually, make my sister executor instead.” Corrections update the draft straight away, and you can see exactly what changed.",
    tone: "bg-lilac",
    icon: "pencil",
  },
];

function Principles() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-8 sm:pt-32">
      <h2 className="max-w-4xl font-display text-4xl leading-[1.02] font-black tracking-tight sm:text-6xl">
        Tell it in your own words. We&apos;ll keep the details <span className="mark-lime">straight.</span>
      </h2>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map((p) => (
          <article key={p.title} className={`flex flex-col rounded-[2rem] p-7 ${p.tone}`}>
            <Icon name={p.icon} />
            <h3 className="mt-8 font-display text-2xl leading-tight font-extrabold">{p.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

const STEPS = [
  {
    n: "01",
    title: "The model proposes",
    body: "An LLM reads your message and returns strict JSON: which fields you mentioned, their values, and whether anything was unclear.",
  },
  {
    n: "02",
    title: "The code decides",
    body: "Every proposal is checked against a schema. Wrong types are rejected, contradictions are blocked, and an answer only changes when your own words say it's a correction.",
  },
  {
    n: "03",
    title: "State is the source of truth",
    body: "Confirmed details live in a structured record, not the chat log. It's sent back each turn, so nothing gets forgotten or asked twice.",
  },
  {
    n: "04",
    title: "The document is built, not written",
    body: "The draft is produced by plain code from confirmed details only. The model never writes the document, so it can't make up a clause.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="mt-24 scroll-mt-8 bg-ink py-20 text-cream sm:mt-32 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <p className="font-display text-sm font-extrabold tracking-widest text-lime uppercase">Under the hood</p>
        <h2 className="mt-4 max-w-3xl font-display text-4xl leading-[1.02] font-black tracking-tight sm:text-6xl">
          The AI suggests. <span className="mark-lilac text-ink">The rules decide.</span>
        </h2>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-[2rem] bg-cream/15 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-ink p-7 sm:p-8">
              <span className="font-display text-5xl font-black text-lime">{s.n}</span>
              <h3 className="mt-5 font-display text-xl font-extrabold">{s.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-cream/80">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-cream/80">
          <span>111 automated tests · 13 live model evals</span>
          <span>Automatic fallback across 5 models from 3 providers</span>
          <a href={REPO} className="font-bold text-lime underline-offset-4 hover:underline">
            Read the code and design notes →
          </a>
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-8 sm:py-32">
      <h2 className="mx-auto max-w-3xl font-display text-4xl leading-[1.02] font-black tracking-tight sm:text-6xl">
        Ready when <span className="mark-lilac">you are.</span>
      </h2>
      <p className="mx-auto mt-5 max-w-xl text-lg text-ink/80">
        Nine questions, one conversation, and a draft you can download as a PDF. It&apos;s a demonstration, so feel free to make
        things up.
      </p>
      <Link href="/intake" className="btn btn-lime mt-9">
        Start your draft <Arrow />
      </Link>
    </section>
  );
}

const ICON_PATHS: Record<string, string> = {
  chat: "M4 5h16v11H9l-5 4V5Zm4 4h8m-8 3h5",
  hand: "M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-.5A5.5 5.5 0 0 1 5 16.5V11a1.5 1.5 0 0 1 3 0",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-5",
  pencil: "m4 20 4-1 11-11-3-3L5 16l-1 4Zm10-13 3 3",
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={ICON_PATHS[name]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}
