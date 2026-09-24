"use client";

import { useState } from "react";
import { formatValue } from "@/lib/format";
import { FIELD_KEYS, FIELD_LABELS, type FieldKey, type IntakeState } from "@/lib/schema";
import { getField, missingFields } from "@/lib/stateManager";
import type { TurnInfo } from "../_hooks/useIntakeChat";

type Props = { state: IntakeState; lastTurn: TurnInfo | null; turnKey: number };

export function StatePanel({ state, lastTurn, turnKey }: Props) {
  const [showJson, setShowJson] = useState(false);
  const changed = new Set(lastTurn?.applied.filter((u) => u.status === "confirmed").map((u) => u.field));
  const done = FIELD_KEYS.length - missingFields(state).length;

  return (
    <div className="space-y-5">
      <Progress done={done} total={FIELD_KEYS.length} />

      <ul className="divide-y divide-lilac/50 overflow-hidden rounded-2xl border border-lilac/60 bg-white">
        {FIELD_KEYS.map((key) => (
          <FieldRow
            key={`${key}-${changed.has(key) ? turnKey : 0}`}
            field={key}
            state={state}
            highlight={changed.has(key)}
          />
        ))}
      </ul>

      {lastTurn && <TurnDetails turn={lastTurn} />}

      <div>
        <button
          onClick={() => setShowJson((s) => !s)}
          className="text-sm font-semibold text-violet underline-offset-4 hover:underline"
          aria-expanded={showJson}
        >
          {showJson ? "Hide" : "Show"} raw structured state (JSON)
        </button>
        {showJson && (
          <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-lilac-soft">
            {JSON.stringify(state, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="font-semibold">Information collected</span>
        <span className="tabular-nums text-ink/70">
          {done} of {total}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-lilac-soft" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
        <div className="h-full rounded-full bg-violet transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    </div>
  );
}

function FieldRow({ field, state, highlight }: { field: FieldKey; state: IntakeState; highlight: boolean }) {
  const value = getField(state.fields, field);
  const pending = state.unconfirmed.find((u) => u.field === field);
  const notApplicable = field === "children_names" && state.fields.has_children === false;

  return (
    <li className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 ${highlight ? "flash" : ""}`}>
      <span className="text-sm font-semibold sm:w-48 sm:shrink-0">{FIELD_LABELS[field]}</span>
      <div className="min-w-0 flex-1 text-sm">
        {notApplicable ? (
          <span className="text-ink/60">Not applicable (no children)</span>
        ) : value !== null ? (
          <span className="break-words">{formatValue(value)}</span>
        ) : (
          <span className="text-ink/50 italic">Not yet provided</span>
        )}
        {pending && (
          <div className="mt-1.5 rounded-lg bg-amber-soft px-2.5 py-1.5 text-xs text-amber">
            <strong>Needs confirmation:</strong> {formatValue(pending.value)}
            <span className="block text-amber/80">{pending.note}</span>
          </div>
        )}
      </div>
      <StatusBadge status={pending ? "pending" : notApplicable || value !== null ? "done" : "missing"} />
    </li>
  );
}

function StatusBadge({ status }: { status: "done" | "pending" | "missing" }) {
  const styles = {
    done: "bg-mint/40 text-ink",
    pending: "bg-amber-soft text-amber",
    missing: "bg-lilac-soft text-ink/60",
  }[status];
  const label = { done: "Provided", pending: "Unconfirmed", missing: "Missing" }[status];
  return <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${styles}`}>{label}</span>;
}

/** Shows what the server did with the model's output on the last turn: evidence of validation at work. */
function TurnDetails({ turn }: { turn: TurnInfo }) {
  const notable = turn.rejected.filter((r) => r.kind !== "ignored");
  const modeLabel = { llm: "Model", mock: "Demo mock", fallback: "Fallback (model failed)" }[turn.meta.mode];
  return (
    <details className="rounded-2xl border border-lilac/60 bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">
        Last turn: {turn.applied.length} applied
        {notable.length > 0 && <span className="text-amber">, {notable.length} rejected</span>}
      </summary>
      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="font-semibold">Answered by</dt>
          <dd className="font-mono">
            {modeLabel}
            {turn.meta.provider ? ` · ${turn.meta.provider}` : ""} · {turn.meta.attempts} attempt{turn.meta.attempts === 1 ? "" : "s"}
          </dd>
        </div>
        {turn.applied.length > 0 && (
          <div>
            <dt className="font-semibold">Applied</dt>
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
            <dt className="font-semibold text-amber">Rejected by validation</dt>
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
