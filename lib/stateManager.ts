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

export function applyUpdates(state: IntakeState, updates: FieldUpdate[]): ApplyResult {
  const rejected: RejectedUpdate[] = [];

  // 1. Validate each update's value against its field's schema.
  const valid: { update: FieldUpdate; value: FieldValue | null }[] = [];
  for (const update of updates) {
    if (update.value === null) {
      if (update.status === "unconfirmed") {
        rejected.push({ update, reason: "An unconfirmed update must carry a value" });
      } else {
        valid.push({ update, value: null });
      }
      continue;
    }
    const parsed = FIELD_VALUE_SCHEMAS[update.field].safeParse(update.value);
    if (!parsed.success) {
      rejected.push({
        update,
        reason: `Invalid value for ${update.field}: ${parsed.error.issues[0]?.message ?? "wrong type"}`,
      });
      continue;
    }
    valid.push({ update, value: parsed.data as FieldValue });
  }

  // 2. Merge, then check consistency. If this turn introduced a conflict, drop
  //    this turn's updates to the conflicting fields and keep the old values.
  let candidate = merge(state, valid);
  const conflicts = findConflicts(candidate.fields);

  if (conflicts.length > 0) {
    const conflicted = new Set(conflicts.flatMap((c) => c.fields));
    const [blocked, allowed] = partition(valid, (v) => conflicted.has(v.update.field));
    for (const b of blocked) {
      rejected.push({ update: b.update, reason: "Contradicts information already provided" });
    }
    candidate = merge(state, allowed);
    // Only reachable if the incoming state was already inconsistent; refuse the turn entirely.
    if (findConflicts(candidate.fields).length > 0) {
      for (const a of allowed) {
        rejected.push({ update: a.update, reason: "State is inconsistent; update not applied" });
      }
      candidate = state;
    }
  }

  const rejectedSet = new Set(rejected.map((r) => r.update));
  return {
    state: candidate,
    applied: updates.filter((u) => !rejectedSet.has(u)),
    rejected,
    conflicts,
  };
}

function merge(
  state: IntakeState,
  updates: { update: FieldUpdate; value: FieldValue | null }[],
): IntakeState {
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
      // A later confirmed answer simply overwrites: corrections need no special case.
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
      question: `I have a note that you don't have children, but you've also mentioned ${joinNames(names)}. Could you clarify whether you have children, and if so, their names?`,
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

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
