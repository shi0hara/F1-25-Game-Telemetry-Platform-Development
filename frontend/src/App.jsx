import { BrowserRouter, Routes, Route } from "react-router-dom";

import Navbar from "./components/layout/Navbar";
import Dashboard from "./pages/Dashboard";
import LiveTelemetry from "./pages/LiveTelemetry";
import Leaderboard from "./pages/Leaderboard";
import PerformanceReview from "./pages/PerformanceReview";
import Insights from "./pages/Insights";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/live" element={<LiveTelemetry />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/review" element={<PerformanceReview />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}