import { useState } from "react";
import { useNavigate } from "react-router-dom";

function AdminDashboard({ loggedInUser, jobs, students, recruiters, onAddJob, onEditJob, onDeleteJob, refreshAdminData }) {
    const navigate = useNavigate();

    // Check if admin is logged in
    if (!loggedInUser || loggedInUser.role !== 'admin') {
        return (
            <div className="unauthorized-container">
                <h2>Access Denied</h2>
                <p>Please log in as an administrator to access this dashboard.</p>
                <button onClick={() => navigate("/admin/login")}>Go to Admin Login</button>
            </div>
        );
    }

    // Tab state: 'students' | 'recruiters' | 'jobs'
    const [activeTab, setActiveTab] = useState("jobs");

    // Single Form state for Add/Edit Job
    const [form, setForm] = useState({
        title: "",
        company: "",
        location: "",
        salary: "",
        jobType: "",
        description: ""
    });

    const [errors, setErrors] = useState({});
    const [isEditing, setIsEditing] = useState(false);
    const [editingJobId, setEditingJobId] = useState(null);

    // Generic handleChange using spread operator
    function handleChange(e) {
        setForm({
            ...form,
            [e.target.name]: e.target.value
        });
        if (errors[e.target.name]) {
            setErrors({
                ...errors,
                [e.target.name]: ""
            });
        }
    }

    function validate() {
        let newErrors = {};

        if (!form.title.trim()) newErrors.title = "Job Title is required";
        if (!form.company.trim()) newErrors.company = "Company Name is required";
        if (!form.location.trim()) newErrors.location = "Location is required";
        if (!form.salary.trim()) newErrors.salary = "Salary package is required";
        if (!form.jobType) newErrors.jobType = "Select a Job Type";
        if (!form.description.trim()) newErrors.description = "Job Description is required";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    async function handleSubmit(e) {
        e.preventDefault();

        if (!validate()) return;

        if (isEditing) {
            try {
                const response = await fetch(`http://localhost:5000/api/jobs/${editingJobId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form)
                });
                const data = await response.json();
                if (response.ok) {
                    alert("Job Updated Successfully!");
                    onEditJob(data.job);
                    resetForm();
                } else {
                    setErrors({ apiError: data.error });
                }
            } catch (err) {
                console.error(err);
                setErrors({ apiError: "Server connection failed." });
            }
        } else {
            try {
                const response = await fetch("http://localhost:5000/api/jobs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form)
                });
                const data = await response.json();
                if (response.ok) {
                    alert("Job Posted Successfully!");
                    onAddJob(data.job);
                    resetForm();
                } else {
                    setErrors({ apiError: data.error });
                }
            } catch (err) {
                console.error(err);
                setErrors({ apiError: "Server connection failed." });
            }
        }
    }

    function handleEditClick(job) {
        setIsEditing(true);
        setEditingJobId(job.id);
        setForm({
            title: job.title,
            company: job.company,
            location: job.location,
            salary: job.salary,
            jobType: job.jobType,
            description: job.description
        });
        setErrors({});
        setActiveTab("jobs"); // Switch back to form tab
    }

    async function handleDeleteClick(jobId) {
        if (!window.confirm("Are you sure you want to delete this job post?")) return;

        try {
            const response = await fetch(`http://localhost:5000/api/jobs/${jobId}`, {
                method: "DELETE"
            });
            if (response.ok) {
                alert("Job Deleted Successfully!");
                onDeleteJob(jobId);
                if (isEditing && editingJobId === jobId) resetForm();
            } else {
                alert("Failed to delete job.");
            }
        } catch (err) {
            console.error(err);
            alert("Error connecting to server.");
        }
    }

    function resetForm() {
        setForm({
            title: "",
            company: "",
            location: "",
            salary: "",
            jobType: "",
            description: ""
        });
        setErrors({});
        setIsEditing(false);
        setEditingJobId(null);
    }

    return (
        <div className="dashboard-container admin-dashboard">
            <div className="dashboard-header">
                <h2>Admin Control Center</h2>
                <p>Manage college placements, registered students, and active hiring recruiters</p>
                <button onClick={refreshAdminData} className="refresh-btn">
                    Sync & Refresh Data 🔄
                </button>
            </div>

            {/* Admin Stats Overview */}
            <div className="admin-stats-summary">
                <div className="mini-stat-card">
                    <h4>Total Jobs</h4>
                    <h2>{jobs.length}</h2>
                </div>
                <div className="mini-stat-card">
                    <h4>Students</h4>
                    <h2>{students.length}</h2>
                </div>
                <div className="mini-stat-card">
                    <h4>Recruiters</h4>
                    <h2>{recruiters.length}</h2>
                </div>
            </div>

            {/* Tabs for Navigation */}
            <div className="admin-tabs">
                <button 
                    className={activeTab === "jobs" ? "active" : ""} 
                    onClick={() => setActiveTab("jobs")}
                >
                    Jobs Administration
                </button>
                <button 
                    className={activeTab === "students" ? "active" : ""} 
                    onClick={() => setActiveTab("students")}
                >
                    View Students ({students.length})
                </button>
                <button 
                    className={activeTab === "recruiters" ? "active" : ""} 
                    onClick={() => setActiveTab("recruiters")}
                >
                    View Recruiters ({recruiters.length})
                </button>
            </div>

            <div className="admin-content-area">
                {activeTab === "jobs" && (
                    <div className="dashboard-grid">
                        {/* Form Card (Post/Edit Job) */}
                        <div className="form-card-container">
                            <h3>{isEditing ? "Edit Job Posting" : "Post a New Placement Job"}</h3>
                            {errors.apiError && <div className="api-error">{errors.apiError}</div>}
                            
                            <form onSubmit={handleSubmit} className="dashboard-form">
                                <div className="form-group">
                                    <label>Company Name</label>
                                    <input
                                        type="text"
                                        name="company"
                                        placeholder="e.g. TCS, Google"
                                        value={form.company}
                                        onChange={handleChange}
                                    />
                                    {errors.company && <span className="field-error">{errors.company}</span>}
                                </div>

                                <div className="form-group">
                                    <label>Job Title</label>
                                    <input
                                        type="text"
                                        name="title"
                                        placeholder="e.g. Frontend Developer"
                                        value={form.title}
                                        onChange={handleChange}
                                    />
                                    {errors.title && <span className="field-error">{errors.title}</span>}
                                </div>

                                <div className="form-group">
                                    <label>Location</label>
                                    <input
                                        type="text"
                                        name="location"
                                        placeholder="e.g. Ahmedabad, Surat"
                                        value={form.location}
                                        onChange={handleChange}
                                    />
                                    {errors.location && <span className="field-error">{errors.location}</span>}
                                </div>

                                <div className="form-group">
                                    <label>Salary Package</label>
                                    <input
                                        type="text"
                                        name="salary"
                                        placeholder="e.g. 6 LPA"
                                        value={form.salary}
                                        onChange={handleChange}
                                    />
                                    {errors.salary && <span className="field-error">{errors.salary}</span>}
                                </div>

                                <div className="form-group">
                                    <label>Job Type</label>
                                    <select
                                        name="jobType"
                                        value={form.jobType}
                                        onChange={handleChange}
                                    >
                                        <option value="">Select Job Type</option>
                                        <option value="Full Time">Full Time</option>
                                        <option value="Part Time">Part Time</option>
                                        <option value="Internship">Internship</option>
                                    </select>
                                    {errors.jobType && <span className="field-error">{errors.jobType}</span>}
                                </div>

                                <div className="form-group">
                                    <label>Job Description</label>
                                    <textarea
                                        name="description"
                                        placeholder="Enter job roles & description..."
                                        value={form.description}
                                        onChange={handleChange}
                                    />
                                    {errors.description && <span className="field-error">{errors.description}</span>}
                                </div>

                                <div className="form-buttons">
                                    <button type="submit" className="submit-job-btn">
                                        {isEditing ? "Save Changes" : "Post Job Listing"}
                                    </button>
                                    {isEditing && (
                                        <button type="button" className="cancel-edit-btn" onClick={resetForm}>
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* Admin Jobs List Panel */}
                        <div className="jobs-list-container">
                            <h3>Manage Active Placements ({jobs.length})</h3>
                            {jobs.length === 0 ? (
                                <div className="empty-state">
                                    <p>No jobs registered in the system.</p>
                                </div>
                            ) : (
                                <div className="recruiter-jobs-list">
                                    {jobs.map(job => (
                                        <div className="recruiter-job-card" key={job.id}>
                                            <div className="job-summary">
                                                <h4>{job.title}</h4>
                                                <div className="meta">
                                                    <strong>🏢 {job.company}</strong> | 
                                                    <span> 📍 {job.location}</span> | 
                                                    <span> 💰 {job.salary}</span>
                                                    <span className="badge">{job.jobType}</span>
                                                </div>
                                            </div>
                                            <div className="action-buttons">
                                                <button className="edit-btn-small" onClick={() => handleEditClick(job)}>
                                                    Edit
                                                </button>
                                                <button className="delete-btn-small" onClick={() => handleDeleteClick(job.id)}>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "students" && (
                    <div className="admin-table-container">
                        <h3>Registered Students Portal Directory</h3>
                        {students.length === 0 ? (
                            <p className="no-records">No students registered yet.</p>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Full Name</th>
                                        <th>Enrollment Number</th>
                                        <th>Email Address</th>
                                        <th>Department Name</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map((student, idx) => (
                                        <tr key={idx}>
                                            <td>{student.fullName}</td>
                                            <td><code>{student.enrollment}</code></td>
                                            <td>{student.email}</td>
                                            <td><span className="dept-tag">{student.department}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === "recruiters" && (
                    <div className="admin-table-container">
                        <h3>Hiring Corporate Partners Directory</h3>
                        {recruiters.length === 0 ? (
                            <p className="no-records">No corporate recruiters registered yet.</p>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Full Name</th>
                                        <th>Hiring Company</th>
                                        <th>Recruiter Email</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recruiters.map((recruiter, idx) => (
                                        <tr key={idx}>
                                            <td>{recruiter.fullName}</td>
                                            <td><strong>{recruiter.companyName}</strong></td>
                                            <td>{recruiter.email}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminDashboard;
