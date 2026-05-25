import useTelemetrySamples from "../hooks/useTelemetrySamples";

export default function TelemetryChart({ sessionId }) {
  const samples = useTelemetrySamples(sessionId);

  return (
    <div>
      <h2>Telemetry Samples</h2>

      {samples.length === 0 ? (
        <p>Waiting for telemetry data...</p>
      ) : (
        <ul>
          {samples.map((sample) => (
            <li key={sample.id}>
              Speed: {sample.speedKph} km/h | Throttle:{" "}
              {(sample.throttle * 100).toFixed(0)}% | Brake:{" "}
              {(sample.brake * 100).toFixed(0)}%
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}