import { Link } from "react-router-dom";

function Footer() {
    return (
        <footer className="footer">
            <div className="footer-inner">
                <div className="footer-brand">
                    <strong>LJ University</strong>
                    <p>Placement &amp; Job Portal</p>
                    <p>Empowering students with career readiness, internships, and recruitment opportunities.</p>
                </div>

                <div className="footer-links">
                    <h4>Quick Links</h4>
                    <Link to="/">Home</Link>
                    <Link to="/jobs">Jobs</Link>
                    <Link to="/student/login">Student Login</Link>
                    <Link to="/recruiter/login">Recruiter Login</Link>
                </div>

                <div className="footer-links">
                    <h4>Contact</h4>
                    <a href="mailto:ljuniversity.placement@gmail.com">ljuniversity.placement@gmail.com</a>
                    <a href="tel:+917999999999">+91 79999 99999</a>
                    <span>Ahmedabad, Gujarat</span>
                </div>
            </div>
            <div className="footer-copy">© 2026 LJ University. All rights reserved.</div>
        </footer>
    );
}

export default Footer;
