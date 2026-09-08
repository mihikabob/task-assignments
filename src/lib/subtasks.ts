import type { Subtask } from "../types";

export type EditableSubtask = {
  id: string;
  title: string;
  done: boolean;
};

export function newSubtaskId() {
  return crypto.randomUUID();
}

export function blankSubtask(done = false): EditableSubtask {
  return { id: newSubtaskId(), title: "", done };
}

export function fromSubtasks(subtasks: Subtask[]): EditableSubtask[] {
  return subtasks.map((item) => ({
    id: item.id,
    title: item.title,
    done: item.done,
  }));
}

export function toSubtasksPayload(items: EditableSubtask[]): Subtask[] {
  return items
    .map((item) => ({
      id: item.id || newSubtaskId(),
      title: item.title.trim(),
      done: Boolean(item.done),
    }))
    .filter((item) => item.title.length > 0);
}
