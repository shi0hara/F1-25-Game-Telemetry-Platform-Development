import "../App.css";

export default function Contact() {
  return (
    <div className="page-container" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="contact-card">
        
        {/* Stylized Contact Header */}
        <div className="contact-header-art">
          <div className="giant-c">
            <span className="c-text">C</span>
            <div className="c-receiver-dot top-dot"></div>
            <div className="c-receiver-dot bottom-dot"></div>
          </div>
          <div className="ontact-text">
            <span>ontact us:</span>
            <div className="contact-underline"></div>
          </div>
        </div>

        {/* Contact Details */}
        <div className="contact-details">
          <div className="contact-item">
            <div className="contact-icon text-primary">&#9990;</div>
            <span className="contact-info">23456789899</span>
          </div>
          <div className="contact-item">
            <div className="contact-icon text-primary">&#9993;</div>
            <span className="contact-info">support@rptelemetry.org</span>
          </div>
          
          {/* Social Icons Spiced up */}
          <div className="social-links">
            <a href="#" className="social-icon">&#9655;</a> {/* YouTube */}
            <a href="#" className="social-icon">&#128247;</a> {/* Insta */}
            <a href="#" className="social-icon">f</a> {/* Facebook */}
            <a href="#" className="social-icon">&#120143;</a> {/* X/Twitter */}
          </div>
        </div>
      </div>
    </div>
  );
}