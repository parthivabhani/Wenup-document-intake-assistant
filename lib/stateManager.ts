import {
  FIELD_KEYS,
  FIELD_VALUE_SCHEMAS,
  type FieldKey,
  type FieldUpdate,
  type FieldValue,
  type IntakeFields,
  type IntakeState,
  type RejectedUpdate,
} from "./schema";
import { CONFLICT_QUESTION_MARKER } from "./userSignals";
import { describeFieldValue, joinWithAnd } from "./format";

/**
 * The only code allowed to change IntakeState. Every proposed update (from the
 * LLM, the mock, or anywhere else) is validated here before it touches state,
 * and deterministic consistency rules run afterwards as a safety net that
 * doesn't depend on the model behaving.
 */

export type Conflict = {
  fields: FieldKey[];
  /** A follow-up question to put to the user. */
  question: string;
};

export type ApplyResult = {
  state: IntakeState;
  applied: FieldUpdate[];
  rejected: RejectedUpdate[];
  conflicts: Conflict[];
};

// ---------------------------------------------------------------------------
// Field access helpers (flat key <-> nested object)
// ---------------------------------------------------------------------------

export function getField(fields: IntakeFields, key: FieldKey): FieldValue | null {
  switch (key) {
    case "executor.name":
      return fields.executor.name;
    case "executor.relationship":
      return fields.executor.relationship;
    default:
      return fields[key];
  }
}

function setField(fields: IntakeFields, key: FieldKey, value: FieldValue | null): IntakeFields {
  switch (key) {
    case "executor.name":
      return { ...fields, executor: { ...fields.executor, name: value as string | null } };
    case "executor.relationship":
      return { ...fields, executor: { ...fields.executor, relationship: value as string | null } };
    default:
      return { ...fields, [key]: value };
  }
}

// ---------------------------------------------------------------------------
// Applying updates
// ---------------------------------------------------------------------------

export type ApplyOptions = {
  /**
   * Whether the user's own message shows they're correcting an earlier answer
   * (see lib/userSignals.ts). Without it, the model's is_correction flag is
   * ignored. Defaults to false: the safe choice is to ask.
   */
  userSignalledCorrection?: boolean;
};

export function applyUpdates(
  state: IntakeState,
  updates: FieldUpdate[],
  { userSignalledCorrection = false }: ApplyOptions = {},
): ApplyResult {
  const rejected: RejectedUpdate[] = [];

  // 1. Validate each update's value against its field's schema.
  const valid: ValidUpdate[] = [];
  for (const update of updates) {
    if (update.value === null) {
      if (update.status === "unconfirmed") {
        // "Unsure, and no candidate value": nothing to hold, nothing to change.
        rejected.push({ update, kind: "ignored", reason: "Unconfirmed update with no value" });
      } else {
        valid.push({ update, value: null });
      }
      continue;
    }
    const parsed = FIELD_VALUE_SCHEMAS[update.field].safeParse(update.value);
    if (!parsed.success) {
      rejected.push({
        update,
        kind: "invalid",
        reason: `Invalid value for ${update.field}: ${parsed.error.issues[0]?.message ?? "wrong type"}`,
      });
      continue;
    }
    valid.push({ update, value: parsed.data as FieldValue });
  }

  // 2. Overwrite guard: a known value may only be replaced by something
  //    different when the model flags an explicit correction AND the user's
  //    words back that up. Otherwise it's a contradiction: ask, don't guess.
  const overwrite = findOverwriteConflicts(state, valid, userSignalledCorrection);
  for (const v of overwrite.blocked) {
    rejected.push({ update: v.update, kind: "conflict", reason: "Changes a known value without an explicit correction" });
  }
  const accepted = valid.filter((v) => !overwrite.blocked.includes(v));

  // 3. The executor's name and relationship describe one person. If a correction
  //    replaces one with a genuinely different value and the other isn't restated,
  //    the other is stale ("James" + "mother"), so it's reset to unknown and asked for.
  const stale = staleExecutorCompanions(state, accepted);
  const unblocked = [...accepted, ...stale];

  // 4. Merge, then check cross-field consistency. If this turn introduced an
  //    inconsistency, drop its updates to the conflicting fields.
  let candidate = merge(state, unblocked);
  const consistency = findConflicts(candidate.fields);

  if (consistency.length > 0) {
    const conflicted = new Set(consistency.flatMap((c) => c.fields));
    const [blocked, allowed] = partition(unblocked, (v) => conflicted.has(v.update.field));
    for (const b of blocked) {
      rejected.push({ update: b.update, kind: "conflict", reason: "Contradicts information already provided" });
    }
    candidate = merge(state, allowed);
    // Only reachable if the incoming state was already inconsistent; refuse the turn entirely.
    if (findConflicts(candidate.fields).length > 0) {
      for (const a of allowed) {
        rejected.push({ update: a.update, kind: "conflict", reason: "State is inconsistent; update not applied" });
      }
      candidate = state;
    }
  }

  const rejectedSet = new Set(rejected.map((r) => r.update));
  return {
    state: candidate,
    applied: [...updates, ...stale.map((s) => s.update)].filter((u) => !rejectedSet.has(u)),
    rejected,
    conflicts: [...overwrite.conflicts, ...consistency],
  };
}

type ValidUpdate = { update: FieldUpdate; value: FieldValue | null };

const EXECUTOR_PAIR: Partial<Record<FieldKey, FieldKey>> = {
  "executor.name": "executor.relationship",
  "executor.relationship": "executor.name",
};

function staleExecutorCompanions(state: IntakeState, updates: ValidUpdate[]): ValidUpdate[] {
  const touched = new Set(updates.map((u) => u.update.field));
  const cleared: ValidUpdate[] = [];
  for (const { update, value } of updates) {
    const companion = EXECUTOR_PAIR[update.field];
    if (!companion || update.status !== "confirmed" || value === null) continue;
    const current = getField(state.fields, update.field);
    if (current === null || isCompatibleChange(current, value)) continue; // first answer or refinement
    if (touched.has(companion) || getField(state.fields, companion) === null) continue;
    touched.add(companion);
    cleared.push({
      update: { field: companion, value: null, status: "confirmed", is_correction: true, note: "Cleared: the executor changed" },
      value: null,
    });
  }
  return cleared;
}

function findOverwriteConflicts(
  state: IntakeState,
  updates: ValidUpdate[],
  correctionsAllowed: boolean,
): { blocked: ValidUpdate[]; conflicts: Conflict[] } {
  const blocked: ValidUpdate[] = [];
  const conflicts: Conflict[] = [];

  for (const v of updates) {
    const { field, status, is_correction } = v.update;
    const current = getField(state.fields, field);
    if (status !== "confirmed" || v.value === null || current === null) continue;
    if (is_correction && correctionsAllowed) continue;
    if (isCompatibleChange(current, v.value)) continue;
    blocked.push(v);
    conflicts.push({
      fields: [field],
      question: `Earlier you told me ${describeFieldValue(field, current)}, but now it sounds like ${describeFieldValue(field, v.value)}. ${CONFLICT_QUESTION_MARKER}`,
    });
  }

  // "has children" and "children's names" describe the same fact: ask one question, the more specific one.
  const names = conflicts.find((c) => c.fields[0] === "children_names");
  const hasChildren = conflicts.find((c) => c.fields[0] === "has_children");
  if (names && hasChildren) {
    names.fields.push("has_children");
    conflicts.splice(conflicts.indexOf(hasChildren), 1);
  }
  return { blocked, conflicts };
}

/**
 * Changes that don't contradict the old value: identical, a refinement of a
 * string ("James" -> "James Smith"), or adding to a non-empty list.
 */
function isCompatibleChange(current: FieldValue, next: FieldValue): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  if (typeof current === "string" && typeof next === "string") {
    return norm(next).includes(norm(current));
  }
  if (Array.isArray(current) && Array.isArray(next)) {
    if (current.length === 0) return next.length === 0;
    return current.every((c) => next.some((n) => norm(n).includes(norm(c))));
  }
  return current === next;
}

function merge(state: IntakeState, updates: ValidUpdate[]): IntakeState {
  let fields = state.fields;
  let unconfirmed = state.unconfirmed;

  for (const { update, value } of updates) {
    // Any newer statement about a field replaces an older unconfirmed guess.
    unconfirmed = unconfirmed.filter((u) => u.field !== update.field);

    if (update.status === "unconfirmed" && value !== null) {
      unconfirmed = [
        ...unconfirmed,
        { field: update.field, value, note: update.note ?? "Needs confirmation" },
      ];
    } else {
      // Overwrites reaching this point were already vetted by the guard in applyUpdates.
      fields = setField(fields, update.field, value);
    }
  }

  return { fields: deriveFields(fields), unconfirmed };
}

/**
 * Facts that follow directly from what the user said (not guesses):
 *   - naming children means the user has children
 *   - no children means the children list is "none", not "unknown"
 *   - having children makes a previous "none" list meaningless, so it resets to unknown
 */
function deriveFields(fields: IntakeFields): IntakeFields {
  const names = fields.children_names;
  if (fields.has_children === null && names && names.length > 0) {
    return { ...fields, has_children: true };
  }
  if (fields.has_children === false && names === null) {
    return { ...fields, children_names: [] };
  }
  if (fields.has_children === true && names && names.length === 0) {
    return { ...fields, children_names: null };
  }
  return fields;
}

export function findConflicts(fields: IntakeFields): Conflict[] {
  const conflicts: Conflict[] = [];
  const names = fields.children_names;
  if (fields.has_children === false && names && names.length > 0) {
    conflicts.push({
      fields: ["has_children", "children_names"],
      question: `I have a note that you don't have children, but you've also mentioned ${joinWithAnd(names)} as your children. ${CONFLICT_QUESTION_MARKER}`,
    });
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** Fields still unknown, in interview order. */
export function missingFields(state: IntakeState): FieldKey[] {
  return FIELD_KEYS.filter((key) => getField(state.fields, key) === null);
}

export function isComplete(state: IntakeState): boolean {
  return missingFields(state).length === 0 && state.unconfirmed.length === 0;
}

// ---------------------------------------------------------------------------

function partition<T>(items: T[], pred: (item: T) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  for (const item of items) (pred(item) ? yes : no).push(item);
  return [yes, no];
}
