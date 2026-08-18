import { useState } from "react";
import { supabaseConfigured, useApp } from "./store";

export default function Login() {
  const { signInWithGoogle } = useApp();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    setError("");
    const message = await signInWithGoogle();
    if (message) setError(message);
    setLoading(false);
  }

  if (!supabaseConfigured) {
    return (
      <div className="login-wrap">
        <section className="login">
          <div className="login-copy">
            <div className="brand-mark" style={{ background: "#c9842a" }}>
              TH
            </div>
            <h1>Tech Internship Task Hub</h1>
          </div>
          <div className="login-form">
            <p className="error">Supabase is not configured for this deployment.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <section className="login">
        <div className="login-copy">
          <div className="brand-mark" style={{ background: "#c9842a" }}>
            TH
          </div>
          <h1>Tech Internship Task Hub</h1>
        </div>

        <div className="login-form">
          <p className="page-kicker">Sign in</p>
          <h2 style={{ fontSize: 28 }}>Welcome back</h2>

          <button
            className="btn primary"
            type="button"
            style={{ width: "100%", marginTop: 20 }}
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? "Redirecting…" : "Sign in with Google"}
          </button>

          {error && <p className="error">{error}</p>}
        </div>
      </section>
    </div>
  );
}
