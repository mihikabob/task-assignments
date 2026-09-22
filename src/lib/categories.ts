import type { TaskCategory } from "../types";

export const TASK_CATEGORIES: { id: TaskCategory; label: string }[] = [
  { id: "technical", label: "Technical" },
  { id: "social_media", label: "Social media" },
  { id: "event_planning", label: "Event planning" },
  { id: "other", label: "Other" },
];

const ALLOWED = new Set<TaskCategory>(TASK_CATEGORIES.map((item) => item.id));

export function categoryLabel(id: TaskCategory): string {
  return TASK_CATEGORIES.find((item) => item.id === id)?.label ?? id;
}

export function normalizeCategories(raw: unknown): TaskCategory[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<TaskCategory>();
  const out: TaskCategory[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim() as TaskCategory;
    if (!ALLOWED.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
