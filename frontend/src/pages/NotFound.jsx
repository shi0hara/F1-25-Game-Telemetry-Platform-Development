/**
 * NotFound.jsx — 404 Page
 * ============================
 * Displays a themed 404 error page when a user navigates to a non-existent route.
 * Uses F1 terminology ("black flagged") to communicate the error in a racing context.
 */
export default function NotFound() {
  return (
    <div className="page-container">
      <div className="card info-card">
        <p className="page-kicker">Navigation Error</p>
        <h1>404 <span className="text-primary">Not Found</span></h1>
        <p className="muted-copy">The page you are looking for has been black flagged (does not exist).</p>
      </div>
    </div>
  );
}