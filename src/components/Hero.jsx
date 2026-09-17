import { useNavigate } from "react-router-dom";

function Hero() {
    const navigate = useNavigate();

    return (
        <section className="hero">
            <div className="hero-left">
                <div className="eyebrow">Ahmedabad, Gujarat</div>
                <h1>
                    Build your future with
                    <span className="highlight">LJ University Placement Portal</span>
                </h1>
                <p>
                    Discover career-defining internships, full-time roles, and campus placement opportunities with LJ University’s trusted hiring partners.
                </p>

                <div className="hero-actions">
                    <button className="hero-btn" onClick={() => navigate("/jobs")}>
                        Browse Jobs
                    </button>
                    <button className="secondary-btn" onClick={() => navigate("/student/register")}>
                        Student Register
                    </button>
                </div>

                <div className="hero-metrics">
                    <div className="metric-chip"><strong>1200+</strong> students</div>
                    <div className="metric-chip"><strong>80+</strong> partners</div>
                    <div className="metric-chip"><strong>92%</strong> placement rate</div>
                </div>
            </div>

            <div className="hero-right">
                <div className="hero-visual">
                    <img
                        src="/hero-placement-photo.jpe"
                        alt="LJ University campus and placement opportunity"
                        className="hero-image"
                    />
                    <div className="hero-floating-card">
                        Trusted by
                        <strong>80+ companies</strong>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default Hero;