import { useMemo, useState } from "react";
import { TaskCard } from "./TaskCard";
import { useApp } from "./store";

export default function CompletedTasks({
  onOpenTask,
}: {
  onOpenTask: (taskId: string) => void;
}) {
  const { tasks, session, discardCompleted, personById } = useApp();
  const [query, setQuery] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isLeader = session?.role === "leader";

  const completed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((task) => task.status === "complete")
      .filter((task) => {
        if (!q) return true;
        const assigneeNames = task.assigneeIds
          .map((id) => personById(id)?.name.toLowerCase() ?? "")
          .join(" ");
        return (
          task.title.toLowerCase().includes(q) ||
          task.description.toLowerCase().includes(q) ||
          assigneeNames.includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [tasks, query, personById]);

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="page-kicker">{isLeader ? "Leader view" : "Archive"}</p>
          <h1>Completed projects</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Tasks marked complete move here from the main board.
          </p>
        </div>
        {isLeader && (
          <div className="head-actions">
            <button
              className="btn ghost"
              onClick={() => setConfirmDiscard(true)}
              disabled={completed.length === 0}
            >
              Discard completed
            </button>
          </div>
        )}
      </div>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search completed projects"
        />
      </div>

      {confirmDiscard && isLeader && (
        <div className="overlay" onClick={() => setConfirmDiscard(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="page-kicker">Leaders only</p>
            <h2 style={{ fontSize: 28 }}>Discard completed tasks?</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              This removes {completed.length} completed task
              {completed.length === 1 ? "" : "s"} from the board permanently.
            </p>
            <div className="actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => setConfirmDiscard(false)}
              >
                Keep them
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  void discardCompleted();
                  setConfirmDiscard(false);
                }}
              >
                Discard completed
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="task-list">
        {completed.length === 0 ? (
          <div className="panel">
            <p className="empty">No completed projects yet.</p>
          </div>
        ) : (
          completed.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showAssign={isLeader}
              showDescription={false}
              onOpen={() => onOpenTask(task.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
