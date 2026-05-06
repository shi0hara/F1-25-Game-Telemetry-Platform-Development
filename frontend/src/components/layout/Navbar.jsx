import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav>
      <Link to="/">Dashboard</Link>{" | "}
      <Link to="/live">Live Telemetry</Link>{" | "}
      <Link to="/leaderboard">Leaderboard</Link>{" | "}
      <Link to="/review">Performance Review</Link>{" | "}
      <Link to="/insights">AI Insights</Link>
    </nav>
  );
}