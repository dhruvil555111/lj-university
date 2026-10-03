import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function Header({ loggedInUser, handleLogout }) {
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        if (!isMenuOpen) return undefined;

        function closeOnEscape(event) {
            if (event.key === "Escape") setIsMenuOpen(false);
        }

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [isMenuOpen]);

    function onLogoutClick() {
        setIsMenuOpen(false);
        handleLogout();
        navigate("/");
    }

    return (
        <header className="header">
            <div className="header-inner">
                <Link to="/" className="brand" aria-label="LJ University home page">
                    <img className="brand-logo" src="/LJ%20logo.png" alt="LJ University" />
                </Link>

                <button
                    type="button"
                    className="nav-toggle"
                    aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                    aria-expanded={isMenuOpen}
                    aria-controls="main-navigation"
                    onClick={() => setIsMenuOpen(open => !open)}
                >
                    <span />
                    <span />
                    <span />
                </button>

                <nav
                    id="main-navigation"
                    className={`main-nav${isMenuOpen ? " is-open" : ""}`}
                    aria-label="Main navigation"
                >
                    <ul className="nav-links">
                        <li><Link to="/" onClick={() => setIsMenuOpen(false)}>Home</Link></li>
                        <li><Link to="/jobs" onClick={() => setIsMenuOpen(false)}>Jobs</Link></li>

                        {loggedInUser && loggedInUser.role === 'student' ? (
                            <>
                                <li><Link to="/student/dashboard" className="active-link" onClick={() => setIsMenuOpen(false)}>Dashboard</Link></li>
                                <li className="welcome-tag">Student: {loggedInUser.fullName}</li>
                                <li><button onClick={onLogoutClick} className="logout-btn">Logout</button></li>
                            </>
                        ) : (
                            <li><Link to="/student/login" onClick={() => setIsMenuOpen(false)}>Student</Link></li>
                        )}

                        {loggedInUser && loggedInUser.role === 'recruiter' ? (
                            <>
                                <li><Link to="/recruiter/dashboard" className="active-link" onClick={() => setIsMenuOpen(false)}>Recruiter Panel</Link></li>
                                <li className="welcome-tag">{loggedInUser.companyName}</li>
                                <li><button onClick={onLogoutClick} className="logout-btn">Logout</button></li>
                            </>
                        ) : loggedInUser && loggedInUser.role === 'student' ? null : (
                            <li><Link to="/recruiter/login" onClick={() => setIsMenuOpen(false)}>Recruiter</Link></li>
                        )}

                        {loggedInUser && loggedInUser.role === 'admin' ? (
                            <>
                                <li><Link to="/admin/dashboard" className="active-link" onClick={() => setIsMenuOpen(false)}>Admin Dashboard</Link></li>
                                <li><button onClick={onLogoutClick} className="logout-btn">Logout</button></li>
                            </>
                        ) : loggedInUser ? null : (
                            <li><Link to="/admin/login" onClick={() => setIsMenuOpen(false)}>Admin</Link></li>
                        )}
                    </ul>
                </nav>
            </div>
        </header>
    );
}

export default Header;