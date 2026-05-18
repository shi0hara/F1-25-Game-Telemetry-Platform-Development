export default function Profile({ username }) {
  return (
    <div className="page-container">
      <h1>Driver <span className="text-green">Profile</span></h1>
      <div className="grid-2">
        <div className="card">
          <h2>{username}</h2>
          <p>Status: <span className="text-green">Active</span></p>
          <p>Academy: Republic Poly Sim Racing</p>
        </div>
        <div className="card" style={{ borderLeftColor: 'var(--color-accent-yellow)' }}>
          <h2>Career Stats</h2>
          <p>Total Laps Recorded: 1,204</p>
          <p>Weekly Leaderboard Appearances: 4</p>
          <p>AI Coaching Score: 85/100</p>
        </div>
      </div>
    </div>
  );
}