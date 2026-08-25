import { useState, type FormEvent } from "react";
import { loginNames } from "./data";
import { supabaseConfigured, useApp } from "./store";

export default function Login() {
  const { signInWithGoogle, signInWithNamePassword, authError, clearAuthError } = useApp();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"password" | "google" | null>(null);

  const displayError = error || authError || "";

  async function handlePasswordSignIn(event: FormEvent) {
    event.preventDefault();
    setLoading("password");
    setError("");
    clearAuthError();
    const message = await signInWithNamePassword(name, password);
    if (message) setError(message);
    setLoading(null);
  }

  async function handleGoogleSignIn() {
    setLoading("google");
    setError("");
    clearAuthError();
    const message = await signInWithGoogle();
    if (message) setError(message);
    setLoading(null);
  }

  if (!supabaseConfigured) {
    return (
      <div className="login-wrap">
        <div className="login-copy">
          <h1>Tech Internship Task Hub</h1>
        </div>
        <section className="login">
          <div className="login-shell">
            <div className="login-form">
              <p className="error">Supabase is not configured for this deployment.</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-copy">
        <h1>Tech Internship Task Hub</h1>
        <p>Sign in to open the leader or intern workspace for your role.</p>
      </div>

      <section className="login">
        <div className="login-shell">
          <div className="login-form">
            <p className="page-kicker">Sign in</p>
            <h2 style={{ fontSize: 28 }}>Welcome back</h2>

            <form onSubmit={handlePasswordSignIn}>
              <label>
                Full name
                <input
                  className="field"
                  list="roster-names"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="First Last"
                  autoComplete="username"
                  required
                />
                <datalist id="roster-names">
                  {loginNames.map((loginName) => (
                    <option key={loginName} value={loginName} />
                  ))}
                </datalist>
              </label>

              <label>
                Password
                <input
                  className="field"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
              </label>

              <button
                className="btn primary"
                type="submit"
                style={{ width: "100%" }}
                disabled={loading !== null}
              >
                {loading === "password" ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="login-divider">
              <span>or</span>
            </div>

            <button
              className="btn ghost"
              type="button"
              style={{ width: "100%" }}
              onClick={handleGoogleSignIn}
              disabled={loading !== null}
            >
              {loading === "google" ? "Redirecting…" : "Sign in with Google"}
            </button>

            {displayError && <p className="error">{displayError}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
