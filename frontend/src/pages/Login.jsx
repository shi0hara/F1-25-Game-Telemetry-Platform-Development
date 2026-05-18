import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (email && username) {
      onLogin(username);
      navigate("/");
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Telemetry Access</h1>
        <p className="login-subtitle">Enter your details to track your F1 25 data and receive AI coaching.</p>
        
        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>Username</label>
            <input 
              type="text" 
              placeholder="e.g. SpeedDemon99" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
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
          
          <button type="submit" className="btn-primary login-btn">Ignition Sequence Start</button>
        </form>
      </div>
    </div>
  );
}
