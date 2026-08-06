import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import JobCard from "../components/JobCard";

function StudentDashboard({ loggedInUser, appliedJobs }) {
    const navigate = useNavigate();

    // Check if student is logged in
    if (!loggedInUser || loggedInUser.role !== 'student') {
        return (
            <div className="unauthorized-container">
                <h2>Access Denied</h2>
                <p>Please log in as a student to access the dashboard.</p>
                <button onClick={() => navigate("/student/login")}>Go to Student Login</button>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h2>Student Portal Dashboard</h2>
                <p>Manage your student profile and job applications</p>
            </div>

            <div className="dashboard-grid">
                {/* Profile Card */}
                <div className="profile-card">
                    <h3>Student Profile Details</h3>
                    <div className="profile-details">
                        <div className="profile-row">
                            <span className="label">Full Name:</span>
                            <span className="value">{loggedInUser.fullName}</span>
                        </div>
                        <div className="profile-row">
                            <span className="label">Enrollment No:</span>
                            <span className="value">{loggedInUser.enrollment}</span>
                        </div>
                        <div className="profile-row">
                            <span className="label">Email Address:</span>
                            <span className="value">{loggedInUser.email}</span>
                        </div>
                        <div className="profile-row">
                            <span className="label">Department:</span>
                            <span className="value">{loggedInUser.department}</span>
                        </div>
                    </div>
                </div>

                {/* Applications Card */}
                <div className="applications-card">
                    <h3>Your Job Applications</h3>
                    {appliedJobs.length === 0 ? (
                        <div className="empty-state">
                            <p>You have not applied for any placement positions yet.</p>
                            <button onClick={() => navigate("/jobs")}>Browse Open Jobs</button>
                        </div>
                    ) : (
                        <div className="applied-jobs-list">
                            <p className="success-badge">You have applied to {appliedJobs.length} job(s)</p>
                            <div className="dashboard-jobs-grid">
                                {appliedJobs.map(job => (
                                    <div className="mini-card" key={job.id}>
                                        <h4>{job.title}</h4>
                                        <p className="company">{job.company}</p>
                                        <div className="details">
                                            <span>📍 {job.location}</span>
                                            <span>💰 {job.salary}</span>
                                        </div>
                                        <span className="status-badge-applied">Applied ✓</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default StudentDashboard;
