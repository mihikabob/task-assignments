export type Role = "leader" | "intern";

export type TaskStatus = "unclaimed" | "just_started" | "in_progress" | "complete";

export type AttachmentKind = "link" | "file";

export interface TaskAttachment {
  id: string;
  kind: AttachmentKind;
  label: string;
  url: string;
  path?: string;
  mime?: string;
  size?: number;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

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
  assigneeIds: string[];
  assignedById: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  attachments: TaskAttachment[];
  subtasks: Subtask[];
}

export interface Session {
  userId: string;
  role: Role;
}

export type Page = "all-tasks" | "my-tasks" | "by-intern";
