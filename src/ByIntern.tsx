import { useMemo, useState } from "react";
import Avatar from "./Avatar";
import { TaskCard } from "./TaskCard";
import { useApp } from "./store";

export default function ByIntern({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const { tasks, internRoster } = useApp();
  const [selectedId, setSelectedId] = useState(internRoster[0]?.id ?? "");
  const selected =
    internRoster.find((intern) => intern.id === selectedId) ?? internRoster[0];

  const grouped = useMemo(
    () =>
      internRoster.map((intern) => {
        const assigned = tasks.filter((task) => task.assigneeId === intern.id);
        return {
          intern,
          assigned,
          complete: assigned.filter((task) => task.status === "complete").length,
        };
      }),
    [tasks, internRoster],
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
              key={intern.id}
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
                {complete}/{assigned.length || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="panel">
          <div className="page-head" style={{ marginBottom: 16 }}>
            <div>
              <p className="page-kicker">{selected.email}</p>
              <h2 style={{ fontSize: 26 }}>{selected.name}</h2>
            </div>
          </div>
          <div className="task-list">
            {selectedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                showAssign
                showDescription={false}
                onOpen={() => onOpenTask(task.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
