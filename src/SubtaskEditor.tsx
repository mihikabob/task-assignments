import type { EditableSubtask } from "./lib/subtasks";
import { blankSubtask } from "./lib/subtasks";

export default function SubtaskEditor({
  items,
  onChange,
  disabled,
}: {
  items: EditableSubtask[];
  onChange: (items: EditableSubtask[]) => void;
  disabled?: boolean;
}) {
  function updateTitle(id: string, title: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, title } : item)));
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <div className="subtask-editor">
      <p className="attach-heading">Subtasks</p>
      <p className="muted attach-hint">
        Optional checklist steps for this task. Assignees can check them off as they work.
      </p>

      {items.length > 0 && (
        <ul className="subtask-edit-list">
          {items.map((item, index) => (
            <li key={item.id}>
              <span className="subtask-edit-index">{index + 1}.</span>
              <input
                className="field"
                value={item.title}
                disabled={disabled}
                placeholder="Subtask title"
                onChange={(event) => updateTitle(item.id, event.target.value)}
              />
              <button
                type="button"
                className="btn ghost sm"
                disabled={disabled}
                onClick={() => removeItem(item.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn ghost sm"
        disabled={disabled}
        onClick={() => onChange([...items, blankSubtask()])}
      >
        Add subtask
      </button>
    </div>
  );
}
