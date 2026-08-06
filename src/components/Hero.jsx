import { useNavigate } from "react-router-dom";

function Hero() {
    const navigate = useNavigate();

    return (
        <section className="hero">
            <div className="hero-left">
                <h1>
                    Welcome to <span className="highlight">LJ University</span> Job Portal
                </h1>
                <p>
                    Connecting talent with opportunities. Explore top companies, find internships, and kickstart your dream career with LJ Placement Cell.
                </p>
                <button className="hero-btn" onClick={() => navigate("/jobs")}>
                    Explore Jobs
                </button>
            </div>
            <div className="hero-right">
                <img
                    src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=600&q=80"
                    alt="LJ University Placement cell Illustration"
                    className="hero-image"
                />
            </div>
        </section>
    );
}

export default Hero;