export default function Dashboard() {
  return (
    <div className="page-container">
      <p className="page-kicker">Telemetry Control</p>
      <h1>Race <span className="text-yellow">Dashboard</span></h1>
      <div className="grid-2">
        <div className="card card-accent-blue">
          <h2>Latest Session</h2>
          <p>Track: Monza</p>
          <p>Best Lap: 1:21.345</p>
          <p className="text-green">AI Coaching: Try braking 5m later into Turn 1.</p>
        </div>
        <div className="card">
          <h2>Platform Overview</h2>
          <p className="muted-copy">Welcome to your personal F1 telemetry hub. Connect your game, log your laps, and let our AI engine analyze your driving style.</p>
        </div>
      </div>
    </div>
  );
}