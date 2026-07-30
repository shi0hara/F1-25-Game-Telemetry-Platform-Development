/**
 * Navbar.jsx — Primary Navigation Bar
 * ============================
 * Renders the top navigation bar with the F1 Telemetry brand mark and route links
 * (Dashboard, Live, Leaderboards, Setups, Profile). Handles protected route gating
 * for unauthenticated users and provides admin-specific links and logout functionality.
 */
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";

export default function Navbar({ username, isAdmin = false, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navTabs = [
    { to: "/", label: "Dashboard" },
    { to: "/live", label: "Live", protected: true },
    { to: "/leaderboard", label: "Leaderboards" },
    { to: "/setups", label: "Setups" },
    { to: "/profile", label: "Profile", protected: true },
  ];

  const handleProtectedNavigation = (e) => {
    if (!username) {
      e.preventDefault();
      alert("Please log in first to access this page!");
    }
  };

  return (
    <header className="nav-shell">
      <nav className="navbar" aria-label="Primary">
        <div className="navbar-brand">
          <span className="brand-f1">F1</span>{" "}
          <span className="brand-text">Telemetry</span>
        </div>

        <div className="navbar-links">
          {navTabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              onClick={tab.protected ? handleProtectedNavigation : undefined}
              className={location.pathname === tab.to ? "active" : ""}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="navbar-user">
          {username ? (
            <>
              <span className="username">Driver: {username}</span>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => navigate("/admin")}
                  className="btn-admin"
                >
                  Admin
                </button>
              )}

              <button
                onClick={() => {
                  onLogout();
                  navigate("/");
                }}
                className="btn-logout"
              >
                Pit Stop (Logout)
              </button>
            </>
          ) : (
            <Link to="/login" className="login-trigger">
              Login
            </Link>
          )}
        </div>
      </nav>

    </header>
  );
}
