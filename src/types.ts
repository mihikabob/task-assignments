export type Role = "leader" | "intern";

export type TaskStatus = "unclaimed" | "just_started" | "in_progress" | "complete";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  picture?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string | null;
  assignedById: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  userId: string;
  role: Role;
}

export type Page = "all-tasks" | "my-tasks" | "by-intern";
