import type { Person } from "./types";

export default function PartnerPicker({
  people,
  selectedIds,
  selfId,
  onChange,
  disabled,
}: {
  people: Person[];
  selectedIds: string[];
  selfId?: string;
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(selectedIds);
  const interns = people.filter((person) => person.role === "intern");
  const leaders = people.filter((person) => person.role === "leader");

  function toggle(id: string) {
    if (disabled) return;
    if (selected.has(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function renderGroup(label: string, group: Person[]) {
    if (group.length === 0) return null;
    return (
      <div className="assignee-group">
        <p className="assignee-group-label">{label}</p>
        <div className="assignee-checks">
          {group.map((person) => (
            <label key={person.id} className="assignee-check">
              <input
                type="checkbox"
                checked={selected.has(person.id)}
                disabled={disabled}
                onChange={() => toggle(person.id)}
              />
              <span>
                {person.name}
                {person.role === "leader" ? " (leader)" : ""}
                {selfId && person.id === selfId ? " (you)" : ""}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="assignee-picker">
      <p className="muted" style={{ fontSize: 13 }}>
        {selectedIds.length <= 1
          ? "Check people to add partners. Uncheck to remove someone, or yourself to leave the task."
          : `${selectedIds.length} on this task`}
      </p>
      {renderGroup("Interns", interns)}
      {renderGroup("Leaders", leaders)}
    </div>
  );
}
