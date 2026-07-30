/**
 * AdminUsers.jsx — Admin Account Management
 * ============================
 * Admin-only page for managing platform user accounts. Allows administrators to view
 * all registered users, edit usernames/emails/roles, suspend or unsuspend accounts,
 * and delete individual or all recorded session/time data for a selected user.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./AdminUsers.css";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readJsonResponse(res) {
  const text = await res.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Backend returned an invalid response. Redeploy the admin backend routes.");
  }
}

function formatDate(value) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function formatLapTime(ms) {
  if (ms == null) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const fraction = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction
    .toString()
    .padStart(3, "0")}`;
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [form, setForm] = useState({
    username: "",
    email: "",
    role: "user",
    isSuspended: false,
    suspendedReason: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  async function api(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    });

    const data = await readJsonResponse(res);
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function loadUsers() {
    try {
      setLoading(true);
      setMessage("");
      const data = await api("/admin/users");
      const nextUsers = data.users || [];
      setUsers(nextUsers);

      if (!selectedUserId && nextUsers.length > 0) {
        selectUser(nextUsers[0]);
      } else if (selectedUserId) {
        const updatedSelected = nextUsers.find((user) => user.id === selectedUserId);
        if (updatedSelected) syncForm(updatedSelected);
      }
    } catch (err) {
      setMessage(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSessions(userId = selectedUserId) {
    if (!userId) return;

    try {
      setSessionsLoading(true);
      const data = await api(`/admin/users/${userId}/sessions`);
      setSessions(data.sessions || []);
    } catch (err) {
      setMessage(err.message || "Failed to load sessions.");
    } finally {
      setSessionsLoading(false);
    }
  }

  function syncForm(user) {
    setForm({
      username: user.username || "",
      email: user.email || "",
      role: user.role === "admin" || user.isAdmin ? "admin" : "user",
      isSuspended: user.isSuspended === true,
      suspendedReason: user.suspendedReason || "",
    });
  }

  function selectUser(user) {
    setSelectedUserId(user.id);
    syncForm(user);
    loadSessions(user.id);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function saveAccount(e) {
    e.preventDefault();
    if (!selectedUserId) return;

    try {
      setSaving(true);
      setMessage("");

      const data = await api(`/admin/users/${selectedUserId}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });

      setUsers((prev) =>
        prev.map((user) => (user.id === data.user.id ? data.user : user))
      );
      syncForm(data.user);
      setMessage("Account updated.");
    } catch (err) {
      setMessage(err.message || "Failed to update account.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSuspension() {
    if (!selectedUserId) return;

    try {
      setSaving(true);
      setMessage("");

      const data = await api(`/admin/users/${selectedUserId}`, {
        method: "PATCH",
        body: JSON.stringify({
          isSuspended: !form.isSuspended,
          suspendedReason: form.suspendedReason,
        }),
      });

      setUsers((prev) =>
        prev.map((user) => (user.id === data.user.id ? data.user : user))
      );
      syncForm(data.user);
      setMessage(data.user.isSuspended ? "User suspended." : "User unsuspended.");
    } catch (err) {
      setMessage(err.message || "Failed to update suspension.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSession(sessionId) {
    if (!selectedUserId) return;

    const ok = window.confirm("Delete this recorded session/time data?");
    if (!ok) return;

    try {
      setMessage("");
      await api(`/admin/users/${selectedUserId}/sessions/${sessionId}`, {
        method: "DELETE",
      });
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      setMessage("Session deleted.");
    } catch (err) {
      setMessage(err.message || "Failed to delete session.");
    }
  }

  async function deleteAllSessions() {
    if (!selectedUserId) return;

    const ok = window.confirm(
      `Delete all recorded session/time data for ${selectedUser?.username || "this user"}?`
    );
    if (!ok) return;

    try {
      setMessage("");
      const data = await api(`/admin/users/${selectedUserId}/sessions`, {
        method: "DELETE",
      });
      setSessions([]);
      setMessage(`Deleted ${data.deletedCount || 0} sessions.`);
    } catch (err) {
      setMessage(err.message || "Failed to delete sessions.");
    }
  }

  return (
    <div className="page-container admin-users-page">
      <div className="admin-users-header">
        <div>
          <h1>
            Admin <span className="text-blue">Accounts</span>
          </h1>
          <p>Manage users, suspensions, roles, and recorded session times.</p>
        </div>

        <Link to="/calibrate" className="admin-users-link">
          Track Calibration
        </Link>
      </div>

      {message && <p className="admin-users-message">{message}</p>}

      <div className="admin-users-layout">
        <section className="card admin-users-list">
          <div className="admin-section-title">
            <h2>Accounts</h2>
            <button type="button" onClick={loadUsers} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="admin-users-scroll">
            {users.map((user) => (
              <button
                type="button"
                key={user.id}
                className={`admin-user-row ${user.id === selectedUserId ? "active" : ""}`}
                onClick={() => selectUser(user)}
              >
                <strong>{user.username || user.email || user.id}</strong>
                <span>{user.email || "-"}</span>
                <small>
                  {user.role === "admin" || user.isAdmin ? "Admin" : "User"}
                  {user.isSuspended ? " - Suspended" : ""}
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="card admin-account-editor">
          <h2>Edit Account</h2>

          {!selectedUser ? (
            <p>Select a user.</p>
          ) : (
            <form onSubmit={saveAccount}>
              <label>
                Username
                <input
                  value={form.username}
                  onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </label>

              <label>
                Role
                <select
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label>
                Suspension reason
                <input
                  value={form.suspendedReason}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, suspendedReason: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </label>

              <div className="admin-editor-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save Account"}
                </button>
                <button type="button" onClick={toggleSuspension} disabled={saving}>
                  {form.isSuspended ? "Unsuspend User" : "Suspend User"}
                </button>
              </div>

              <div className="admin-account-meta">
                <p>Created: {formatDate(selectedUser.createdAt)}</p>
                <p>Last seen: {formatDate(selectedUser.lastSeenAt)}</p>
                <p>User ID: {selectedUser.id}</p>
              </div>
            </form>
          )}
        </section>
      </div>

      <section className="card admin-sessions-card">
        <div className="admin-section-title">
          <h2>Recorded Times</h2>
          <div>
            <button type="button" onClick={() => loadSessions()} disabled={!selectedUserId || sessionsLoading}>
              {sessionsLoading ? "Loading..." : "Refresh Times"}
            </button>
            <button type="button" className="danger" onClick={deleteAllSessions} disabled={!selectedUserId}>
              Delete All Times
            </button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <p>No recorded sessions for this user.</p>
        ) : (
          <div className="admin-session-list">
            {sessions.map((session) => {
              const summary = session.processedSummary || {};

              return (
                <div className="admin-session-row" key={session.id}>
                  <div>
                    <strong>{session.trackName || "Unknown Track"}</strong>
                    <span>Started: {formatDate(session.startedAt)}</span>
                    <span>Best Lap: {formatLapTime(summary.bestLapTimeMs)}</span>
                    <span>Top Speed: {summary.topSpeedKph ?? 0} km/h</span>
                  </div>
                  <button type="button" className="danger" onClick={() => deleteSession(session.id)}>
                    Delete Time
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
