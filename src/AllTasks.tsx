import { useMemo, useState } from "react";
import { TaskCard } from "./TaskCard";
import { useApp } from "./store";
import type { TaskStatus } from "./types";

const FILTERS: { id: "all" | TaskStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unclaimed", label: "Open" },
  { id: "just_started", label: "Just started" },
  { id: "in_progress", label: "In progress" },
  { id: "complete", label: "Complete" },
];

export default function AllTasks({
  onAdd,
  onOpenTask,
}: {
  onAdd?: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { tasks, session, discardCompleted, personById } = useApp();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isLeader = session?.role === "leader";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((task) => {
        const assignee = personById(task.assigneeId)?.name.toLowerCase() ?? "";
        const matchesQuery =
          !q ||
          task.title.toLowerCase().includes(q) ||
          task.description.toLowerCase().includes(q) ||
          assignee.includes(q);
        const matchesFilter = filter === "all" || task.status === filter;
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        const rank = (task: (typeof tasks)[number]) =>
          task.status === "unclaimed" || !task.assigneeId ? 0 : 1;
        const byClaim = rank(a) - rank(b);
        if (byClaim !== 0) return byClaim;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [tasks, filter, query, personById]);

  const counts = {
    all: tasks.length,
    unclaimed: tasks.filter((task) => task.status === "unclaimed").length,
    just_started: tasks.filter((task) => task.status === "just_started").length,
    in_progress: tasks.filter((task) => task.status === "in_progress").length,
    complete: tasks.filter((task) => task.status === "complete").length,
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="page-kicker">{isLeader ? "Leader view" : "Master list"}</p>
          <h1>{isLeader ? "All tasks and status" : "Task board"}</h1>
        </div>
        {isLeader && (
          <div className="head-actions">
            <button
              className="btn ghost"
              onClick={() => setConfirmDiscard(true)}
              disabled={counts.complete === 0}
            >
              Discard completed
            </button>
            <button className="btn primary" onClick={onAdd}>
              Add a task
            </button>
          </div>
        )}
      </div>

      {isLeader && (
        <div className="stats">
          <div className="stat">
            <b>{counts.all}</b>
            <span>Total</span>
          </div>
          <div className="stat">
            <b>{counts.unclaimed}</b>
            <span>Open</span>
          </div>
          <div className="stat">
            <b>{counts.just_started + counts.in_progress}</b>
            <span>Active</span>
          </div>
          <div className="stat">
            <b>{counts.complete}</b>
            <span>Complete</span>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="chips">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              className={`chip ${filter === item.id ? "active" : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tasks or people"
        />
      </div>

      {confirmDiscard && isLeader && (
        <div className="overlay" onClick={() => setConfirmDiscard(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="page-kicker">Leaders only</p>
            <h2 style={{ fontSize: 28 }}>Discard completed tasks?</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              This removes {counts.complete} completed task
              {counts.complete === 1 ? "" : "s"} from the board. Open and in-progress
              work stays.
            </p>
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => setConfirmDiscard(false)}>
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
        {visible.length === 0 ? (
          <p className="empty">No tasks match this view.</p>
        ) : (
          visible.map((task) => (
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
