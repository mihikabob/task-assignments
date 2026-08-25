import { useState } from "react";
import AddTaskModal from "./AddTaskModal";
import AllTasks from "./AllTasks";
import Avatar from "./Avatar";
import ByIntern from "./ByIntern";
import Login from "./Login";
import MyTasks from "./MyTasks";
import ProfileDrawer from "./ProfileDrawer";
import TaskDetail from "./TaskDetail";
import { useApp, useCurrentUser } from "./store";
import type { Page } from "./types";

export default function App() {
  const { session, ready, currentUser } = useApp();

  if (!ready) {
    return (
      <div className="login-wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!session || !currentUser) return <Login />;
  return <Workspace key={session.userId} />;
}

function Workspace() {
  const user = useCurrentUser();
  const [page, setPage] = useState<Page>("all-tasks");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  if (!user) return <Login />;

  const isLeader = user.role === "leader";
  const homePage: Page = !isLeader && page === "by-intern" ? "all-tasks" : page;
  const navItems: { id: Page; label: string }[] = isLeader
    ? [
        { id: "all-tasks", label: "All tasks" },
        { id: "my-tasks", label: "My tasks" },
        { id: "by-intern", label: "Tasks by intern" },
      ]
    : [
        { id: "all-tasks", label: "Master list" },
        { id: "my-tasks", label: "My tasks" },
      ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt="MVHS Tech Internship" />
          <div>
            <div className="brand-name">Tech Internship Task Hub</div>
            <div className="brand-sub">
              {isLeader ? "Leader workspace" : "Intern workspace"}
            </div>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-btn ${homePage === item.id ? "active" : ""}`}
              onClick={() => {
                setTaskId(null);
                setPage(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          className={`who ${showProfile ? "active" : ""}`}
          onClick={() => setShowProfile(true)}
        >
          <Avatar person={user} />
          <span className="who-copy">
            <span className="who-name">{user.name}</span>
            <span className="who-role">{isLeader ? "Leader" : "Intern"}</span>
          </span>
        </button>
      </header>

      <main className="page">
        {taskId ? (
          <TaskDetail taskId={taskId} onBack={() => setTaskId(null)} />
        ) : (
          <>
            {homePage === "all-tasks" && (
              <AllTasks onAdd={() => setShowAdd(true)} onOpenTask={setTaskId} />
            )}
            {homePage === "my-tasks" && <MyTasks onOpenTask={setTaskId} />}
            {homePage === "by-intern" && isLeader && <ByIntern onOpenTask={setTaskId} />}
          </>
        )}
      </main>

      {showAdd && isLeader && <AddTaskModal onClose={() => setShowAdd(false)} />}
      {showProfile && <ProfileDrawer onClose={() => setShowProfile(false)} />}
    </div>
  );
}
