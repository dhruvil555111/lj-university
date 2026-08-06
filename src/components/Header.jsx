import { Link, useNavigate } from "react-router-dom";

function Header({ loggedInUser, handleLogout }) {
    const navigate = useNavigate();

    function onLogoutClick() {
        handleLogout();
        navigate("/");
    }

    return (
        <header className="header">
            <div className="logo">
                <Link to="/">
                    <h2>LJ University <span>Job Portal</span></h2>
                </Link>
            </div>
            <nav>
                <ul className="nav-links">
                    <li><Link to="/">Home</Link></li>
                    <li><Link to="/jobs">Jobs</Link></li>

                    {/* Student Nav Section */}
                    {loggedInUser && loggedInUser.role === 'student' ? (
                        <>
                            <li><Link to="/student/dashboard" className="active-link">Dashboard</Link></li>
                            <li className="welcome-tag">Student: {loggedInUser.fullName}</li>
                            <li><button onClick={onLogoutClick} className="logout-btn">Logout</button></li>
                        </>
                    ) : (
                        <li><Link to="/student/login">Student</Link></li>
                    )}

                    {/* Recruiter Nav Section */}
                    {loggedInUser && loggedInUser.role === 'recruiter' ? (
                        <>
                            <li><Link to="/recruiter/dashboard" className="active-link">Recruiter Panel</Link></li>
                            <li className="welcome-tag">{loggedInUser.companyName}</li>
                            <li><button onClick={onLogoutClick} className="logout-btn">Logout</button></li>
                        </>
                    ) : loggedInUser && loggedInUser.role === 'student' ? null : (
                        <li><Link to="/recruiter/login">Recruiter</Link></li>
                    )}

                    {/* Admin Nav Section */}
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
        </header>
    );
}

export default Header;