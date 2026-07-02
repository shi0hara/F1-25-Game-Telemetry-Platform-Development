import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";

export default function Navbar({ username, onLogin, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState("");
  const [loginUser, setLoginUser] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    if (email && loginUser) {
      onLogin(loginUser);
    }
  };

  const handleProtectedNavigation = (e) => {
    if (!username) {
      e.preventDefault();
      alert("Please log in first via the navbar to access this page!");
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-f1">F1</span> <span className="brand-text">Telemetry</span>
      </div>
      <div className="navbar-links">
        <Link to="/" className={location.pathname === "/" ? "active" : ""}>Dashboard</Link>
        <Link to="/live" onClick={handleProtectedNavigation} className={location.pathname === "/live" ? "active" : ""}>Live</Link>
        <Link to="/leaderboard" onClick={handleProtectedNavigation} className={location.pathname === "/leaderboard" ? "active" : ""}>Leaderboards</Link>
        <Link to="/profile" onClick={handleProtectedNavigation} className={location.pathname === "/profile" ? "active" : ""}>Profile</Link>
      </div>
      <div className="navbar-user">
        {username ? (
          <>
            <span className="username">Driver: {username}</span>
            <button onClick={() => {
              onLogout();
              navigate("/");
            }} className="btn-logout">Pit Stop (Logout)</button>
          </>
        ) : (
          <div className="login-dropdown-container">
            <Link to="/login" className="login-trigger">Login ▼</Link>
            <div className="login-dropdown">
              <form onSubmit={handleLogin} className="navbar-login-form">
                <input 
                  type="text" 
                  placeholder="Username" 
                  value={loginUser} 
                  onChange={(e) => setLoginUser(e.target.value)} 
                  required
                  className="nav-input"
                />
                <input 
                  type="email" 
                  placeholder="Email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required
                  className="nav-input"
                />
                <button type="submit" className="btn-primary" style={{width: '100%', padding: '10px 5px', fontSize: '12px'}}>START ENGINE</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}