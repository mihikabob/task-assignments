import type { Person, Role, Task } from "./types";

export const LEADER_ACCESS_CODE = "LEAD-2026";
export const PLACEHOLDER_EMAIL_DOMAIN = "taskhub.local";

function slugifyName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

/** Auth/roster id: personal Gmail when we have one, otherwise a non-public placeholder. */
export function authEmailFor(name: string, personalEmail?: string | null) {
  if (personalEmail?.trim()) return personalEmail.trim().toLowerCase();
  return `${slugifyName(name)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined) {
  if (!email) return true;
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

export function displayEmail(email: string | null | undefined) {
  if (!email || isPlaceholderEmail(email)) return null;
  return email;
}

function member(name: string, role: Role, personalEmail?: string | null): Person {
  const email = authEmailFor(name, personalEmail);
  return {
    id: email,
    name,
    email,
    role,
    title: role === "leader" ? "Program Lead" : "Intern",
  };
}

/** One roster row per person. Personal Gmail when known; otherwise password-only placeholder. */
export const people: Person[] = [
  member("Kip Glazer", "leader", "kip.glazer@mvla.net"),
  member("Myra Jain", "leader", "myraniaj@gmail.com"),
  member("Cinty Lin", "leader", "cinty.lin.cinty@gmail.com"),
  member("Yash Maheshwari", "leader", "yashmahe2018@gmail.com"),
  member("Jayan Nair", "leader", "nairjay30@gmail.com"),
  member("Keshav Pillutla", "leader", "kcp7006@gmail.com"),
  member("Emma Teng", "leader", "emmakteng@gmail.com"),
  member("Rishi Jindal", "intern"),
  member("Manuel Diuk", "intern"),
  member("Raya Aghazadeh", "intern"),
  member("Eliana Tekie", "intern"),
  member("Nathalie Zhang", "intern"),
  member("Mihika Bobbarjung", "intern", "mihikabob10@gmail.com"),
  member("Caroline Yu", "intern"),
  member("Colby Liu", "intern"),
  member("Emma Fei", "intern"),
  member("Lucas Nam", "intern"),
  member("Ilan Gerber", "intern"),
];

export const leaders = people.filter((person) => person.role === "leader");
export const interns = people.filter((person) => person.role === "intern");

/** Unique full names for password login (one entry per person). */
export const loginNames = [...new Set(people.map((person) => person.name))].sort((a, b) =>
  a.localeCompare(b),
);

export const DEMO_PASSWORD = "password";

/** Map a full name to the single Auth/roster email for that person. */
export function resolveLoginEmail(name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return people.find((person) => person.name.toLowerCase() === needle)?.email ?? null;
}

/**
 * One row per person name. Live roster wins; among duplicates prefer real Gmail
 * over placeholder auth emails.
 */
export function uniquePeopleByName(preferred: Person[], fallback: Person[] = []): Person[] {
  const byName = new Map<string, Person>();

  const putPreferRealEmail = (person: Person, target: Map<string, Person>) => {
    const key = person.name.trim().toLowerCase();
    const existing = target.get(key);
    if (!existing) {
      target.set(key, person);
      return;
    }
    if (!isPlaceholderEmail(person.email) && isPlaceholderEmail(existing.email)) {
      target.set(key, person);
    }
  };

  for (const person of fallback) putPreferRealEmail(person, byName);

  const liveByName = new Map<string, Person>();
  for (const person of preferred) putPreferRealEmail(person, liveByName);
  for (const [key, person] of liveByName) byName.set(key, person);

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const LEADER_EMAILS = new Set(leaders.map((person) => person.email));
export const INTERN_EMAILS = new Set(interns.map((person) => person.email));
export const ROSTER_EMAILS = new Set(people.map((person) => person.email));

export function rosterByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return people.find((person) => person.email === normalized);
}

const KIP = authEmailFor("Kip Glazer", "kip.glazer@mvla.net");
const MYRA = authEmailFor("Myra Jain", "myraniaj@gmail.com");
const JAYAN = authEmailFor("Jayan Nair", "nairjay30@gmail.com");
const RISHI = authEmailFor("Rishi Jindal");
const RAYA = authEmailFor("Raya Aghazadeh");
const CAROLINE = authEmailFor("Caroline Yu");
const LUCAS = authEmailFor("Lucas Nam");

export const seedTasks: Task[] = [
  {
    id: "task-1",
    title: "Draft intern onboarding checklist",
    description:
      "Write a first-week checklist so a new intern can get set up without guessing. Include accounts to request (Google, GitHub, Figma), where shared files live, who to ping for access, and what a good first standup update looks like. Keep the language plain and short enough that someone can finish it in an afternoon.",
    status: "in_progress",
    assigneeIds: [RISHI],
    assignedById: KIP,
    createdBy: KIP,
    createdAt: "2026-08-04T10:00:00.000Z",
    attachments: [],
    updatedAt: "2026-08-12T14:20:00.000Z",
  },
  {
    id: "task-2",
    title: "Refresh the program landing page copy",
    description:
      "Rewrite the about section for this year’s Tech Internship program. Cover what interns actually work on, how tasks get claimed, and how to reach a leader if something is unclear. Add this year’s project themes and cut any leftover language from last summer. Aim for a page that a parent or intern could skim in under two minutes.",
    status: "just_started",
    assigneeIds: [RAYA],
    assignedById: MYRA,
    createdBy: MYRA,
    createdAt: "2026-08-05T11:30:00.000Z",
    attachments: [],
    updatedAt: "2026-08-11T09:00:00.000Z",
  },
  {
    id: "task-3",
    title: "Audit unused GitHub repositories",
    description:
      "Go through the shared GitHub org and flag repos that look archived, empty, or stale. For each one, note the last commit date, whether anyone still uses it, and a recommend-keep / archive / delete call. Put the notes in a shared doc so a leader can review before anything is actually removed.",
    status: "unclaimed",
    assigneeIds: [],
    assignedById: null,
    createdBy: JAYAN,
    createdAt: "2026-08-06T16:00:00.000Z",
    attachments: [],
    updatedAt: "2026-08-06T16:00:00.000Z",
  },
  {
    id: "task-4",
    title: "Set up weekly standup notes template",
    description:
      "Make a shared weekly notes template with three sections: wins, blockers, and next steps. It should be easy to duplicate each week and short enough that people actually fill it out. Add a one-line example under each heading so the first intern to use it is not staring at a blank page.",
    status: "complete",
    assigneeIds: [CAROLINE],
    assignedById: KIP,
    createdBy: KIP,
    createdAt: "2026-08-01T09:00:00.000Z",
    attachments: [],
    updatedAt: "2026-08-08T17:45:00.000Z",
  },
  {
    id: "task-5",
    title: "Collect last year's project photos",
    description:
      "Gather 8–10 photos from last year’s projects that we can use in the end-of-summer recap. Prefer shots of people working or presenting, not just screenshots. Drop the files in the shared drive with short captions (who, what, when) so they are usable later without asking around.",
    status: "unclaimed",
    assigneeIds: [],
    assignedById: null,
    createdBy: KIP,
    createdAt: "2026-08-07T13:15:00.000Z",
    attachments: [],
    updatedAt: "2026-08-07T13:15:00.000Z",
  },
  {
    id: "task-6",
    title: "Prototype intern feedback form",
    description:
      "Draft a short mid-program check-in form. Keep it under eight questions and mix rating questions with one or two open responses. We want to know whether the workload feels right, whether leaders are reachable, and what would make the second half of the internship more useful. Share a first draft for leader review before sending it to everyone.",
    status: "in_progress",
    assigneeIds: [LUCAS],
    assignedById: JAYAN,
    createdBy: JAYAN,
    createdAt: "2026-08-08T10:40:00.000Z",
    attachments: [],
    updatedAt: "2026-08-14T11:10:00.000Z",
  },
  {
    id: "task-7",
    title: "Document how we deploy the club website",
    description:
      "Write a step-by-step deploy guide so a new intern can ship a small change without pairing. Include where the repo lives, what to install, how to preview locally, and the exact commands / clicks to publish. Call out the mistakes that have bitten people before (wrong branch, missing env values, forgetting to pull). Screenshots are welcome.",
    status: "unclaimed",
    assigneeIds: [],
    assignedById: null,
    createdBy: MYRA,
    createdAt: "2026-08-09T15:00:00.000Z",
    attachments: [],
    updatedAt: "2026-08-09T15:00:00.000Z",
  },
  {
    id: "task-8",
    title: "Tag and organize Figma files",
    description:
      "The shared Figma library is messy. Rename files so the project is obvious from the title, add a cover page to the main library, and archive anything that is clearly leftover. Leave a short note in the intern channel about the new naming pattern so the next person does not undo the cleanup.",
    status: "just_started",
    assigneeIds: [RAYA],
    assignedById: KIP,
    createdBy: KIP,
    createdAt: "2026-08-10T12:00:00.000Z",
    attachments: [],
    updatedAt: "2026-08-13T16:30:00.000Z",
  },
];

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function personById(id: string | null) {
  if (!id) return undefined;
  return people.find((person) => person.id === id);
}
