import { useEffect, useMemo, useState } from "react";
import Avatar from "./Avatar";
import EditTaskModal from "./EditTaskModal";
import { formatAssigneeNames, taskIncludesPerson } from "./lib/taskAssignees";
import PartnerPicker from "./PartnerPicker";
import TaskAssignField from "./TaskAssignField";
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
  const { claimTask, assignTask, setPartners, setSubtaskDone, updateStatus, deleteTask, assignableRoster, personById } =
    useApp();
  const user = useCurrentUser();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [subtaskBusyId, setSubtaskBusyId] = useState<string | null>(null);
  const [showEditTask, setShowEditTask] = useState(false);
  const [multiplePeople, setMultiplePeople] = useState(task.assigneeIds.length > 1);
  const [showPartnerPicker, setShowPartnerPicker] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [confirmLeaveTask, setConfirmLeaveTask] = useState(false);
  const [pendingPartnerIds, setPendingPartnerIds] = useState<string[] | null>(null);

  const assignees = useMemo(
    () =>
      task.assigneeIds
        .map((id) => personById(id))
        .filter((person): person is NonNullable<typeof person> => Boolean(person)),
    [task.assigneeIds, personById],
  );
  const isAssignee = taskIncludesPerson(task, user, personById);
  const canUpdate = Boolean(isAssignee);
  const canClaim = user?.role === "intern" && task.assigneeIds.length === 0;
  const isLeader = user?.role === "leader";
  const isComplete = task.status === "complete";
  const canAddPartners = isAssignee && !isComplete && user?.role === "intern";
  const removeLabel = isComplete ? "Discard" : "Delete";

  const rosterAssigneeIds = useMemo(() => {
    return task.assigneeIds.map((id) => {
      if (assignableRoster.some((person) => person.id === id)) return id;
      const person = personById(id);
      if (!person) return id;
      const match = assignableRoster.find(
        (entry) => entry.name.trim().toLowerCase() === person.name.trim().toLowerCase(),
      );
      return match?.id ?? id;
    });
  }, [task.assigneeIds, assignableRoster, personById]);

  const assignSelectValue = useMemo(() => {
    if (task.assigneeIds.length !== 1) return "";
    const id = task.assigneeIds[0];
    if (assignableRoster.some((person) => person.id === id)) return id;
    const person = personById(id);
    if (!person) return id;
    const match = assignableRoster.find(
      (entry) => entry.name.trim().toLowerCase() === person.name.trim().toLowerCase(),
    );
    return match?.id ?? id;
  }, [task.assigneeIds, assignableRoster, personById]);

  useEffect(() => {
    setAssignError("");
    if (task.assigneeIds.length > 1) setMultiplePeople(true);
  }, [task.id, task.assigneeIds.length]);

  useEffect(() => {
    if (!showPartnerPicker) {
      setConfirmLeaveTask(false);
      setPendingPartnerIds(null);
    }
  }, [showPartnerPicker]);

  async function runAssign(ids: string[], multi: boolean) {
    setAssigning(true);
    setAssignError("");
    const message = await assignTask(task.id, ids, multi);
    if (message) setAssignError(message);
    setAssigning(false);
  }

  const selfRosterId = useMemo(() => {
    if (!user) return "";
    if (assignableRoster.some((person) => person.id === user.id)) return user.id;
    const match = assignableRoster.find(
      (entry) => entry.name.trim().toLowerCase() === user.name.trim().toLowerCase(),
    );
    return match?.id ?? user.id;
  }, [user, assignableRoster]);

  async function applyPartnersChange(ids: string[]) {
    setAssigning(true);
    setAssignError("");
    const message = await setPartners(task.id, ids);
    if (message) setAssignError(message);
    setAssigning(false);
  }

  function handlePartnersChange(ids: string[]) {
    const removingSelf =
      selfRosterId &&
      rosterAssigneeIds.includes(selfRosterId) &&
      !ids.includes(selfRosterId);

    if (removingSelf) {
      setPendingPartnerIds(ids);
      setConfirmLeaveTask(true);
      return;
    }

    void applyPartnersChange(ids);
  }

  function cancelLeaveTask() {
    setConfirmLeaveTask(false);
    setPendingPartnerIds(null);
  }

  async function confirmLeaveTaskYes() {
    if (!pendingPartnerIds) return;
    setConfirmLeaveTask(false);
    const ids = pendingPartnerIds;
    setPendingPartnerIds(null);
    await applyPartnersChange(ids);
  }

  async function handleSubtaskToggle(subtaskId: string, done: boolean) {
    setSubtaskBusyId(subtaskId);
    setAssignError("");
    const message = await setSubtaskDone(task.id, subtaskId, done);
    if (message) setAssignError(message);
    setSubtaskBusyId(null);
  }

  const assigneeLabel = formatAssigneeNames(task.assigneeIds, personById);
  const doneSubtasks = task.subtasks.filter((item) => item.done).length;

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

      {showDescription && task.subtasks.length > 0 && (
        <div className="task-subtasks">
          <p className="attach-heading">
            Subtasks
            <span className="muted" style={{ fontWeight: 500 }}>
              {" "}
              · {doneSubtasks}/{task.subtasks.length} done
            </span>
          </p>
          <ul className="subtask-list">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className={subtask.done ? "done" : ""}>
                {canUpdate ? (
                  <label className="subtask-check">
                    <input
                      type="checkbox"
                      checked={subtask.done}
                      disabled={subtaskBusyId === subtask.id || isComplete}
                      onChange={(event) => {
                        void handleSubtaskToggle(subtask.id, event.target.checked);
                      }}
                    />
                    <span>{subtask.title}</span>
                  </label>
                ) : (
                  <span className="subtask-readonly">
                    <span className={`subtask-mark ${subtask.done ? "checked" : ""}`} aria-hidden>
                      {subtask.done ? "✓" : ""}
                    </span>
                    <span>{subtask.title}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showDescription && task.attachments.length > 0 && (
        <div className="task-attachments">
          <p className="attach-heading">Attachments</p>
          <ul className="attach-list">
            {task.attachments.map((attachment) => (
              <li key={attachment.id}>
                <a
                  className="attach-chip"
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="attach-kind">
                    {attachment.kind === "link" ? "Link" : "File"}
                  </span>
                  <span className="attach-name">{attachment.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showDescription && task.attachments.length > 0 && (
        <p className="attach-count muted">
          {task.attachments.length} attachment{task.attachments.length === 1 ? "" : "s"}
        </p>
      )}

      {!showDescription && task.subtasks.length > 0 && (
        <p className="attach-count muted">
          {doneSubtasks}/{task.subtasks.length} subtask{task.subtasks.length === 1 ? "" : "s"} done
        </p>
      )}

      <div className="task-meta">
        {assignees.length > 0 ? (
          <div className="assignee-stack" title={assigneeLabel}>
            <div className="avatar-stack">
              {assignees.slice(0, 3).map((person) => (
                <Avatar key={person.id} person={person} size="sm" />
              ))}
            </div>
            <span>{assigneeLabel}</span>
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

        {canAddPartners && (
          <button
            className="btn ghost sm"
            type="button"
            disabled={assigning}
            onClick={() => setShowPartnerPicker((open) => !open)}
          >
            {showPartnerPicker ? "Hide partners" : "Add partners"}
          </button>
        )}

        {showAssign && isLeader && (
          <button
            className="btn ghost sm"
            type="button"
            disabled={assigning}
            onClick={() => setShowAssignPicker((open) => !open)}
          >
            {showAssignPicker ? "Hide assignees" : "Assign"}
          </button>
        )}

        {isLeader && (
          <div className="task-actions">
            {showDescription && (
              <button
                className="btn ghost sm"
                type="button"
                onClick={() => setShowEditTask(true)}
              >
                Edit
              </button>
            )}
            {confirmRemove ? (
              <>
                <span className="muted">
                  {isComplete ? "Discard this completed task?" : "Delete this task?"}
                </span>
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

      {showAssign && isLeader && showAssignPicker && (
        <div className="assign-block">
          <div className="assign-block-head">
            <p className="attach-heading">Assign</p>
            <label className="assign-toggle">
              <input
                type="checkbox"
                checked={multiplePeople}
                disabled={assigning}
                onChange={(event) => {
                  const next = event.target.checked;
                  setMultiplePeople(next);
                  if (!next && task.assigneeIds.length > 1) {
                    void runAssign(task.assigneeIds.slice(0, 1), false);
                  }
                }}
              />
              <span>Multiple people</span>
            </label>
          </div>
          {multiplePeople && (
            <p className="muted assign-hint">Check everyone who should work on this task.</p>
          )}
          <TaskAssignField
            people={assignableRoster}
            multiple={multiplePeople}
            singleValue={assignSelectValue}
            multiValues={rosterAssigneeIds}
            disabled={assigning}
            variant="inline"
            onSingleChange={(nextId) => {
              void runAssign(nextId ? [nextId] : [], false);
            }}
            onMultiChange={(ids) => {
              void runAssign(ids, true);
            }}
          />
        </div>
      )}

      {canAddPartners && showPartnerPicker && (
        <div className="assign-block partners-block">
          <p className="attach-heading">Partners</p>
          {confirmLeaveTask ? (
            <div className="partner-confirm">
              <p className="muted">Are you sure you want to remove yourself from this task?</p>
              <div className="partner-confirm-actions">
                <button
                  className="btn ghost sm"
                  type="button"
                  disabled={assigning}
                  onClick={cancelLeaveTask}
                >
                  No
                </button>
                <button
                  className="btn sm"
                  type="button"
                  disabled={assigning}
                  onClick={() => {
                    void confirmLeaveTaskYes();
                  }}
                >
                  Yes
                </button>
              </div>
            </div>
          ) : (
            <PartnerPicker
              people={assignableRoster}
              selectedIds={rosterAssigneeIds}
              selfId={selfRosterId}
              disabled={assigning}
              onChange={handlePartnersChange}
            />
          )}
        </div>
      )}

      {canUpdate && task.assigneeIds.length > 0 && (
        <div className="seg task-status-seg" aria-label="Update progress">
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

      {assignError && (
        <p className="error" style={{ marginTop: 10 }}>
          {assignError}
        </p>
      )}

      {showEditTask && (
        <EditTaskModal task={task} onClose={() => setShowEditTask(false)} />
      )}
    </article>
  );
}
