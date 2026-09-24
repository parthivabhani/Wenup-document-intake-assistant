import { describe, expect, it } from "vitest";
import { applyUpdates, isComplete, missingFields } from "@/lib/stateManager";
import { emptyState, type FieldUpdate, type IntakeState } from "@/lib/schema";

const set = (field: FieldUpdate["field"], value: FieldUpdate["value"]): FieldUpdate => ({
  field,
  value,
  status: "confirmed",
  note: null,
});

function stateWith(updates: FieldUpdate[]): IntakeState {
  return applyUpdates(emptyState(), updates).state;
}

describe("applyUpdates: valid and partial updates", () => {
  it("applies several fields from one message and leaves the rest unknown", () => {
    const { state, applied, rejected } = applyUpdates(emptyState(), [
      set("full_name", "Jane Smith"),
      set("executor.name", "James"),
      set("executor.relationship", "brother"),
    ]);
    expect(applied).toHaveLength(3);
    expect(rejected).toHaveLength(0);
    expect(state.fields.full_name).toBe("Jane Smith");
    expect(state.fields.executor).toEqual({ name: "James", relationship: "brother" });
    expect(state.fields.home_address).toBeNull();
  });

  it("does not mutate the input state", () => {
    const before = emptyState();
    applyUpdates(before, [set("full_name", "Jane Smith")]);
    expect(before).toEqual(emptyState());
  });

  it("trims whitespace from values", () => {
    const state = stateWith([set("full_name", "  Jane Smith  ")]);
    expect(state.fields.full_name).toBe("Jane Smith");
  });

  it("an empty update list changes nothing", () => {
    const s = stateWith([set("full_name", "Jane")]);
    expect(applyUpdates(s, []).state).toEqual(s);
  });
});

describe("applyUpdates: corrections", () => {
  it("a later answer overwrites an earlier one", () => {
    const s1 = stateWith([set("executor.name", "James")]);
    const { state } = applyUpdates(s1, [set("executor.name", "Sarah")]);
    expect(state.fields.executor.name).toBe("Sarah");
  });

  it("null clears a field back to unknown", () => {
    const s1 = stateWith([set("home_address", "1 High Street")]);
    const { state } = applyUpdates(s1, [set("home_address", null)]);
    expect(state.fields.home_address).toBeNull();
  });

  it("correcting 'no children' to 'yes' with names is accepted", () => {
    const s1 = stateWith([set("has_children", false)]);
    expect(s1.fields.children_names).toEqual([]);
    const { state, conflicts } = applyUpdates(s1, [
      set("has_children", true),
      set("children_names", ["Tom", "Sue"]),
    ]);
    expect(conflicts).toHaveLength(0);
    expect(state.fields.has_children).toBe(true);
    expect(state.fields.children_names).toEqual(["Tom", "Sue"]);
  });

  it("switching to 'has children' without names resets the list to unknown", () => {
    const s1 = stateWith([set("has_children", false)]);
    const { state } = applyUpdates(s1, [set("has_children", true)]);
    expect(state.fields.children_names).toBeNull();
  });
});

describe("applyUpdates: validation rejects bad values without crashing", () => {
  it.each([
    ["boolean field given a string", set("has_children", "yes")],
    ["string field given a boolean", set("full_name", true)],
    ["list field given a string", set("children_names", "Tom")],
    ["empty string", set("full_name", "   ")],
    ["over-long value", set("home_address", "x".repeat(501))],
  ])("rejects %s", (_label, update) => {
    const { state, applied, rejected } = applyUpdates(emptyState(), [update]);
    expect(applied).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(state).toEqual(emptyState());
  });

  it("keeps valid updates when one in the same turn is invalid", () => {
    const { state, applied, rejected } = applyUpdates(emptyState(), [
      set("full_name", "Jane Smith"),
      set("has_children", "maybe"),
    ]);
    expect(applied.map((u) => u.field)).toEqual(["full_name"]);
    expect(rejected.map((r) => r.update.field)).toEqual(["has_children"]);
    expect(state.fields.full_name).toBe("Jane Smith");
    expect(state.fields.has_children).toBeNull();
  });
});

describe("applyUpdates: unconfirmed values", () => {
  it("holds an ambiguous value aside instead of applying it", () => {
    const { state } = applyUpdates(emptyState(), [
      { field: "executor.name", value: "James", status: "unconfirmed", note: "User said 'maybe James'" },
    ]);
    expect(state.fields.executor.name).toBeNull();
    expect(state.unconfirmed).toEqual([
      { field: "executor.name", value: "James", note: "User said 'maybe James'" },
    ]);
  });

  it("confirming the field clears the pending entry", () => {
    const s1 = applyUpdates(emptyState(), [
      { field: "executor.name", value: "James", status: "unconfirmed", note: "unsure" },
    ]).state;
    const { state } = applyUpdates(s1, [set("executor.name", "James")]);
    expect(state.fields.executor.name).toBe("James");
    expect(state.unconfirmed).toEqual([]);
  });

  it("rejects an unconfirmed update with no value", () => {
    const { rejected } = applyUpdates(emptyState(), [
      { field: "full_name", value: null, status: "unconfirmed", note: null },
    ]);
    expect(rejected).toHaveLength(1);
  });
});

describe("applyUpdates: derived facts and contradictions", () => {
  it("naming children implies has_children = true", () => {
    const state = stateWith([set("children_names", ["Tom"])]);
    expect(state.fields.has_children).toBe(true);
  });

  it("has_children = false means children_names is 'none', not unknown", () => {
    const state = stateWith([set("has_children", false)]);
    expect(state.fields.children_names).toEqual([]);
  });

  it("naming children after saying 'no children' is a conflict: rejected, and a question is raised", () => {
    const s1 = stateWith([set("has_children", false)]);
    const { state, conflicts, rejected } = applyUpdates(s1, [
      set("children_names", ["Tom"]),
      set("full_name", "Jane Smith"),
    ]);
    // Contradicting update is blocked; the unrelated one still lands.
    expect(state.fields.has_children).toBe(false);
    expect(state.fields.children_names).toEqual([]);
    expect(state.fields.full_name).toBe("Jane Smith");
    expect(rejected.map((r) => r.update.field)).toEqual(["children_names"]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].question).toMatch(/Tom/);
  });

  it("saying 'no children' while children are recorded is a conflict", () => {
    const s1 = stateWith([set("children_names", ["Tom", "Sue"])]);
    const { state, conflicts } = applyUpdates(s1, [set("has_children", false)]);
    expect(state.fields.has_children).toBe(true);
    expect(state.fields.children_names).toEqual(["Tom", "Sue"]);
    expect(conflicts[0].question).toMatch(/Tom and Sue/);
  });
});

describe("progress", () => {
  it("lists missing fields in interview order", () => {
    const state = stateWith([set("full_name", "Jane")]);
    expect(missingFields(state)[0]).toBe("home_address");
  });

  it("children_names is not required when the user has no children", () => {
    const state = stateWith([set("has_children", false)]);
    expect(missingFields(state)).not.toContain("children_names");
  });

  it("is complete only when every field is known and nothing is unconfirmed", () => {
    const full = stateWith([
      set("full_name", "Jane Smith"),
      set("home_address", "1 High Street, London"),
      set("covers_worldwide_assets", true),
      set("has_children", false),
      set("executor.name", "James Smith"),
      set("executor.relationship", "brother"),
      set("specific_gifts", []),
      set("additional_wishes", []),
    ]);
    expect(isComplete(full)).toBe(true);
    const pending = applyUpdates(full, [
      { field: "home_address", value: "2 Low Road", status: "unconfirmed", note: "moving?" },
    ]).state;
    expect(isComplete(pending)).toBe(false);
  });
});
