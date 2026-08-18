import { initials } from "./data";
import type { Person } from "./types";

export default function Avatar({
  person,
  size,
}: {
  person: Pick<Person, "name" | "picture">;
  size?: "sm" | "lg";
}) {
  const className = size ? `avatar ${size}` : "avatar";
  if (person.picture) {
    return <img className={className} src={person.picture} alt="" referrerPolicy="no-referrer" />;
  }
  return <span className={className}>{initials(person.name)}</span>;
}
