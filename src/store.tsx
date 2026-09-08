import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  formatDbError,
  mapProfile,
  mapRoster,
  mapTask,
  type ProfileRow,
  type RosterRow,
  type TaskRow,
} from "./lib/database";
import { DEMO_PASSWORD, people as seedPeople, resolveLoginEmail, uniquePeopleByName } from "./data";
import { supabase, supabaseConfigured } from "./lib/supabase";
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  newAttachmentId,
  sanitizeFileName,
} from "./lib/attachments";
import type { Person, Session, Subtask, Task, TaskAttachment, TaskStatus } from "./types";

interface AppState {
  ready: boolean;
  session: Session | null;
  currentUser: Person | null;
  authError: string | null;
  clearAuthError: () => void;
  tasks: Task[];
  people: Person[];
  internRoster: Person[];
  assignableRoster: Person[];
  personById: (id: string | null) => Person | undefined;
  signInWithGoogle: () => Promise<string | null>;
  signInWithNamePassword: (name: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  addTask: (input: {
    title: string;
    description: string;
    assigneeIds: string[];
    multiplePeople: boolean;
    links?: { label: string; url: string }[];
    files?: File[];
    subtasks?: Subtask[];
  }) => Promise<string | null>;
  updateTask: (input: {
    taskId: string;
    title: string;
    description: string;
    subtasks: Subtask[];
  }) => Promise<string | null>;
  setSubtaskDone: (
    taskId: string,
    subtaskId: string,
    done: boolean,
  ) => Promise<string | null>;
  claimTask: (taskId: string) => Promise<string | null>;
  assignTask: (
    taskId: string,
    assigneeIds: string[],
    multiplePeople: boolean,
  ) => Promise<string | null>;
  setPartners: (taskId: string, assigneeIds: string[]) => Promise<string | null>;
  updateStatus: (taskId: string, status: TaskStatus) => Promise<string | null>;
  deleteTask: (taskId: string) => Promise<string | null>;
  discardCompleted: () => Promise<string | null>;
}

const AppContext = createContext<AppState | null>(null);

function profileToSession(profile: Person): Session {
  return { userId: profile.email, role: profile.role };
}

function isMissingRpc(message: string) {
  return (
    /could not find the function/i.test(message) ||
    /PGRST202/i.test(message) ||
    /schema cache/i.test(message)
  );
}

async function rpcAssignTask(taskId: string, assigneeIds: string[], multiple: boolean) {
  const resolved = assigneeIds.filter(Boolean);

  if (!multiple || resolved.length <= 1) {
    return supabase.rpc("assign_task", {
      p_task_id: taskId,
      p_assignee_id: resolved[0] ?? null,
    });
  }

  return supabase.rpc("assign_task", {
    p_task_id: taskId,
    p_assignee_ids: resolved,
  });
}

async function rpcAddTask(
  title: string,
  description: string,
  assigneeIds: string[],
  attachments: TaskAttachment[],
  subtasks: Subtask[],
  multiple: boolean,
) {
  const resolved = assigneeIds.filter(Boolean);
  const base = {
    p_title: title,
    p_description: description,
    p_attachments: attachments,
    p_subtasks: subtasks,
  };

  if (!multiple || resolved.length <= 1) {
    const single = await supabase.rpc("add_task", {
      ...base,
      p_assignee_id: resolved[0] ?? null,
    });
    if (!single.error) return single;

    const message = formatDbError(single.error);
    if (/p_subtasks|subtasks/i.test(message) || isMissingRpc(message)) {
      const withoutSubtasks = await supabase.rpc("add_task", {
        p_title: title,
        p_description: description,
        p_attachments: attachments,
        p_assignee_id: resolved[0] ?? null,
      });
      if (!withoutSubtasks.error) return withoutSubtasks;
    }
    if (!isMissingRpc(message) && !/p_attachments|attachments/i.test(message)) {
      return single;
    }

    return supabase.rpc("add_task", {
      p_title: title,
      p_description: description,
      p_assignee_id: resolved[0] ?? null,
    });
  }

  const multi = await supabase.rpc("add_task", {
    ...base,
    p_assignee_ids: resolved,
  });
  if (!multi.error) return multi;

  const message = formatDbError(multi.error);
  if (/p_subtasks|subtasks/i.test(message) || isMissingRpc(message)) {
    const withoutSubtasks = await supabase.rpc("add_task", {
      p_title: title,
      p_description: description,
      p_attachments: attachments,
      p_assignee_ids: resolved,
    });
    if (!withoutSubtasks.error) return withoutSubtasks;
  }
  if (!isMissingRpc(message) && !/p_attachments|attachments/i.test(message)) {
    return multi;
  }

  return supabase.rpc("add_task", {
    p_title: title,
    p_description: description,
    p_assignee_id: resolved[0] ?? null,
  });
}

/** Prefer live roster emails for the same people so assign_task validates. */
function resolveAssigneesForDb(
  assigneeIds: string[],
  livePeople: Person[],
  roster: Person[],
): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const assigneeId of assigneeIds) {
    let next = assigneeId;
    if (!livePeople.some((person) => person.id === assigneeId)) {
      const named =
        roster.find((person) => person.id === assigneeId) ??
        seedPeople.find((person) => person.id === assigneeId);
      if (named) {
        const nameKey = named.name.trim().toLowerCase();
        const liveMatch = livePeople.find(
          (person) => person.name.trim().toLowerCase() === nameKey,
        );
        next = liveMatch?.id ?? named.id;
      }
    }
    if (!seen.has(next)) {
      seen.add(next);
      resolved.push(next);
    }
  }

  return resolved;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<Person | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const resetLocalUser = useCallback(() => {
    setSession(null);
    setCurrentUser(null);
    setPeople([]);
    setTasks([]);
  }, []);

  const loadPeople = useCallback(async () => {
    const [{ data: roster, error: rosterError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        supabase.from("roster").select("*").order("name"),
        supabase.from("profiles").select("*"),
      ]);
    if (rosterError) throw rosterError;
    if (profilesError) throw profilesError;

    const pictures = new Map(
      (profiles as ProfileRow[]).map((profile) => [profile.email, profile.picture]),
    );

    setPeople((roster as RosterRow[]).map((row) => mapRoster(row, pictures.get(row.email))));
  }, []);

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    setTasks((data as TaskRow[]).map(mapTask));
  }, []);

  const bootstrapUser = useCallback(async () => {
    const { data: profile, error } = await supabase.rpc("sync_profile").single();
    if (error) throw error;
    if (!profile) throw new Error("Could not load your profile.");

    const person = mapProfile(profile as ProfileRow);
    setCurrentUser(person);
    setSession(profileToSession(person));
    setAuthError(null);

    try {
      await Promise.all([loadPeople(), loadTasks()]);
    } catch (loadError) {
      // Profile sync succeeded — keep the user signed in even if lists fail.
      console.error(loadError);
    }
  }, [loadPeople, loadTasks]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }

    let mounted = true;
    let bootstrapping = false;

    async function runBootstrap() {
      if (bootstrapping) return;
      bootstrapping = true;
      try {
        await bootstrapUser();
      } catch (error) {
        const message = formatDbError(error as { message?: string });
        await supabase.auth.signOut();
        if (mounted) {
          resetLocalUser();
          setAuthError(message);
        }
      } finally {
        bootstrapping = false;
        if (mounted) setReady(true);
      }
    }

    async function init() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();

      if (authSession) {
        await runBootstrap();
      } else if (mounted) {
        setReady(true);
      }
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      // Avoid deadlocks: never await inside this callback.
      setTimeout(() => {
        if (!mounted) return;

        if (event === "SIGNED_OUT" || !authSession) {
          resetLocalUser();
          return;
        }

        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          void runBootstrap();
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [bootstrapUser, resetLocalUser]);

  useEffect(() => {
    if (!supabaseConfigured || !session) return;

    const channel = supabase
      .channel("tasks-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          void loadTasks();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session, loadTasks]);

  const internRoster = useMemo(
    () =>
      uniquePeopleByName(
        people.filter((person) => person.role === "intern"),
        seedPeople.filter((person) => person.role === "intern"),
      ),
    [people],
  );

  const assignableRoster = useMemo(
    () => uniquePeopleByName(people, seedPeople),
    [people],
  );

  const value = useMemo<AppState>(
    () => ({
      ready,
      session,
      currentUser,
      authError,
      clearAuthError,
      tasks,
      people,
      internRoster,
      assignableRoster,
      personById: (id) => {
        if (!id) return undefined;
        return (
          people.find((person) => person.id === id) ??
          assignableRoster.find((person) => person.id === id) ??
          seedPeople.find((person) => person.id === id)
        );
      },
      signInWithGoogle: async () => {
        if (!supabaseConfigured) {
          return "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
        }
        setAuthError(null);
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
          },
        });
        return error ? formatDbError(error) : null;
      },
      signInWithNamePassword: async (name, password) => {
        if (!supabaseConfigured) {
          return "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
        }
        setAuthError(null);

        const email = resolveLoginEmail(name);
        if (!email || password !== DEMO_PASSWORD) {
          return "Invalid name or password";
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: DEMO_PASSWORD,
        });
        if (error) {
          const message = formatDbError(error);
          if (/invalid login credentials/i.test(message)) {
            return "Invalid name or password. Run supabase/migrate_password_login.sql in the Supabase SQL Editor first (and enable the Email auth provider).";
          }
          return message;
        }
        return null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
        resetLocalUser();
      },
      addTask: async ({
        title,
        description,
        assigneeIds,
        multiplePeople,
        links = [],
        files = [],
        subtasks = [],
      }) => {
        try {
          const resolvedAssignees = resolveAssigneesForDb(
            assigneeIds,
            people,
            assignableRoster,
          );

          for (const file of files) {
            if (file.size > MAX_ATTACHMENT_BYTES) {
              return `"${file.name}" is over the 10 MB limit.`;
            }
          }

          const linkAttachments: TaskAttachment[] = links.map((link) => ({
            id: newAttachmentId(),
            kind: "link",
            label: link.label.trim() || link.url,
            url: link.url,
          }));

          const cleanSubtasks = subtasks
            .map((item) => ({
              id: item.id,
              title: item.title.trim(),
              done: Boolean(item.done),
            }))
            .filter((item) => item.title.length > 0);

          const { data, error } = await rpcAddTask(
            title,
            description,
            resolvedAssignees,
            linkAttachments,
            cleanSubtasks,
            multiplePeople && resolvedAssignees.length > 1,
          );
          if (error) {
            const message = formatDbError(error);
            if (/could not find the function|p_attachments|attachments/i.test(message)) {
              return "Attachments are not enabled yet. Run supabase/migrate_task_attachments.sql in the Supabase SQL Editor.";
            }
            if (isMissingRpc(message)) {
              return "Assign is not set up yet. Run supabase/migrate_multi_assignees.sql in the Supabase SQL Editor.";
            }
            return message;
          }

          const row = (Array.isArray(data) ? data[0] : data) as TaskRow | null;
          if (!row?.id) {
            return "Task was not saved. Run supabase/migrate_fix_task_persistence.sql in the Supabase SQL Editor.";
          }

          let mapped = mapTask(row);
          setTasks((current) => [mapped, ...current.filter((task) => task.id !== mapped.id)]);

          const { data: verified, error: verifyError } = await supabase
            .from("tasks")
            .select("id")
            .eq("id", mapped.id)
            .maybeSingle();
          if (verifyError) return formatDbError(verifyError);
          if (!verified) {
            setTasks((current) => current.filter((task) => task.id !== mapped.id));
            return "Task did not persist in the database. Run supabase/migrate_fix_task_persistence.sql in the Supabase SQL Editor.";
          }

          if (
            cleanSubtasks.length > 0 &&
            mapped.subtasks.length === 0
          ) {
            const { data: updatedSubs, error: subError } = await supabase.rpc("update_task", {
              p_task_id: mapped.id,
              p_title: mapped.title,
              p_description: mapped.description,
              p_subtasks: cleanSubtasks,
            });
            if (subError) {
              const message = formatDbError(subError);
              if (isMissingRpc(message)) {
                return "Subtasks are not enabled yet. Run supabase/migrate_task_subtasks.sql in the Supabase SQL Editor.";
              }
              return message;
            }
            if (updatedSubs) {
              mapped = mapTask(
                (Array.isArray(updatedSubs) ? updatedSubs[0] : updatedSubs) as TaskRow,
              );
              setTasks((current) =>
                current.map((task) => (task.id === mapped.id ? mapped : task)),
              );
            }
          }

          if (files.length > 0) {
            const fileAttachments: TaskAttachment[] = [];
            for (const file of files) {
              const attachmentId = newAttachmentId();
              const path = `${mapped.id}/${attachmentId}-${sanitizeFileName(file.name)}`;
              const { error: uploadError } = await supabase.storage
                .from(ATTACHMENT_BUCKET)
                .upload(path, file, {
                  cacheControl: "3600",
                  upsert: false,
                  contentType: file.type || undefined,
                });
              if (uploadError) {
                return `Task created, but "${file.name}" failed to upload: ${formatDbError(uploadError)}. Run supabase/migrate_task_attachments.sql if Storage is missing.`;
              }
              const { data: publicUrl } = supabase.storage
                .from(ATTACHMENT_BUCKET)
                .getPublicUrl(path);
              fileAttachments.push({
                id: attachmentId,
                kind: "file",
                label: file.name,
                url: publicUrl.publicUrl,
                path,
                mime: file.type || undefined,
                size: file.size,
              });
            }

            const allAttachments = [...mapped.attachments, ...fileAttachments];
            const { data: updated, error: attachError } = await supabase.rpc(
              "set_task_attachments",
              {
                p_task_id: mapped.id,
                p_attachments: allAttachments,
              },
            );
            if (attachError) return formatDbError(attachError);
            if (updated) {
              mapped = mapTask((Array.isArray(updated) ? updated[0] : updated) as TaskRow);
              setTasks((current) =>
                current.map((task) => (task.id === mapped.id ? mapped : task)),
              );
            }
          }

          try {
            await loadTasks();
          } catch (loadError) {
            console.error(loadError);
          }
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
      updateTask: async ({ taskId, title, description, subtasks }) => {
        try {
          const cleanSubtasks = subtasks
            .map((item) => ({
              id: item.id,
              title: item.title.trim(),
              done: Boolean(item.done),
            }))
            .filter((item) => item.title.length > 0);

          const { data, error } = await supabase.rpc("update_task", {
            p_task_id: taskId,
            p_title: title,
            p_description: description,
            p_subtasks: cleanSubtasks,
          });
          if (error) {
            const message = formatDbError(error);
            if (isMissingRpc(message)) {
              return "Task editing is not enabled yet. Run supabase/migrate_task_subtasks.sql in the Supabase SQL Editor.";
            }
            return message;
          }

          if (data) {
            const mapped = mapTask((Array.isArray(data) ? data[0] : data) as TaskRow);
            setTasks((current) =>
              current.map((task) => (task.id === mapped.id ? mapped : task)),
            );
          }

          try {
            await loadTasks();
          } catch (loadError) {
            console.error(loadError);
          }
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
      setSubtaskDone: async (taskId, subtaskId, done) => {
        try {
          const { data, error } = await supabase.rpc("set_subtask_done", {
            p_task_id: taskId,
            p_subtask_id: subtaskId,
            p_done: done,
          });
          if (error) {
            const message = formatDbError(error);
            if (isMissingRpc(message)) {
              return "Subtasks are not enabled yet. Run supabase/migrate_task_subtasks.sql in the Supabase SQL Editor.";
            }
            return message;
          }

          if (data) {
            const mapped = mapTask((Array.isArray(data) ? data[0] : data) as TaskRow);
            setTasks((current) =>
              current.map((task) => (task.id === mapped.id ? mapped : task)),
            );
          }

          try {
            await loadTasks();
          } catch (loadError) {
            console.error(loadError);
          }
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
      claimTask: async (taskId) => {
        try {
          const { error } = await supabase.rpc("claim_task", { p_task_id: taskId });
          if (error) return formatDbError(error);
          await loadTasks();
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
      assignTask: async (taskId, assigneeIds, multiplePeople) => {
        try {
          const resolvedAssignees = resolveAssigneesForDb(
            assigneeIds,
            people,
            assignableRoster,
          );

          const { data, error } = await rpcAssignTask(
            taskId,
            resolvedAssignees,
            multiplePeople && resolvedAssignees.length > 1,
          );
          if (error) {
            const message = formatDbError(error);
            if (isMissingRpc(message)) {
              return "Assign is not set up yet. Run supabase/migrate_multi_assignees.sql in the Supabase SQL Editor.";
            }
            return message;
          }

          if (data) {
            const mapped = mapTask(data as TaskRow);
            setTasks((current) =>
              current.map((task) => (task.id === mapped.id ? mapped : task)),
            );
          }

          try {
            await loadTasks();
          } catch (loadError) {
            console.error(loadError);
          }
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
      setPartners: async (taskId, assigneeIds) => {
        try {
          const resolved = resolveAssigneesForDb(
            assigneeIds,
            people,
            assignableRoster,
          );

          const { data, error } = await supabase.rpc("set_task_partners", {
            p_task_id: taskId,
            p_assignee_ids: resolved,
          });
          if (error) {
            const message = formatDbError(error);
            if (isMissingRpc(message)) {
              return "Partner editing is not enabled yet. Run supabase/migrate_add_task_partners.sql in the Supabase SQL Editor.";
            }
            return message;
          }

          if (data) {
            const mapped = mapTask(data as TaskRow);
            setTasks((current) =>
              current.map((task) => (task.id === mapped.id ? mapped : task)),
            );
          }

          try {
            await loadTasks();
          } catch (loadError) {
            console.error(loadError);
          }
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
      updateStatus: async (taskId, status) => {
        try {
          const { error } = await supabase.rpc("update_task_status", {
            p_task_id: taskId,
            p_status: status,
          });
          if (error) return formatDbError(error);
          await loadTasks();
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
      deleteTask: async (taskId) => {
        try {
          const task = tasks.find((item) => item.id === taskId);
          const paths = (task?.attachments ?? [])
            .map((attachment) => attachment.path)
            .filter((path): path is string => Boolean(path));
          if (paths.length > 0) {
            await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths);
          }
          const { error } = await supabase.rpc("delete_task", { p_task_id: taskId });
          if (error) return formatDbError(error);
          await loadTasks();
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
      discardCompleted: async () => {
        try {
          const { error } = await supabase.rpc("discard_completed");
          if (error) return formatDbError(error);
          await loadTasks();
          return null;
        } catch (error) {
          return formatDbError(error);
        }
      },
    }),
    [
      ready,
      session,
      currentUser,
      authError,
      clearAuthError,
      tasks,
      people,
      internRoster,
      assignableRoster,
      loadTasks,
      resetLocalUser,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}

export function useCurrentUser() {
  return useApp().currentUser;
}

export { supabaseConfigured };
