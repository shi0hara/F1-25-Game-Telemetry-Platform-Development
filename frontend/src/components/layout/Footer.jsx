import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section brand-section">
          <h2><span className="text-primary">F1</span> Telemetry Plus</h2>
          <p className="slogan">Fueling your potential, one lap at a time. The ultimate AI coaching and telemetry platform.</p>
        </div>
        
        <div className="footer-section links-section">
          <h3>Quick Links</h3>
          <div className="footer-links">
            <Link to="/contact" className="footer-link">Contact Us</Link>
            <a href="#" className="footer-link" onClick={(e) => e.preventDefault()}>About the Team</a>
            <a href="#" className="footer-link" onClick={(e) => e.preventDefault()}>Track Setup Database</a>
            <a href="#" className="footer-link" onClick={(e) => e.preventDefault()}>API Documentation</a>
            <a href="#" className="footer-link" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; 2026 Republic Poly Sim Racing. All telemetry data encrypted.</p>
      </div>
    </footer>
  );
}