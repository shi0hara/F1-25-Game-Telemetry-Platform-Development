import { useState, useEffect } from "react";

export default function Leaderboard() {
  const data = [
    { rank: 1, name: "MaxV_99", time: "1:20.100", delta: "-" },
    { rank: 2, name: "SpeedDemon", time: "1:20.450", delta: "+0.350" },
    { rank: 3, name: "RP_Racer", time: "1:21.010", delta: "+0.910" },
  ];

  return (
    <div className="page-container">
      <h1>Global <span className="text-primary">Leaderboards</span></h1>
      <div className="card" style={{ marginBottom: "20px" }}>
        <h2>Weekly Fastest (Monza)</h2>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-bg-light-grey)' }}>
              <th style={{ padding: '10px' }}>Rank</th>
              <th>Driver</th>
              <th>Lap Time</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.rank} style={{ borderBottom: '1px solid var(--color-bg-light-grey)' }}>
                <td style={{ padding: '10px', color: row.rank === 1 ? 'var(--color-accent-yellow)' : 'inherit' }}>#{row.rank}</td>
                <td style={{ fontWeight: 'bold' }}>{row.name}</td>
                <td style={{ color: 'var(--color-accent-green)' }}>{row.time}</td>
                <td>{row.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}