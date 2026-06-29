
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
import useActiveSession from "./hooks/useActiveSession";
import TrackCalibration from "./pages/TrackCalibration";

const ProtectedRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/" />;
  }
  return children;
};

export default function App() {
  const [user, setUser] = useState(() => {
    return localStorage.getItem("f1_username") || null;
  });
  const { sessionId, loading: sessionLoading, error: sessionError } = useActiveSession(user);

  useEffect(() => {
    if (user) {
      localStorage.setItem("f1_username", user);
    } else {
      localStorage.removeItem("f1_username");
    }
  }, [user]);

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar username={user} onLogin={setUser} onLogout={() => setUser(null)} />
        
        {user && sessionLoading && (
          <div style={{ textAlign: 'center', padding: '8px', background: '#1a1a2e', color: '#aaa' }}>
            Loading session...
          </div>
        )}
        {user && sessionError && (
          <div style={{ textAlign: 'center', padding: '8px', background: '#2a1a1a', color: '#f87171' }}>
            Session error: {sessionError}
          </div>
        )}

        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={!user ? <Login onLogin={setUser} /> : <Navigate to="/" />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/live" element={<ProtectedRoute user={user}><LiveTelemetry sessionId={sessionId} /></ProtectedRoute>} />
            <Route path="/leaderboard" element={<ProtectedRoute user={user}><Leaderboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute user={user}><Profile username={user} sessionId={sessionId} /></ProtectedRoute>} />
            <Route
              path="/calibrate"
              element={
                <ProtectedRoute user={user}>
                  <TrackCalibration username={user} />
                </ProtectedRoute>
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
