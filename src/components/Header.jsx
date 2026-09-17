import { Link, useNavigate } from "react-router-dom";

function Header({ loggedInUser, handleLogout }) {
    const navigate = useNavigate();

    function onLogoutClick() {
        handleLogout();
        navigate("/");
    }

    return (
        <header className="header">
            <div className="header-inner">
                <Link to="/" className="brand" aria-label="LJ University home page">
                    <img className="brand-logo" src="/LJ%20logo.png" alt="LJ University" />
                </Link>

                <nav className="main-nav" aria-label="Main navigation">
                    <ul className="nav-links">
                        <li><Link to="/">Home</Link></li>
                        <li><Link to="/jobs">Jobs</Link></li>

                        {loggedInUser && loggedInUser.role === 'student' ? (
                            <>
                                <li><Link to="/student/dashboard" className="active-link">Dashboard</Link></li>
                                <li className="welcome-tag">Student: {loggedInUser.fullName}</li>
                                <li><button onClick={onLogoutClick} className="logout-btn">Logout</button></li>
                            </>
                        ) : (
                            <li><Link to="/student/login">Student</Link></li>
                        )}

                        {loggedInUser && loggedInUser.role === 'recruiter' ? (
                            <>
                                <li><Link to="/recruiter/dashboard" className="active-link">Recruiter Panel</Link></li>
                                <li className="welcome-tag">{loggedInUser.companyName}</li>
                                <li><button onClick={onLogoutClick} className="logout-btn">Logout</button></li>
                            </>
                        ) : loggedInUser && loggedInUser.role === 'student' ? null : (
                            <li><Link to="/recruiter/login">Recruiter</Link></li>
                        )}

                        {loggedInUser && loggedInUser.role === 'admin' ? (
                            <>
                                <li><Link to="/admin/dashboard" className="active-link">Admin Dashboard</Link></li>
                                <li><button onClick={onLogoutClick} className="logout-btn">Logout</button></li>
                            </>
                        ) : loggedInUser ? null : (
                            <li><Link to="/admin/login">Admin</Link></li>
                        )}
                    </ul>
                </nav>
            </div>
        </header>
    );
}

export default Header;