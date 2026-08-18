import { useState } from "react";
import Avatar from "./Avatar";
import type { Task, TaskStatus } from "./types";
import { useApp, useCurrentUser } from "./store";

const STATUS_LABEL: Record<TaskStatus, string> = {
  unclaimed: "Open",
  just_started: "Just started",
  in_progress: "In progress",
  complete: "Complete",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge ${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function TaskCard({
  task,
  showAssign,
  showDescription = true,
  onOpen,
}: {
  task: Task;
  showAssign?: boolean;
  showDescription?: boolean;
  onOpen?: () => void;
}) {
  const { claimTask, assignTask, updateStatus, deleteTask, assignableRoster, personById } = useApp();
  const user = useCurrentUser();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const assignee = personById(task.assigneeId);
  const assigner = personById(task.assignedById);
  const isAssignee = user?.id === task.assigneeId;
  const canUpdate = Boolean(isAssignee);
  const canClaim = user?.role === "intern" && !task.assigneeId;
  const isLeader = user?.role === "leader";
  const isComplete = task.status === "complete";
  const removeLabel = isComplete ? "Discard" : "Delete";
  const showAssignedBy =
    user?.role === "intern" && isAssignee && Boolean(assigner);

  return (
    <article className="task-card">
      <div className="task-top">
        <div>
          <h3>
            {onOpen ? (
              <button type="button" className="task-title-btn" onClick={onOpen}>
                {task.title}
              </button>
            ) : (
              task.title
            )}
            {showAssignedBy ? ` - assigned by ${assigner?.name}` : ""}
          </h3>
        </div>
        <StatusBadge status={task.status} />
      </div>

      {showDescription &&
        (task.description.trim() ? (
          <p className="task-description">{task.description}</p>
        ) : (
          <p className="muted">No description yet.</p>
        ))}

      <div className="task-meta">
        {assignee ? (
          <div className="assignee">
            <Avatar person={assignee} size="sm" />
            {assignee.name}
          </div>
        ) : (
          <span className="muted">Unclaimed</span>
        )}

        {canClaim && (
          <button
            className="btn claim sm"
            onClick={() => {
              void claimTask(task.id);
            }}
          >
            Claim this task
          </button>
        )}

        {showAssign && user?.role === "leader" && (
          <select
            className="select"
            value={task.assigneeId ?? ""}
            onChange={(event) => {
              void assignTask(task.id, event.target.value || null);
            }}
          >
            <option value="">Unassigned</option>
            {assignableRoster.map((person) => (
              <option key={person.id} value={person.id}>
                Assign to {person.name}
                {person.role === "leader" ? " (leader)" : ""}
              </option>
            ))}
          </select>
        )}

        {canUpdate && task.assigneeId && (
          <div className="seg" aria-label="Update progress">
            {(["just_started", "in_progress", "complete"] as TaskStatus[]).map((status) => (
              <button
                key={status}
                className={task.status === status ? "active" : ""}
                onClick={() => {
                  void updateStatus(task.id, status);
                }}
              >
                {STATUS_LABEL[status]}
              </button>
            ))}
          </div>
        )}

        {isLeader && (
          <div className="task-actions">
            {confirmRemove ? (
              <>
                <span className="muted">{isComplete ? "Discard this completed task?" : "Delete this task?"}</span>
                <button className="btn ghost sm" onClick={() => setConfirmRemove(false)}>
                  Keep
                </button>
                <button
                  className="btn danger sm"
                  onClick={() => {
                    void deleteTask(task.id);
                  }}
                >
                  {removeLabel}
                </button>
              </>
            ) : (
              <button className="btn ghost sm" onClick={() => setConfirmRemove(true)}>
                {removeLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
