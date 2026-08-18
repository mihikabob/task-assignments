import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatDbError, mapProfile, mapRoster, mapTask, type ProfileRow, type RosterRow, type TaskRow } from "./lib/database";
import { supabase, supabaseConfigured } from "./lib/supabase";
import type { Person, Session, Task, TaskStatus } from "./types";

interface AppState {
  ready: boolean;
  session: Session | null;
  tasks: Task[];
  people: Person[];
  internRoster: Person[];
  assignableRoster: Person[];
  personById: (id: string | null) => Person | undefined;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  addTask: (input: { title: string; description: string; assigneeId: string | null }) => Promise<string | null>;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

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
    const person = mapProfile(profile as ProfileRow);
    setSession(profileToSession(person));
    await Promise.all([loadPeople(), loadTasks()]);
  }, [loadPeople, loadTasks]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }

    let mounted = true;

    async function init() {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();

      if (authSession) {
        try {
          await bootstrapUser();
        } catch {
          await supabase.auth.signOut();
          if (mounted) setSession(null);
        }
      }

      if (mounted) setReady(true);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !authSession) {
        setSession(null);
        setPeople([]);
        setTasks([]);
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        try {
          await bootstrapUser();
        } catch {
          await supabase.auth.signOut();
          setSession(null);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [bootstrapUser]);

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
    () => people.filter((person) => person.role === "intern").sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  const assignableRoster = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  const value = useMemo<AppState>(
    () => ({
      ready,
      session,
      tasks,
      people,
      internRoster,
      assignableRoster,
      personById: (id) => (id ? people.find((person) => person.id === id) : undefined),
      signInWithGoogle: async () => {
        if (!supabaseConfigured) {
          return "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
        }
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
            queryParams: { hd: "mvla.net" },
          },
        });
        return error ? formatDbError(error) : null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setPeople([]);
        setTasks([]);
      },
      addTask: async ({ title, description, assigneeId }) => {
        const { error } = await supabase.rpc("add_task", {
          p_title: title,
          p_description: description,
          p_assignee_id: assigneeId,
        });
        if (error) return formatDbError(error);
        await loadTasks();
        return null;
      },
      claimTask: async (taskId) => {
        const { error } = await supabase.rpc("claim_task", { p_task_id: taskId });
        if (error) return formatDbError(error);
        await loadTasks();
        return null;
      },
      assignTask: async (taskId, assigneeId) => {
        const { error } = await supabase.rpc("assign_task", {
          p_task_id: taskId,
          p_assignee_id: assigneeId,
        });
        if (error) return formatDbError(error);
        await loadTasks();
        return null;
      },
      updateStatus: async (taskId, status) => {
        const { error } = await supabase.rpc("update_task_status", {
          p_task_id: taskId,
          p_status: status,
        });
        if (error) return formatDbError(error);
        await loadTasks();
        return null;
      },
      deleteTask: async (taskId) => {
        const { error } = await supabase.rpc("delete_task", { p_task_id: taskId });
        if (error) return formatDbError(error);
        await loadTasks();
        return null;
      },
      discardCompleted: async () => {
        const { error } = await supabase.rpc("discard_completed");
        if (error) return formatDbError(error);
        await loadTasks();
        return null;
      },
    }),
    [ready, session, tasks, people, internRoster, assignableRoster, loadTasks],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}

export function useCurrentUser() {
  const { session, people } = useApp();
  if (!session) return null;
  return people.find((person) => person.id === session.userId) ?? null;
}

export { supabaseConfigured };
