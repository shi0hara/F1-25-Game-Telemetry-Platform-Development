export default function LiveTelemetry() {
  return (
    <div className="page-container">
      <h1>Live <span className="text-blue">Telemetry</span></h1>
      <div className="card" style={{ borderLeftColor: 'var(--color-accent-blue)' }}>
        <h2>Waiting for inputs...</h2>
        <p>This module will visualize incoming UDP packets from F1 25 in real-time.</p>
        <div style={{ height: '300px', backgroundColor: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #333' }}>
          <span style={{ color: 'var(--color-accent-yellow)' }}>[ Telemetry Graph Placeholder ]</span>
        </div>
      </div>
    </div>
  );
}