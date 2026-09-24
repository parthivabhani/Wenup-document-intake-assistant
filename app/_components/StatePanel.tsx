"use client";

import { useState } from "react";
import { formatValue } from "@/lib/format";
import { FIELD_KEYS, FIELD_LABELS, type FieldKey, type IntakeState } from "@/lib/schema";
import { getField, missingFields } from "@/lib/stateManager";
import type { TurnInfo } from "../_hooks/useIntakeChat";

const GROUPS: { title: string; fields: FieldKey[] }[] = [
  { title: "About you", fields: ["full_name", "home_address", "covers_worldwide_assets"] },
  { title: "Family", fields: ["has_children", "children_names"] },
  { title: "Executor", fields: ["executor.name", "executor.relationship"] },
  { title: "Wishes", fields: ["specific_gifts", "additional_wishes"] },
];

type Props = { state: IntakeState; lastTurn: TurnInfo | null; turnKey: number };

export function StatePanel({ state, lastTurn, turnKey }: Props) {
  const [showJson, setShowJson] = useState(false);
  const changed = new Set(lastTurn?.applied.filter((u) => u.status === "confirmed").map((u) => u.field));
  const done = FIELD_KEYS.length - missingFields(state).length;

  return (
    <div className="space-y-5">
      <Progress done={done} total={FIELD_KEYS.length} pending={state.unconfirmed.length} />

      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="mb-2 px-1 font-display text-xs font-extrabold tracking-widest text-violet uppercase">{group.title}</h3>
          <ul className="divide-y divide-lilac/40 overflow-hidden rounded-3xl bg-white">
            {group.fields.map((key) => (
              <FieldRow key={`${key}-${changed.has(key) ? turnKey : 0}`} field={key} state={state} highlight={changed.has(key)} />
            ))}
          </ul>
        </section>
      ))}

      {lastTurn && <TurnDetails turn={lastTurn} />}

      <div className="px-1">
        <button
          onClick={() => setShowJson((s) => !s)}
          className="text-sm font-bold text-violet underline-offset-4 hover:underline"
          aria-expanded={showJson}
        >
          {showJson ? "Hide" : "Show"} raw structured state (JSON)
        </button>
        {showJson && (
          <pre className="mt-3 max-h-80 overflow-auto rounded-3xl bg-ink p-5 font-mono text-xs leading-relaxed text-lilac-soft">
            {JSON.stringify(state, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function Progress({ done, total, pending }: { done: number; total: number; pending: number }) {
  const complete = done === total && pending === 0;
  return (
    <div className={`rounded-3xl p-5 ${complete ? "bg-lime" : "bg-ink text-cream"}`}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs font-extrabold tracking-widest uppercase opacity-80">
            {complete ? "All details collected" : "Information collected"}
          </p>
          <p className="mt-1 font-display text-4xl font-black tabular-nums">
            {done}
            <span className="text-xl opacity-60">/{total}</span>
          </p>
        </div>
        {pending > 0 && (
          <span className="rounded-full bg-amber-soft px-3 py-1 text-xs font-bold text-amber">{pending} to confirm</span>
        )}
      </div>
      <div
        className={`mt-3 h-2.5 overflow-hidden rounded-full ${complete ? "bg-ink/15" : "bg-cream/20"}`}
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${complete ? "bg-ink" : "bg-lime"}`}
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function FieldRow({ field, state, highlight }: { field: FieldKey; state: IntakeState; highlight: boolean }) {
  const value = getField(state.fields, field);
  const pending = state.unconfirmed.find((u) => u.field === field);
  const notApplicable = field === "children_names" && state.fields.has_children === false;

  return (
    <li className={`flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-4 ${highlight ? "flash" : ""}`}>
      <span className="text-sm font-semibold text-ink/70 sm:w-44 sm:shrink-0">{FIELD_LABELS[field]}</span>
      <div className="min-w-0 flex-1 text-[15px]">
        {notApplicable ? (
          <span className="text-ink/55">Not applicable (no children)</span>
        ) : value !== null ? (
          <span className="font-semibold break-words">{formatValue(value)}</span>
        ) : (
          <span className="text-ink/45 italic">Not yet provided</span>
        )}
        {pending && (
          <div className="mt-2 rounded-2xl bg-amber-soft px-3 py-2 text-xs text-amber">
            <strong>Needs confirmation:</strong> {formatValue(pending.value)}
            <span className="block opacity-80">{pending.note}</span>
          </div>
        )}
      </div>
      <StatusBadge status={pending ? "pending" : notApplicable || value !== null ? "done" : "missing"} />
    </li>
  );
}

function StatusBadge({ status }: { status: "done" | "pending" | "missing" }) {
  const styles = {
    done: "bg-mint/45 text-ink",
    pending: "bg-amber-soft text-amber",
    missing: "bg-lilac-pale text-ink/55",
  }[status];
  const label = { done: "✓ Provided", pending: "Unconfirmed", missing: "Missing" }[status];
  return <span className={`self-start rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${styles}`}>{label}</span>;
}

/** Shows what the server did with the model's output on the last turn: evidence of validation at work. */
function TurnDetails({ turn }: { turn: TurnInfo }) {
  const notable = turn.rejected.filter((r) => r.kind !== "ignored");
  const modeLabel = { llm: "Model", mock: "Demo mock", fallback: "Fallback (model failed)" }[turn.meta.mode];
  return (
    <details className="group rounded-3xl border-2 border-dashed border-lilac bg-white/60 px-5 py-4 text-sm">
      <summary className="cursor-pointer font-bold">
        Behind the scenes: last turn {turn.applied.length} applied
        {notable.length > 0 && <span className="text-amber">, {notable.length} rejected by validation</span>}
      </summary>
      <dl className="mt-3 space-y-2.5 text-xs">
        <div>
          <dt className="font-bold">Answered by</dt>
          <dd className="font-mono">
            {modeLabel}
            {turn.meta.provider ? ` · ${turn.meta.provider}` : ""} · {turn.meta.attempts} attempt{turn.meta.attempts === 1 ? "" : "s"}
          </dd>
        </div>
        {turn.applied.length > 0 && (
          <div>
            <dt className="font-bold">Applied</dt>
            {turn.applied.map((u, i) => (
              <dd key={i} className="font-mono">
                {u.field} = {JSON.stringify(u.value)} {u.status === "unconfirmed" ? "(held for confirmation)" : ""}
                {u.is_correction ? " (correction)" : ""}
              </dd>
            ))}
          </div>
        )}
        {notable.length > 0 && (
          <div>
            <dt className="font-bold text-amber">Rejected by validation</dt>
            {notable.map((r, i) => (
              <dd key={i} className="font-mono">
                {r.update.field} = {JSON.stringify(r.update.value)}: {r.reason}
              </dd>
            ))}
          </div>
        )}
      </dl>
    </details>
  );
}
