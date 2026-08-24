import { useEffect, useMemo, useState } from "react";
import Avatar from "./Avatar";
import { interns as seedInterns } from "./data";
import type { Person } from "./types";
import { TaskCard } from "./TaskCard";
import { useApp } from "./store";

/** One row per person name; prefer school email when several exist. */
function uniqueInternsByName(roster: Person[]): Person[] {
  const byName = new Map<string, Person>();

  for (const person of roster) {
    if (person.role !== "intern") continue;
    const key = person.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, person);
      continue;
    }
    const preferNew =
      person.email.endsWith("@mvla.net") && !existing.email.endsWith("@mvla.net");
    if (preferNew) byName.set(key, person);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function ByIntern({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const { tasks, people, internRoster } = useApp();

  const displayInterns = useMemo(() => {
    // Always include seeded intern names, even if they have no tasks / aren't in live roster yet.
    return uniqueInternsByName([...seedInterns, ...internRoster, ...people]);
  }, [internRoster, people]);

  const [selectedId, setSelectedId] = useState(displayInterns[0]?.id ?? "");

  useEffect(() => {
    if (!displayInterns.some((intern) => intern.id === selectedId)) {
      setSelectedId(displayInterns[0]?.id ?? "");
    }
  }, [displayInterns, selectedId]);

  const selected =
    displayInterns.find((intern) => intern.id === selectedId) ?? displayInterns[0];

  const grouped = useMemo(
    () =>
      displayInterns.map((intern) => {
        const nameKey = intern.name.trim().toLowerCase();
        const emails = new Set(
          [...seedInterns, ...people, ...internRoster]
            .filter(
              (person) =>
                person.role === "intern" &&
                person.name.trim().toLowerCase() === nameKey,
            )
            .map((person) => person.id),
        );
        emails.add(intern.id);

        const assigned = tasks.filter(
          (task) => task.assigneeId && emails.has(task.assigneeId),
        );
        return {
          intern,
          assigned,
          complete: assigned.filter((task) => task.status === "complete").length,
        };
      }),
    [tasks, displayInterns, people, internRoster],
  );

  const selectedTasks = selected
    ? grouped.find((row) => row.intern.id === selected.id)?.assigned ?? []
    : [];

  if (!selected) {
    return (
      <section>
        <div className="page-head">
          <div>
            <p className="page-kicker">Leader view</p>
            <h1>Tasks by intern</h1>
            <p>No interns are on the roster yet.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="page-kicker">Leader view</p>
          <h1>Tasks by intern</h1>
        </div>
      </div>

      <div className="intern-grid">
        <div className="intern-list">
          {grouped.map(({ intern, assigned, complete }) => (
            <button
              key={intern.name}
              className={`intern-row ${intern.id === selected.id ? "active" : ""}`}
              onClick={() => setSelectedId(intern.id)}
            >
              <Avatar person={intern} size="sm" />
              <span>
                <strong style={{ display: "block" }}>{intern.name}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {intern.email}
                </span>
              </span>
              <span className="counts">
                {complete}/{assigned.length}
              </span>
            </button>
          ))}
        </div>

        <div className="panel">
          <div className="page-head" style={{ marginBottom: 16 }}>
            <div>
              <p className="page-kicker">{selected.email}</p>
              <h2 style={{ fontSize: 26 }}>{selected.name}</h2>
              <p>
                {selectedTasks.length === 0
                  ? "No tasks assigned yet."
                  : `${selectedTasks.length} assigned task${selectedTasks.length === 1 ? "" : "s"}.`}
              </p>
            </div>
          </div>
          <div className="task-list">
            {selectedTasks.length === 0 ? (
              <p className="empty">This intern does not have any tasks yet.</p>
            ) : (
              selectedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  showAssign
                  showDescription={false}
                  onOpen={() => onOpenTask(task.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
