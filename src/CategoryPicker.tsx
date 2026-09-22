import { TASK_CATEGORIES } from "./lib/categories";
import type { TaskCategory } from "./types";

export default function CategoryPicker({
  values,
  onChange,
  disabled,
}: {
  values: TaskCategory[];
  onChange: (values: TaskCategory[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(values);

  function toggle(id: TaskCategory) {
    if (disabled) return;
    if (selected.has(id)) {
      onChange(values.filter((item) => item !== id));
    } else {
      onChange([...values, id]);
    }
  }

  return (
    <div className="category-picker">
      <p className="attach-heading">Categories</p>
      <p className="muted attach-hint">Optional. Pick one or more.</p>
      <div className="assignee-checks">
        {TASK_CATEGORIES.map((item) => (
          <label key={item.id} className="assignee-check">
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              disabled={disabled}
              onChange={() => toggle(item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
