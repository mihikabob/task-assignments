import type { Person } from "./types";

export default function TaskAssignField({
  people,
  multiple,
  singleValue,
  multiValues,
  onSingleChange,
  onMultiChange,
  disabled,
  variant = "form",
}: {
  people: Person[];
  multiple: boolean;
  singleValue: string;
  multiValues: string[];
  onSingleChange: (id: string) => void;
  onMultiChange: (ids: string[]) => void;
  disabled?: boolean;
  variant?: "form" | "inline";
}) {
  const interns = people.filter((person) => person.role === "intern");
  const leaders = people.filter((person) => person.role === "leader");
  const selected = new Set(multiValues);

  function toggleMulti(id: string) {
    if (disabled) return;
    if (selected.has(id)) {
      onMultiChange(multiValues.filter((item) => item !== id));
    } else {
      onMultiChange([...multiValues, id]);
    }
  }

  function renderSingleOptions() {
    return (
      <>
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
                {person.name} (leader)
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  }

  function renderMultiGroup(label: string, group: Person[]) {
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
                onChange={() => toggleMulti(person.id)}
              />
              <span>
                {person.name}
                {person.role === "leader" ? " (leader)" : ""}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (multiple) {
    return (
      <div className="assignee-picker">
        <p className="muted" style={{ fontSize: 13 }}>
          {multiValues.length === 0
            ? "Check everyone who should work on this task."
            : `${multiValues.length} selected`}
        </p>
        {renderMultiGroup("Interns", interns)}
        {renderMultiGroup("Leaders", leaders)}
      </div>
    );
  }

  return (
    <select
      className={variant === "inline" ? "select" : "field"}
      disabled={disabled}
      value={singleValue}
      onChange={(event) => onSingleChange(event.target.value)}
    >
      {renderSingleOptions()}
    </select>
  );
}
