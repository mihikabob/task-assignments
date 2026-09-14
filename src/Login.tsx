import { useState, type FormEvent } from "react";
import { loginNames } from "./data";
import { supabaseConfigured, useApp } from "./store";

type LoginMode = "signin" | "create";

export default function Login() {
  const {
    signInWithGoogle,
    signInWithNamePassword,
    createAccount,
    authError,
    clearAuthError,
  } = useApp();
  const [mode, setMode] = useState<LoginMode>("signin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"password" | "create" | "google" | null>(null);

  const displayError = error || authError || "";

  function switchMode(next: LoginMode) {
    setMode(next);
    setError("");
    clearAuthError();
    setPassword("");
    setConfirmPassword("");
  }

  async function handlePasswordSignIn(event: FormEvent) {
    event.preventDefault();
    setLoading("password");
    setError("");
    clearAuthError();
    const message = await signInWithNamePassword(name, password);
    if (message) setError(message);
    setLoading(null);
  }

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading("create");
    setError("");
    clearAuthError();
    const message = await createAccount(name, password);
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
            <div className="login-mode-tabs" role="tablist" aria-label="Sign in options">
              <button
                type="button"
                role="tab"
                className={mode === "signin" ? "active" : ""}
                aria-selected={mode === "signin"}
                onClick={() => switchMode("signin")}
                disabled={loading !== null}
              >
                Log in
              </button>
              <button
                type="button"
                role="tab"
                className={mode === "create" ? "active" : ""}
                aria-selected={mode === "create"}
                onClick={() => switchMode("create")}
                disabled={loading !== null}
              >
                Create account
              </button>
            </div>

            {mode === "signin" ? (
              <>
                <p className="page-kicker">Sign in</p>
                <h2 style={{ fontSize: 28 }}>Welcome back</h2>
                <p className="muted login-hint">
                  Use the password you chose when you created your account.
                </p>

                <form onSubmit={handlePasswordSignIn}>
                  <label>
                    Full name
                    <select
                      className="field"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    >
                      <option value="">Select your name</option>
                      {loginNames.map((loginName) => (
                        <option key={loginName} value={loginName}>
                          {loginName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Password
                    <input
                      className="field"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Your password"
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
                    {loading === "password" ? "Signing in…" : "Log in with name and password"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="page-kicker">Create account</p>
                <h2 style={{ fontSize: 28 }}>Set your password</h2>

                <form onSubmit={handleCreateAccount}>
                  <label>
                    Full name
                    <select
                      className="field"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    >
                      <option value="">Select your name</option>
                      {loginNames.map((loginName) => (
                        <option key={loginName} value={loginName}>
                          {loginName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Password
                    <input
                      className="field"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </label>

                  <label>
                    Confirm password
                    <input
                      className="field"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </label>

                  <button
                    className="btn primary"
                    type="submit"
                    style={{ width: "100%" }}
                    disabled={loading !== null}
                  >
                    {loading === "create" ? "Creating…" : "Create account"}
                  </button>
                </form>
              </>
            )}

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
