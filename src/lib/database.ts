import type { Person, Subtask, Task, TaskAttachment, TaskStatus } from "../types";

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee_ids?: string[] | string | null;
  /** @deprecated Legacy single-assignee column; mapped if assignee_ids is missing. */
  assignee_id?: string | null;
  assigned_by_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments?: TaskAttachment[] | null;
  subtasks?: Subtask[] | null;
}

export interface ProfileRow {
  id: string;
  email: string;
  name: string;
  role: "leader" | "intern";
  picture: string | null;
}

export interface RosterRow {
  email: string;
  name: string;
  role: "leader" | "intern";
}

export function mapRoster(row: RosterRow, picture?: string | null): Person {
  return {
    id: row.email,
    email: row.email,
    name: row.name,
    role: row.role,
    title: row.role === "leader" ? "Program Lead" : "Intern",
    picture: picture ?? undefined,
  };
}

function mapAttachments(raw: TaskRow["attachments"]): TaskAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is TaskAttachment =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      (item.kind === "link" || item.kind === "file") &&
      typeof item.label === "string" &&
      typeof item.url === "string",
  );
}

function mapSubtasks(raw: TaskRow["subtasks"]): Subtask[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Subtask =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        item.title.trim().length > 0,
    )
    .map((item) => ({
      id: item.id,
      title: item.title.trim(),
      done: Boolean(item.done),
    }));
}

export function mapTask(row: TaskRow): Task {
  const assigneeIds = parseAssigneeIds(row);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeIds,
    assignedById: row.assigned_by_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: mapAttachments(row.attachments),
    subtasks: mapSubtasks(row.subtasks),
  };
}

/** Normalize assignee_ids from jsonb / text[] / legacy assignee_id / postgres string form. */
function parseAssigneeIds(row: TaskRow): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  function push(value: unknown) {
    if (typeof value !== "string") return;
    const email = value.trim();
    if (!email || seen.has(email)) return;
    seen.add(email);
    out.push(email);
  }

  const raw = row.assignee_ids as unknown;
  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    // Postgres text[] string form: {a@x.com,b@y.com}
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1);
      if (inner) {
        for (const part of inner.split(",")) {
          push(part.replace(/^"|"$/g, ""));
        }
      }
    } else {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          for (const item of parsed) push(item);
        }
      } catch {
        push(trimmed);
      }
    }
  }

  if (out.length === 0 && row.assignee_id) {
    push(row.assignee_id);
  }

  return out;
}

export function mapProfile(row: ProfileRow): Person {
  return {
    id: row.email,
    email: row.email,
    name: row.name,
    role: row.role,
    title: row.role === "leader" ? "Program Lead" : "Intern",
    picture: row.picture ?? undefined,
  };
}

export function formatDbError(error: { message?: string } | Error | null | unknown) {
  if (!error) return "Something went wrong. Try again.";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return "Something went wrong. Try again.";
}
