import { useRef, useState, type FormEvent } from "react";
import SubtaskEditor from "./SubtaskEditor";
import TaskAssignField from "./TaskAssignField";
import {
  ACCEPTED_FILE_TYPES,
  formatFileSize,
  MAX_ATTACHMENT_BYTES,
  normalizeLinkUrl,
} from "./lib/attachments";
import type { EditableSubtask } from "./lib/subtasks";
import { toSubtasksPayload } from "./lib/subtasks";
import { useApp } from "./store";

type PendingLink = { id: string; label: string; url: string };
type PendingFile = { id: string; file: File };

export default function AddTaskModal({ onClose }: { onClose: () => void }) {
  const { addTask, assignableRoster } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [multiplePeople, setMultiplePeople] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [subtasks, setSubtasks] = useState<EditableSubtask[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [links, setLinks] = useState<PendingLink[]>([]);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function addLink() {
    const url = normalizeLinkUrl(linkUrl);
    if (!url) {
      setError("Enter a valid link (https://…).");
      return;
    }
    setError("");
    setLinks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: linkLabel.trim() || url,
        url,
      },
    ]);
    setLinkUrl("");
    setLinkLabel("");
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    const next: PendingFile[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}" is over the 10 MB limit.`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file });
    }
    if (next.length) setFiles((current) => [...current, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const selectedIds = multiplePeople
        ? assigneeIds
        : assigneeId
          ? [assigneeId]
          : [];

      const message = await addTask({
        title,
        description,
        assigneeIds: selectedIds,
        multiplePeople,
        links: links.map(({ label, url }) => ({ label, url })),
        files: files.map((item) => item.file),
        subtasks: toSubtasksPayload(subtasks),
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

          <SubtaskEditor items={subtasks} onChange={setSubtasks} disabled={saving} />

          <div className="assign-block">
            <div className="assign-block-head">
              <p className="attach-heading">Assign now (optional)</p>
              <label className="assign-toggle">
                <input
                  type="checkbox"
                  checked={multiplePeople}
                  disabled={saving}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setMultiplePeople(next);
                    if (next) {
                      setAssigneeIds(assigneeId ? [assigneeId] : []);
                    } else {
                      setAssigneeId(assigneeIds[0] ?? "");
                      setAssigneeIds([]);
                    }
                  }}
                />
                <span>Multiple people</span>
              </label>
            </div>
            {multiplePeople ? (
              <p className="muted assign-hint">Check everyone who should work on this task.</p>
            ) : (
              <p className="muted attach-hint">Pick one person, or leave open for anyone to claim.</p>
            )}
            <TaskAssignField
              people={assignableRoster}
              multiple={multiplePeople}
              singleValue={assigneeId}
              multiValues={assigneeIds}
              disabled={saving}
              onSingleChange={setAssigneeId}
              onMultiChange={setAssigneeIds}
            />
          </div>

          <div className="attach-section">
            <p className="attach-heading">Attachments</p>
            <p className="muted attach-hint">
              Add links or upload files (PDF, images, docs — up to 10 MB each). Interns can open
              them from the task.
            </p>

            <div className="attach-link-row">
              <input
                className="field"
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder="Link label (optional)"
              />
              <input
                className="field"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://…"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addLink();
                  }
                }}
              />
              <button className="btn ghost" type="button" onClick={addLink}>
                Add link
              </button>
            </div>

            <div className="attach-file-row">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                onChange={(event) => addFiles(event.target.files)}
              />
            </div>

            {(links.length > 0 || files.length > 0) && (
              <ul className="attach-pending">
                {links.map((link) => (
                  <li key={link.id}>
                    <span className="attach-kind">Link</span>
                    <span className="attach-name">{link.label}</span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setLinks((current) => current.filter((item) => item.id !== link.id))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {files.map((item) => (
                  <li key={item.id}>
                    <span className="attach-kind">File</span>
                    <span className="attach-name">
                      {item.file.name}
                      <span className="muted"> · {formatFileSize(item.file.size)}</span>
                    </span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() =>
                        setFiles((current) => current.filter((entry) => entry.id !== item.id))
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
