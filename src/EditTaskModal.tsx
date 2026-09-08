import { useState, type FormEvent } from "react";
import SubtaskEditor from "./SubtaskEditor";
import type { EditableSubtask } from "./lib/subtasks";
import { fromSubtasks, toSubtasksPayload } from "./lib/subtasks";
import type { Task } from "./types";
import { useApp } from "./store";

export default function EditTaskModal({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const { updateTask } = useApp();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [subtasks, setSubtasks] = useState<EditableSubtask[]>(() =>
    fromSubtasks(task.subtasks),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const message = await updateTask({
        taskId: task.id,
        title,
        description,
        subtasks: toSubtasksPayload(subtasks),
      });
      if (message) {
        setError(message);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal wide"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <p className="page-kicker">Leaders only</p>
        <h2 style={{ fontSize: 28 }}>Edit task</h2>

        <div className="form">
          <label>
            Title
            <input
              className="field"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to get done?"
              autoFocus
            />
          </label>
          <label>
            Description
            <textarea
              className="textarea long"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
              maxLength={8000}
            />
            <span className="muted" style={{ fontWeight: 500 }}>
              {description.trim().length} / 8000
            </span>
          </label>

          <SubtaskEditor items={subtasks} onChange={setSubtasks} disabled={saving} />

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button className="btn ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn primary" type="submit" disabled={!title.trim() || saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
