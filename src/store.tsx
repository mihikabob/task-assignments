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
import type { Person, Session, Task, TaskStatus } from "./types";

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
    assigneeId: string | null;
  }) => Promise<string | null>;
  claimTask: (taskId: string) => Promise<string | null>;
  assignTask: (taskId: string, assigneeId: string | null) => Promise<string | null>;
  updateStatus: (taskId: string, status: TaskStatus) => Promise<string | null>;
  deleteTask: (taskId: string) => Promise<string | null>;
  discardCompleted: () => Promise<string | null>;
}

const AppContext = createContext<AppState | null>(null);

function profileToSession(profile: Person): Session {
  return { userId: profile.email, role: profile.role };
}

/** Prefer a live roster email for the same person so assign_task validates. */
function resolveAssigneeForDb(
  assigneeId: string | null,
  livePeople: Person[],
  roster: Person[],
): string | null {
  if (!assigneeId) return null;
  if (livePeople.some((person) => person.id === assigneeId)) return assigneeId;

  const named =
    roster.find((person) => person.id === assigneeId) ??
    seedPeople.find((person) => person.id === assigneeId);
  if (!named) return assigneeId;

  const nameKey = named.name.trim().toLowerCase();
  const liveMatch =
    livePeople.find(
      (person) =>
        person.name.trim().toLowerCase() === nameKey && person.email.endsWith("@mvla.net"),
    ) ??
    livePeople.find((person) => person.name.trim().toLowerCase() === nameKey);
  if (liveMatch) return liveMatch.id;

  const school = seedPeople.find(
    (person) =>
      person.name.trim().toLowerCase() === nameKey && person.email.endsWith("@mvla.net"),
  );
  return school?.id ?? named.id;
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
      addTask: async ({ title, description, assigneeId }) => {
        try {
          const resolvedAssignee = resolveAssigneeForDb(
            assigneeId,
            people,
            assignableRoster,
          );
          const { data, error } = await supabase.rpc("add_task", {
            p_title: title,
            p_description: description,
            p_assignee_id: resolvedAssignee,
          });
          if (error) return formatDbError(error);

          const row = (Array.isArray(data) ? data[0] : data) as TaskRow | null;
          if (!row?.id) {
            return "Task was not saved. Run supabase/migrate_fix_task_persistence.sql in the Supabase SQL Editor.";
          }

          const mapped = mapTask(row);
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
      assignTask: async (taskId, assigneeId) => {
        try {
          const resolvedAssignee = resolveAssigneeForDb(
            assigneeId,
            people,
            assignableRoster,
          );
          const previous = tasks.find((task) => task.id === taskId);

          // Optimistic UI so the leader dropdown updates immediately.
          setTasks((current) =>
            current.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    assigneeId: resolvedAssignee,
                    assignedById: resolvedAssignee
                      ? (session?.userId ?? task.assignedById)
                      : null,
                    status: resolvedAssignee
                      ? task.status === "unclaimed"
                        ? "just_started"
                        : task.status
                      : "unclaimed",
                    updatedAt: new Date().toISOString(),
                  }
                : task,
            ),
          );

          const { data, error } = await supabase.rpc("assign_task", {
            p_task_id: taskId,
            p_assignee_id: resolvedAssignee,
          });
          if (error) {
            if (previous) {
              setTasks((current) =>
                current.map((task) => (task.id === taskId ? previous : task)),
              );
            }
            return formatDbError(error);
          }
          if (data) {
            const mapped = mapTask(data as TaskRow);
            setTasks((current) =>
              current.map((task) => (task.id === mapped.id ? mapped : task)),
            );
          } else {
            try {
              await loadTasks();
            } catch (loadError) {
              console.error(loadError);
            }
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
