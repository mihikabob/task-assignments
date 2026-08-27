import type { Person, Task } from "../types";

/** Whether a person is on the task assignee list (by email or same full name). */
export function taskIncludesPerson(
  task: Task,
  person: Person | null | undefined,
  personById: (id: string | null) => Person | undefined,
): boolean {
  if (!person || task.assigneeIds.length === 0) return false;
  if (task.assigneeIds.includes(person.id)) return true;

  const nameKey = person.name.trim().toLowerCase();
  return task.assigneeIds.some((id) => {
    const assignee = personById(id);
    return assignee?.name.trim().toLowerCase() === nameKey;
  });
}

export function formatAssigneeNames(
  assigneeIds: string[],
  personById: (id: string | null) => Person | undefined,
): string {
  const names = assigneeIds
    .map((id) => personById(id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : "Unclaimed";
}
