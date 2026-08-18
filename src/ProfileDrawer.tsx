import Avatar from "./Avatar";
import { useApp, useCurrentUser } from "./store";

export default function ProfileDrawer({ onClose }: { onClose: () => void }) {
  const { signOut } = useApp();
  const user = useCurrentUser();
  if (!user) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <p className="page-kicker">Profile</p>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 16 }}>
          <Avatar person={user} size="lg" />
          <div>
            <h2 style={{ fontSize: 26 }}>{user.name}</h2>
            <span className={`badge ${user.role}`} style={{ marginTop: 8 }}>
              {user.role === "leader" ? "Leader" : "Intern"}
            </span>
          </div>
        </div>

        <div className="profile-block">
          <div className="profile-row">
            <span>Role</span>
            <strong>{user.role === "leader" ? "Leader" : "Intern"}</strong>
          </div>
          <div className="profile-row">
            <span>Email</span>
            <strong>{user.email}</strong>
          </div>
        </div>

        <button
          className="btn ghost"
          onClick={() => {
            void signOut();
            onClose();
          }}
        >
          Sign out
        </button>
      </aside>
    </div>
  );
}
