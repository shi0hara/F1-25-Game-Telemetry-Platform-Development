import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";

export default function Navbar({ username, isAdmin = false, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentDate = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
  });
  const navTabs = [
    { to: "/", label: "Dashboard" },
    { to: "/live", label: "Live", protected: true },
    { to: "/leaderboard", label: "Leaderboards" },
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

      <div className="nav-subbar" aria-label="Utility">
        <div className="nav-utility-pills">
          <span className="utility-pill">Race Week</span>
          <span className="utility-pill">Session: {currentDate}</span>
          <span className="utility-pill muted">Track Time 07:54</span>
        </div>
      </div>
    </header>
  );
}
