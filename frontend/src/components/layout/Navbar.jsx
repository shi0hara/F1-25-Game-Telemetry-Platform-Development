import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";

export default function Navbar({ username, isAdmin = false, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleProtectedNavigation = (e) => {
    if (!username) {
      e.preventDefault();
      alert("Please log in first to access this page!");
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-f1">F1</span>{" "}
        <span className="brand-text">Telemetry</span>
      </div>

      <div className="navbar-links">
        <Link to="/" className={location.pathname === "/" ? "active" : ""}>
          Dashboard
        </Link>
        <Link
          to="/live"
          onClick={handleProtectedNavigation}
          className={location.pathname === "/live" ? "active" : ""}
        >
          Live
        </Link>
        <Link
          to="/leaderboard"
          className={location.pathname === "/leaderboard" ? "active" : ""}
        >
          Leaderboards
        </Link>
        <Link
          to="/profile"
          onClick={handleProtectedNavigation}
          className={location.pathname === "/profile" ? "active" : ""}
        >
          Profile
        </Link>
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
  );
}
