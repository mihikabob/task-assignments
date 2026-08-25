import { useEffect, useMemo, useState } from "react";
import Avatar from "./Avatar";
import { displayEmail, interns as seedInterns, uniquePeopleByName } from "./data";
import { TaskCard } from "./TaskCard";
import { useApp } from "./store";

export default function ByIntern({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const { tasks, people, internRoster } = useApp();

  const displayInterns = useMemo(
    () =>
      uniquePeopleByName(
        [...internRoster, ...people].filter((person) => person.role === "intern"),
        seedInterns,
      ),
    [internRoster, people],
  );

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
        const ids = new Set(
          [...seedInterns, ...people, ...internRoster]
            .filter(
              (person) =>
                person.role === "intern" && person.name.trim().toLowerCase() === nameKey,
            )
            .map((person) => person.id),
        );
        ids.add(intern.id);

        const assigned = tasks.filter(
          (task) => task.assigneeId && ids.has(task.assigneeId),
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
  const selectedEmail = selected ? displayEmail(selected.email) : null;

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
          {grouped.map(({ intern, assigned, complete }) => {
            const email = displayEmail(intern.email);
            return (
              <button
                key={intern.name}
                className={`intern-row ${intern.id === selected.id ? "active" : ""}`}
                onClick={() => setSelectedId(intern.id)}
              >
                <Avatar person={intern} size="sm" />
                <span>
                  <strong style={{ display: "block" }}>{intern.name}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {email ?? "Password login"}
                  </span>
                </span>
                <span className="counts">
                  {complete}/{assigned.length}
                </span>
              </button>
            );
          })}
        </div>

        <div className="panel">
          <div className="page-head" style={{ marginBottom: 16 }}>
            <div>
              {selectedEmail && <p className="page-kicker">{selectedEmail}</p>}
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
