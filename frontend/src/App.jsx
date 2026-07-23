import { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import useActiveSession from "./hooks/useActiveSession";
import { auth } from "./firebase";
import {
  notifyLocalListenerLogout,
  pairLocalListenerAfterLogin,
} from "./services/localListenerService";

const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const LapPerformanceAnalysis = lazy(() => import("./pages/LapPerformanceAnalysis"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const LiveTelemetry = lazy(() => import("./pages/LiveTelemetry"));
const Profile = lazy(() => import("./pages/Profile"));
const RecommendedSetups = lazy(() => import("./pages/RecommendedSetups"));
const SessionDetails = lazy(() => import("./pages/SessionDetails"));
const TrackCalibration = lazy(() => import("./pages/TrackCalibration"));

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

function RouteLoading() {
  return (
    <div className="card route-loading-card">
      Loading page...
    </div>
  );
}

const AnimatedAppRoutes = ({ user, sessionId, handleLogin, username }) => {
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;

  return (
    <div key={routeKey} className="route-transition-shell">
      <Suspense fallback={<RouteLoading />}>
        <Routes location={location}>
          <Route path="/" element={<Dashboard currentUser={user} />} />
          <Route
            path="/login"
            element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/" replace />}
          />
          <Route path="/contact" element={<Contact />} />
          <Route
            path="/live"
            element={
              <ProtectedRoute user={user}>
                <LiveTelemetry currentUser={user} sessionId={sessionId} />
              </ProtectedRoute>
            }
          />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/setups" element={<RecommendedSetups />} />
          <Route
            path="/analysis/:sessionId/lap/:lapId"
            element={<LapPerformanceAnalysis />}
          />
          <Route
            path="/session/:sessionId"
            element={
              <ProtectedRoute user={user}>
                <SessionDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute user={user}>
                <Profile username={username} currentUser={user} sessionId={sessionId} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/edit-profile"
            element={
              <ProtectedRoute user={user}>
                <EditProfile username={username} currentUser={user} />
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
      </Suspense>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(getStoredUser);
  const username = user?.username || null;
  const { sessionId, loading: sessionLoading, error: sessionError } =
    useActiveSession(user);

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

  useEffect(() => {
    if (!user) return;

    const authToken = localStorage.getItem("f1AuthToken");
    if (!authToken) return;

    let cancelled = false;
    let retryTimer = null;
    let attempts = 0;

    async function pairWithLocalListener() {
      attempts += 1;
      let paired = false;

      try {
        const result = await pairLocalListenerAfterLogin({ user, authToken });
        paired = Boolean(result?.paired);
      } catch {
        if (cancelled) return;
      }

      if (cancelled) return;

      if (paired) {
        attempts = 0;
      }

      const retryDelayMs = paired ? 10000 : attempts < 8 ? 3000 : 10000;
      retryTimer = window.setTimeout(pairWithLocalListener, retryDelayMs);
    }

    pairWithLocalListener();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
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

  const handleLogout = async () => {
    await notifyLocalListenerLogout();
    await signOut(auth).catch(() => {});
    setUser(null);
  };

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar
          username={username}
          isAdmin={isAdminUser(user)}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />

        {user && sessionLoading && (
          <div className="session-banner loading">
            Loading session...
          </div>
        )}

        {user && sessionError && (
          <div className="session-banner error">
            Session error: {sessionError}
          </div>
        )}

        <main className="app-main">
          <AnimatedAppRoutes
            user={user}
            sessionId={sessionId}
            handleLogin={handleLogin}
            username={username}
          />
        </main>

        <Footer />
      </div>
    </BrowserRouter>
  );
}
