import { FIELD_LABELS, type FieldKey, type FieldValue } from "./schema";

/** Human-readable statement of a field's value, for questions and the preview. */
export function describeFieldValue(field: FieldKey, value: FieldValue): string {
  switch (field) {
    case "has_children":
      return value ? "you have children" : "you don't have children";
    case "covers_worldwide_assets":
      return value
        ? "the document should cover your assets worldwide"
        : "the document should only cover assets in one country";
    case "children_names": {
      const names = value as string[];
      if (names.length === 0) return "you don't have children";
      return `you have ${names.length === 1 ? "a child" : "children"} named ${joinWithAnd(names)}`;
    }
    case "specific_gifts":
    case "additional_wishes": {
      const items = value as string[];
      const label = FIELD_LABELS[field].toLowerCase();
      return items.length === 0 ? `you have no ${label}` : `your ${label} are: ${items.join("; ")}`;
    }
    default:
      return `your ${FIELD_LABELS[field].toLowerCase()} is "${value}"`;
  }
}

export function formatValue(value: FieldValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  return value;
}

export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
