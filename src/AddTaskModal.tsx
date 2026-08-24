import { useState, type FormEvent } from "react";
import { useApp } from "./store";

export default function AddTaskModal({ onClose }: { onClose: () => void }) {
  const { addTask, assignableRoster } = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const interns = assignableRoster.filter((person) => person.role === "intern");
  const leaders = assignableRoster.filter((person) => person.role === "leader");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const message = await addTask({
        title,
        description,
        assigneeId: assigneeId || null,
      });
      if (message) {
        setError(message);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish task.");
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
        <h2 style={{ fontSize: 28 }}>Add a task</h2>

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
          <label>
            Assign now (optional)
            <select
              className="field"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <option value="">Leave open for anyone to claim</option>
              {interns.length > 0 && (
                <optgroup label="Interns">
                  {interns.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {leaders.length > 0 && (
                <optgroup label="Leaders">
                  {leaders.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button className="btn ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn primary" type="submit" disabled={!title.trim() || saving}>
              {saving ? "Publishing…" : "Publish task"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
