import "../App.css";

export default function Contact() {
  return (
    <div className="contact-shell">
      <div className="contact-poster">
        <div className="contact-accent" aria-hidden="true"></div>

        <div className="contact-center">
          <p className="contact-kicker">Support Desk</p>
          <h1 className="contact-heading">Contact Us</h1>
          <p className="contact-subheading">
            Reach our telemetry team for account access, data sync issues, or race-week support.
          </p>

          <div className="contact-panel">
            <a className="contact-row" href="tel:+123456789899" aria-label="Call support">
              <span className="contact-glyph" aria-hidden="true">&#9990;</span>
              <span className="contact-copy-wrap">
                <span className="contact-label">Phone</span>
                <span className="contact-copy">+1 234 567 89899</span>
              </span>
            </a>

            <div className="social-links" aria-label="Social channels">
              <a href="#" className="social-pill" aria-label="YouTube">
                <span className="social-mark">YT</span>
                <span className="social-name">YouTube</span>
              </a>
              <a href="#" className="social-pill" aria-label="Instagram">
                <span className="social-mark">IG</span>
                <span className="social-name">Instagram</span>
              </a>
              <a href="#" className="social-pill" aria-label="Facebook">
                <span className="social-mark">FB</span>
                <span className="social-name">Facebook</span>
              </a>
            </div>

            <a className="contact-row" href="mailto:support@rptelemetry.org" aria-label="Email support">
              <span className="contact-glyph" aria-hidden="true">&#9993;</span>
              <span className="contact-copy-wrap">
                <span className="contact-label">Email</span>
                <span className="contact-copy">support@rptelemetry.org</span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}