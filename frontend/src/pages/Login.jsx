import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const isSignup = mode === "signup";

  function resetForm(nextMode) {
    setMode(nextMode);
    setError("");
    setName("");
    setEmail("");
    setIdentifier("");
    setPassword("");
    setConfirmPassword("");
  }

  async function submitAuth(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Authentication failed.");
    }

    return data;
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");

    if (isSignup && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsSubmitting(true);

      const data = isSignup
        ? await submitAuth("/auth/signup", {
            username: name,
            email,
            password,
            confirmPassword,
          })
        : await submitAuth("/auth/login", {
            identifier,
            password,
          });

      window.localStorage.setItem("f1AuthToken", data.token);
      window.localStorage.setItem("f1User", JSON.stringify(data.user));

      onLogin(data.user, data.token);
      navigate("/");
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Telemetry Access</h1>
        <p className="login-subtitle">
          {isSignup
            ? "Create your F1 25 telemetry account."
            : "Log in to track your F1 25 data and receive AI coaching."}
        </p>

        <div className="auth-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={!isSignup ? "active" : ""}
            onClick={() => resetForm("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={isSignup ? "active" : ""}
            onClick={() => resetForm("signup")}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {isSignup ? (
            <>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="e.g. SpeedDemon99"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label>Name or email</label>
              <input
                type="text"
                placeholder="SpeedDemon99 or user@example.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          {isSignup && (
            <div className="form-group">
              <label>Confirm password</label>
              <input
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary login-btn" disabled={isSubmitting}>
            {isSubmitting
              ? "Please wait..."
              : isSignup
                ? "Create Account"
                : "Ignition Sequence Start"}
          </button>
        </form>
      </div>
    </div>
  );
}
