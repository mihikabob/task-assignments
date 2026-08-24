import type { Person, Role, Task } from "./types";

export const LEADER_ACCESS_CODE = "LEAD-2026";

function member(name: string, email: string, role: Role): Person {
  const normalized = email.trim().toLowerCase();
  return {
    id: normalized,
    name,
    email: normalized,
    role,
    title: role === "leader" ? "Program Lead" : "Intern",
  };
}

export const people: Person[] = [
  member("Kip Glazer", "kip.glazer@mvla.net", "leader"),
  member("Myra Jain", "100034112@mvla.net", "leader"),
  member("Myra Jain", "myraniaj@gmail.com", "leader"),
  member("Cinty Lin", "100031930@mvla.net", "leader"),
  member("Cinty Lin", "cinty.lin.cinty@gmail.com", "leader"),
  member("Yash Maheshwari", "100032240@mvla.net", "leader"),
  member("Yash Maheshwari", "yashmahe2018@gmail.com", "leader"),
  member("Jayan Nair", "100033302@mvla.net", "leader"),
  member("Jayan Nair", "nairjay30@gmail.com", "leader"),
  member("Keshav Pillutla", "100032262@mvla.net", "leader"),
  member("Keshav Pillutla", "kcp7006@gmail.com", "leader"),
  member("Emma Teng", "100032027@mvla.net", "leader"),
  member("Emma Teng", "emmakteng@gmail.com", "leader"),
  member("Rishi Jindal", "100035436@mvla.net", "intern"),
  member("Manuel Diuk", "100033884@mvla.net", "intern"),
  member("Raya Aghazadeh", "100033684@mvla.net", "intern"),
  member("Eliana Tekie", "100033289@mvla.net", "intern"),
  member("Nathalie Zhang", "100034692@mvla.net", "intern"),
  member("Mihika Bobbarjung", "100033492@mvla.net", "intern"),
  member("Mihika Bobbarjung", "mihikabob10@gmail.com", "intern"),
  member("Caroline Yu", "100034056@mvla.net", "intern"),
  member("Colby Liu", "100033448@mvla.net", "intern"),
  member("Emma Fei", "100034010@mvla.net", "intern"),
  member("Lucas Nam", "100033172@mvla.net", "intern"),
  member("Ilan Gerber", "100032190@mvla.net", "intern"),
];

export const leaders = people.filter((person) => person.role === "leader");
export const interns = people.filter((person) => person.role === "intern");

/** Unique full names for password login (one entry per person). */
export const loginNames = [...new Set(people.map((person) => person.name))].sort((a, b) =>
  a.localeCompare(b),
);

export const DEMO_PASSWORD = "password";

/** Map a full name to the Auth email (prefer @mvla.net when duplicates exist). */
export function resolveLoginEmail(name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  const matches = people.filter((person) => person.name.toLowerCase() === needle);
  if (matches.length === 0) return null;

  const school = matches.find((person) => person.email.endsWith("@mvla.net"));
  return (school ?? matches[0]).email;
}

export const LEADER_EMAILS = new Set(leaders.map((person) => person.email));
export const INTERN_EMAILS = new Set(interns.map((person) => person.email));
export const ROSTER_EMAILS = new Set(people.map((person) => person.email));

export function rosterByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return people.find((person) => person.email === normalized);
}

const KIP = "kip.glazer@mvla.net";
const MYRA = "100034112@mvla.net";
const JAYAN = "100033302@mvla.net";
const RISHI = "100035436@mvla.net";
const RAYA = "100033684@mvla.net";
const CAROLINE = "100034056@mvla.net";
const LUCAS = "100033172@mvla.net";

export const seedTasks: Task[] = [
  {
    id: "task-1",
    title: "Draft intern onboarding checklist",
    description:
      "Write a first-week checklist so a new intern can get set up without guessing. Include accounts to request (Google, GitHub, Figma), where shared files live, who to ping for access, and what a good first standup update looks like. Keep the language plain and short enough that someone can finish it in an afternoon.",
    status: "in_progress",
    assigneeId: RISHI,
    assignedById: KIP,
    createdBy: KIP,
    createdAt: "2026-08-04T10:00:00.000Z",
    updatedAt: "2026-08-12T14:20:00.000Z",
  },
  {
    id: "task-2",
    title: "Refresh the program landing page copy",
    description:
      "Rewrite the about section for this year’s Tech Internship program. Cover what interns actually work on, how tasks get claimed, and how to reach a leader if something is unclear. Add this year’s project themes and cut any leftover language from last summer. Aim for a page that a parent or intern could skim in under two minutes.",
    status: "just_started",
    assigneeId: RAYA,
    assignedById: MYRA,
    createdBy: MYRA,
    createdAt: "2026-08-05T11:30:00.000Z",
    updatedAt: "2026-08-11T09:00:00.000Z",
  },
  {
    id: "task-3",
    title: "Audit unused GitHub repositories",
    description:
      "Go through the shared GitHub org and flag repos that look archived, empty, or stale. For each one, note the last commit date, whether anyone still uses it, and a recommend-keep / archive / delete call. Put the notes in a shared doc so a leader can review before anything is actually removed.",
    status: "unclaimed",
    assigneeId: null,
    assignedById: null,
    createdBy: JAYAN,
    createdAt: "2026-08-06T16:00:00.000Z",
    updatedAt: "2026-08-06T16:00:00.000Z",
  },
  {
    id: "task-4",
    title: "Set up weekly standup notes template",
    description:
      "Make a shared weekly notes template with three sections: wins, blockers, and next steps. It should be easy to duplicate each week and short enough that people actually fill it out. Add a one-line example under each heading so the first intern to use it is not staring at a blank page.",
    status: "complete",
    assigneeId: CAROLINE,
    assignedById: KIP,
    createdBy: KIP,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-08T17:45:00.000Z",
  },
  {
    id: "task-5",
    title: "Collect last year's project photos",
    description:
      "Gather 8–10 photos from last year’s projects that we can use in the end-of-summer recap. Prefer shots of people working or presenting, not just screenshots. Drop the files in the shared drive with short captions (who, what, when) so they are usable later without asking around.",
    status: "unclaimed",
    assigneeId: null,
    assignedById: null,
    createdBy: KIP,
    createdAt: "2026-08-07T13:15:00.000Z",
    updatedAt: "2026-08-07T13:15:00.000Z",
  },
  {
    id: "task-6",
    title: "Prototype intern feedback form",
    description:
      "Draft a short mid-program check-in form. Keep it under eight questions and mix rating questions with one or two open responses. We want to know whether the workload feels right, whether leaders are reachable, and what would make the second half of the internship more useful. Share a first draft for leader review before sending it to everyone.",
    status: "in_progress",
    assigneeId: LUCAS,
    assignedById: JAYAN,
    createdBy: JAYAN,
    createdAt: "2026-08-08T10:40:00.000Z",
    updatedAt: "2026-08-14T11:10:00.000Z",
  },
  {
    id: "task-7",
    title: "Document how we deploy the club website",
    description:
      "Write a step-by-step deploy guide so a new intern can ship a small change without pairing. Include where the repo lives, what to install, how to preview locally, and the exact commands / clicks to publish. Call out the mistakes that have bitten people before (wrong branch, missing env values, forgetting to pull). Screenshots are welcome.",
    status: "unclaimed",
    assigneeId: null,
    assignedById: null,
    createdBy: MYRA,
    createdAt: "2026-08-09T15:00:00.000Z",
    updatedAt: "2026-08-09T15:00:00.000Z",
  },
  {
    id: "task-8",
    title: "Tag and organize Figma files",
    description:
      "The shared Figma library is messy. Rename files so the project is obvious from the title, add a cover page to the main library, and archive anything that is clearly leftover. Leave a short note in the intern channel about the new naming pattern so the next person does not undo the cleanup.",
    status: "just_started",
    assigneeId: RAYA,
    assignedById: KIP,
    createdBy: KIP,
    createdAt: "2026-08-10T12:00:00.000Z",
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
