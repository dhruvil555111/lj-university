import { useNavigate } from "react-router-dom";

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
                                        <span className={`interview-status interview-status-${(job.status || "Applied").toLowerCase().replaceAll(" ", "-")}`}>
                                            {job.status || "Applied"}
                                        </span>
                                        {job.status === "Pending Admin Approval" && (
                                            <p className="interview-pending-note">
                                                Your recruiter proposed an interview. Details will be shared after admin approval.
                                            </p>
                                        )}
                                        {job.status === "Rejected" && (
                                            <p className="interview-rejection-note">
                                                Interview change requested: {job.rejectionReason || "Please contact the recruiter for details."}
                                            </p>
                                        )}
                                        {job.interview && ["Interview Scheduled", "Completed"].includes(job.status) && (
                                            <div className="interview-notification" role="status">
                                                {job.status === "Interview Scheduled" && (
                                                    <strong>Your interview has been approved and scheduled</strong>
                                                )}
                                                {job.status === "Completed" && <strong>Interview completed</strong>}
                                                <span>{new Date(`${job.interview.date}T00:00:00`).toLocaleDateString("en-IN", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric"
                                                })} at {job.interview.time}</span>
                                                <span>{job.interview.type}</span>
                                                {/^https?:\/\//i.test(job.interview.locationOrMeetingLink)
                                                    ? (
                                                        <a
                                                            href={job.interview.locationOrMeetingLink}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            Join interview meeting
                                                        </a>
                                                    )
                                                    : <span>{job.interview.locationOrMeetingLink}</span>}
                                                {job.interview.notes && <span>Notes: {job.interview.notes}</span>}
                                            </div>
                                        )}
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
