import { useMemo, useState } from "react";
import { TaskCard } from "./TaskCard";
import { useApp } from "./store";
import type { TaskStatus } from "./types";

const FILTERS: { id: "all" | Exclude<TaskStatus, "complete">; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unclaimed", label: "Open" },
  { id: "just_started", label: "Just started" },
  { id: "in_progress", label: "In progress" },
];

export default function AllTasks({
  onAdd,
  onOpenTask,
}: {
  onAdd?: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { tasks, session, personById } = useApp();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const isLeader = session?.role === "leader";

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "complete"),
    [tasks],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeTasks
      .filter((task) => {
        const assigneeNames = task.assigneeIds
          .map((id) => personById(id)?.name.toLowerCase() ?? "")
          .join(" ");
        const matchesQuery =
          !q ||
          task.title.toLowerCase().includes(q) ||
          task.description.toLowerCase().includes(q) ||
          assigneeNames.includes(q);
        const matchesFilter = filter === "all" || task.status === filter;
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        const rank = (task: (typeof tasks)[number]) =>
          task.status === "unclaimed" || task.assigneeIds.length === 0 ? 0 : 1;
        const byClaim = rank(a) - rank(b);
        if (byClaim !== 0) return byClaim;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [activeTasks, filter, query, personById, tasks]);

  const counts = {
    all: activeTasks.length,
    unclaimed: activeTasks.filter((task) => task.status === "unclaimed").length,
    just_started: activeTasks.filter((task) => task.status === "just_started").length,
    in_progress: activeTasks.filter((task) => task.status === "in_progress").length,
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
            <span>Active</span>
          </div>
          <div className="stat">
            <b>{counts.unclaimed}</b>
            <span>Open</span>
          </div>
          <div className="stat">
            <b>{counts.just_started + counts.in_progress}</b>
            <span>In motion</span>
          </div>
          <div className="stat">
            <b>{counts.complete}</b>
            <span>Completed</span>
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
