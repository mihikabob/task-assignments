import type { Person, Task, TaskStatus } from "../types";

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee_id: string | null;
  assigned_by_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
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

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeId: row.assignee_id,
    assignedById: row.assigned_by_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

export function formatDbError(error: { message?: string } | null) {
  return error?.message ?? "Something went wrong. Try again.";
}
