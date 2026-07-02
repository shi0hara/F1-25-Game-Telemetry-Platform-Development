import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Dashboard from "./pages/Dashboard";
import LiveTelemetry from "./pages/LiveTelemetry";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import AdminUsers from "./pages/AdminUsers";
import useActiveSession from "./hooks/useActiveSession";
import TrackCalibration from "./pages/TrackCalibration";

function getStoredUser() {
  try {
    const storedUser = localStorage.getItem("f1User");
    if (storedUser) return JSON.parse(storedUser);

    const legacyUsername = localStorage.getItem("f1_username");
    return legacyUsername
      ? { username: legacyUsername, role: "user", isAdmin: false }
      : null;
  } catch {
    return null;
  }
}

function isAdminUser(user) {
  return user?.isAdmin === true || user?.role === "admin";
}

const ProtectedRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const AdminRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminUser(user)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default function App() {
  const [user, setUser] = useState(getStoredUser);
  const username = user?.username || null;
  const { sessionId, loading: sessionLoading, error: sessionError } =
    useActiveSession(username);

  useEffect(() => {
    if (user) {
      localStorage.setItem("f1User", JSON.stringify(user));
      localStorage.setItem("f1_username", user.username);
    } else {
      localStorage.removeItem("f1User");
      localStorage.removeItem("f1AuthToken");
      localStorage.removeItem("f1_username");
    }
  }, [user]);

  const handleLogin = (nextUser, token) => {
    const normalizedUser =
      typeof nextUser === "string"
        ? { username: nextUser, role: "user", isAdmin: false }
        : nextUser;

    if (token) {
      localStorage.setItem("f1AuthToken", token);
    }

    setUser(normalizedUser);
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <BrowserRouter>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Navbar
          username={username}
          isAdmin={isAdminUser(user)}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />

        {user && sessionLoading && (
          <div style={{ textAlign: "center", padding: "8px", background: "#1a1a2e", color: "#aaa" }}>
            Loading session...
          </div>
        )}

        {user && sessionError && (
          <div style={{ textAlign: "center", padding: "8px", background: "#2a1a1a", color: "#f87171" }}>
            Session error: {sessionError}
          </div>
        )}

        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/login"
              element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/" replace />}
            />
            <Route path="/contact" element={<Contact />} />
            <Route
              path="/live"
              element={
                <ProtectedRoute user={user}>
                  <LiveTelemetry sessionId={sessionId} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leaderboard"
              element={
                <ProtectedRoute user={user}>
                  <Leaderboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute user={user}>
                  <Profile username={username} sessionId={sessionId} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute user={user}>
                  <AdminUsers />
                </AdminRoute>
              }
            />
            <Route
              path="/calibrate"
              element={
                <AdminRoute user={user}>
                  <TrackCalibration username={username} />
                </AdminRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </BrowserRouter>
  );
}
