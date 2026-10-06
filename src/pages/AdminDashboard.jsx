import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/api";
import InterviewApprovals from "./InterviewApprovals";

const ADMIN_NAV_ITEMS = [
    { id: "overview", label: "Dashboard", marker: "D" },
    { id: "students", label: "Students", marker: "S" },
    { id: "recruiters", label: "Companies & Recruiters", marker: "C" },
    { id: "jobs", label: "Job Postings", marker: "J" },
    { id: "interviews", label: "Interview Reviews", marker: "I" },
    { id: "drive-approvals", label: "Campus Drive Approvals", marker: "D" },
    { id: "recruiter-verification", label: "Recruiter Approvals", marker: "R" }
];

function AdminDashboard({ loggedInUser, jobs, students, recruiters, onAddJob, onEditJob, onDeleteJob, refreshAdminData }) {
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState("overview");

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
    const [driveApprovals, setDriveApprovals] = useState([]);
    const [approvalFilter, setApprovalFilter] = useState("Pending Admin Approval");
    const [approvalLoading, setApprovalLoading] = useState(false);
    const [approvalError, setApprovalError] = useState("");
    const [approvalActionDrive, setApprovalActionDrive] = useState(null);
    const [approvalAction, setApprovalAction] = useState("");
    const [approvalNote, setApprovalNote] = useState("");
    const [approvalSubmitting, setApprovalSubmitting] = useState(false);
    const [selectedApprovalDrive, setSelectedApprovalDrive] = useState(null);
    const [verificationRequests, setVerificationRequests] = useState([]);
    const [verificationFilter, setVerificationFilter] = useState("All");
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [verificationError, setVerificationError] = useState("");
    const [selectedVerificationRequest, setSelectedVerificationRequest] = useState(null);
    const [verificationActionRequest, setVerificationActionRequest] = useState(null);
    const [verificationAction, setVerificationAction] = useState("");
    const [verificationReason, setVerificationReason] = useState("");
    const [verificationSubmitting, setVerificationSubmitting] = useState(false);
    const adminRole = loggedInUser?.role;
    const adminSessionToken = loggedInUser?.sessionToken;

    async function readApiResponse(response) {
        const text = await response.text();
        let data = {};
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`Server returned an unreadable response (${response.status}).`);
            }
        }
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
        return data;
    }

    const loadDriveApprovals = useCallback(async () => {
        setApprovalLoading(true);
        setApprovalError("");
        try {
            const response = await fetch(apiUrl("admin/campus-drive-approvals"), {
                headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
            });
            const data = await readApiResponse(response);
            const drives = Array.isArray(data.drives) ? data.drives : [];
            setDriveApprovals(drives);
        } catch (error) {
            console.error("Failed to load campus drive approvals:", error);
            setApprovalError(error.message || "Unable to load campus drive approvals.");
        } finally {
            setApprovalLoading(false);
        }
    }, [loggedInUser?.sessionToken]);

    const loadVerificationRequests = useCallback(async () => {
        setVerificationLoading(true);
        setVerificationError("");
        try {
            const response = await fetch(apiUrl("admin/recruiter-verifications?status=All"), {
                headers: { Authorization: `Bearer ${loggedInUser?.sessionToken}` }
            });
            const data = await readApiResponse(response);
            setVerificationRequests(Array.isArray(data.requests) ? data.requests : []);
        } catch (error) {
            console.error("Failed to load recruiter verification requests:", error);
            setVerificationError(error.message || "Unable to load recruiter verification requests.");
        } finally {
            setVerificationLoading(false);
        }
    }, [loggedInUser?.sessionToken]);

    async function submitVerificationDecision(event) {
        event.preventDefault();
        if (!verificationActionRequest || !verificationAction) return;
        setVerificationSubmitting(true);
        setVerificationError("");
        try {
            const response = await fetch(
                apiUrl(`admin/recruiter-verifications/${verificationActionRequest.id}`),
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${loggedInUser.sessionToken}`
                    },
                    body: JSON.stringify({
                        action: verificationAction,
                        reason: verificationAction === "reject" ? verificationReason : undefined
                    })
                }
            );
            await readApiResponse(response);
            setVerificationActionRequest(null);
            setVerificationAction("");
            setVerificationReason("");
            await loadVerificationRequests();
        } catch (error) {
            console.error("Failed to save recruiter verification decision:", error);
            setVerificationError(error.message || "Unable to save recruiter verification decision.");
        } finally {
            setVerificationSubmitting(false);
        }
    }

    async function submitDriveApprovalAction(event) {
        event.preventDefault();
        if (!approvalActionDrive || !approvalAction) return;
        setApprovalSubmitting(true);
        setApprovalError("");
        try {
            const response = await fetch(
                apiUrl(`admin/campus-drive-approvals/${approvalActionDrive.id}`),
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${loggedInUser.sessionToken}`
                    },
                    body: JSON.stringify(approvalAction === "reject"
                        ? { action: approvalAction, reason: approvalNote }
                        : { action: approvalAction, adminNotes: approvalNote })
                }
            );
            await readApiResponse(response);
            setApprovalActionDrive(null);
            setApprovalAction("");
            setApprovalNote("");
            await loadDriveApprovals();
        } catch (error) {
            console.error("Failed to save campus drive approval:", error);
            setApprovalError(error.message || "Unable to save campus drive decision.");
        } finally {
            setApprovalSubmitting(false);
        }
    }

    const approvalCounts = driveApprovals.reduce((counts, drive) => ({
        ...counts,
        [drive.approvalStatus]: (counts[drive.approvalStatus] || 0) + 1
    }), {});
    const visibleDriveApprovals = approvalFilter === "All"
        ? driveApprovals
        : driveApprovals.filter(drive => drive.approvalStatus === approvalFilter);
    const pendingRecruiterCount = verificationRequests.filter(request => request.verificationStatus === "Pending").length;
    const pendingDriveCount = approvalCounts["Pending Admin Approval"] || 0;
    const recentActivity = [
        ...(students.slice(0, 2).map(student => ({
            id: `student-${student.id || student.enrollment || student.email}`,
            marker: "S",
            title: "Student registered",
            detail: student.fullName || student.name || "Student profile",
            tab: "students"
        }))),
        ...(recruiters.slice(0, 2).map(recruiter => ({
            id: `company-${recruiter.id || recruiter.email}`,
            marker: "C",
            title: "Company recruiter on portal",
            detail: recruiter.companyName || recruiter.fullName || recruiter.email || "Recruiter profile",
            tab: "recruiters"
        }))),
        ...(jobs.slice(0, 2).map(job => ({
            id: `job-${job.id}`,
            marker: "J",
            title: "Job posting",
            detail: `${job.title || "Position"}${job.company ? ` · ${job.company}` : ""}`,
            tab: "jobs"
        }))),
        ...(driveApprovals.filter(drive => drive.approvalStatus === "Pending Admin Approval").slice(0, 2).map(drive => ({
            id: `drive-${drive.id}`,
            marker: "A",
            title: "Campus drive awaiting review",
            detail: `${drive.company || "Company"} · ${drive.title || "Position"}`,
            tab: "drive-approvals"
        })))
    ].slice(0, 6);
    const driveStatusSummary = [
        { label: "Approved", count: approvalCounts.Approved || 0, className: "approved" },
        { label: "Pending", count: pendingDriveCount, className: "pending" },
        { label: "Changes requested", count: approvalCounts["Changes Requested"] || 0, className: "changes" },
        { label: "Rejected", count: approvalCounts.Rejected || 0, className: "rejected" }
    ];
    const largestDriveStatusCount = Math.max(1, ...driveStatusSummary.map(item => item.count));

    useEffect(() => {
        if (adminRole !== "admin") return;
        let active = true;
        async function loadInitialApprovals() {
            try {
                const response = await fetch(apiUrl("admin/campus-drive-approvals"), {
                    headers: { Authorization: `Bearer ${adminSessionToken}` }
                });
                const data = await readApiResponse(response);
                if (active) setDriveApprovals(Array.isArray(data.drives) ? data.drives : []);
            } catch (error) {
                if (active) {
                    console.error("Failed to load campus drive approvals:", error);
                    setApprovalError(error.message || "Unable to load campus drive approvals.");
                }
            }
        }
        loadInitialApprovals();
        return () => {
            active = false;
        };
    }, [adminRole, adminSessionToken]);

    useEffect(() => {
        if (adminRole !== "admin") return undefined;
        let active = true;
        async function loadInitialVerificationRequests() {
            try {
                const response = await fetch(apiUrl("admin/recruiter-verifications?status=All"), {
                    headers: { Authorization: `Bearer ${adminSessionToken}` }
                });
                const data = await readApiResponse(response);
                if (active) setVerificationRequests(Array.isArray(data.requests) ? data.requests : []);
            } catch (error) {
                if (active) {
                    console.error("Failed to load recruiter verification requests:", error);
                    setVerificationError(error.message || "Unable to load recruiter verification requests.");
                }
            } finally {
                if (active) setVerificationLoading(false);
            }
        }
        loadInitialVerificationRequests();
        return () => {
            active = false;
        };
    }, [adminRole, adminSessionToken]);

    if (!loggedInUser || loggedInUser.role !== 'admin') {
        return (
            <div className="unauthorized-container">
                <h2>Access Denied</h2>
                <p>Please log in as an administrator to access this dashboard.</p>
                <button onClick={() => navigate("/admin/login")}>Go to Admin Login</button>
            </div>
        );
    }

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
                const response = await fetch(apiUrl(`jobs/${editingJobId}`), {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${loggedInUser.sessionToken}`
                    },
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
                const response = await fetch(apiUrl("jobs"), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${loggedInUser.sessionToken}`
                    },
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
            const response = await fetch(apiUrl(`jobs/${jobId}`), {
                method: "DELETE",
                headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
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

    function openAdminSection(sectionId) {
        setActiveTab(sectionId);
        if (sectionId === "drive-approvals") loadDriveApprovals();
        if (sectionId === "recruiter-verification") loadVerificationRequests();
    }

    return (
        <div className="dashboard-container admin-dashboard">
            <div className="admin-layout">
                <aside className="admin-sidebar">
                    <div className="admin-sidebar-brand">
                        <span className="admin-sidebar-brand-mark">LJ</span>
                        <div>
                            <strong>Placement Cell</strong>
                            <span>Admin Panel</span>
                        </div>
                    </div>
                    <nav className="admin-sidebar-nav" aria-label="Admin sections">
                        <span className="admin-sidebar-label">WORKSPACE</span>
                        {ADMIN_NAV_ITEMS.map(item => {
                            const badge = item.id === "drive-approvals"
                                ? pendingDriveCount
                                : item.id === "recruiter-verification"
                                    ? pendingRecruiterCount
                                    : null;
                            return (
                                <button
                                    type="button"
                                    key={item.id}
                                    className={`admin-nav-item${activeTab === item.id ? " active" : ""}`}
                                    aria-current={activeTab === item.id ? "page" : undefined}
                                    onClick={() => openAdminSection(item.id)}
                                >
                                    <span className="admin-nav-marker" aria-hidden="true">{item.marker}</span>
                                    <span className="admin-nav-label">{item.label}</span>
                                    {badge > 0 && <span className="admin-nav-badge">{badge}</span>}
                                </button>
                            );
                        })}
                    </nav>
                    <div className="admin-sidebar-user">
                        <span className="admin-avatar">
                            {(loggedInUser.fullName || loggedInUser.name || loggedInUser.email || "A").slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                            <strong>{loggedInUser.fullName || loggedInUser.name || "Administrator"}</strong>
                            <small>Placement Cell Admin</small>
                        </span>
                    </div>
                </aside>

                <main className="admin-main">
                    <div className="dashboard-header admin-page-header">
                        <div>
                            <span className="admin-page-eyebrow">LJ UNIVERSITY · PLACEMENT CELL</span>
                            <h2>{activeTab === "overview"
                                ? `Welcome, ${loggedInUser.fullName || loggedInUser.name || "Admin"}`
                                : ADMIN_NAV_ITEMS.find(item => item.id === activeTab)?.label || "Admin Panel"}</h2>
                            <p>{activeTab === "overview"
                                ? "Manage campus placements, students, and recruiting partners from one place."
                                : "Review and manage placement portal records."}</p>
                        </div>
                        <button type="button" onClick={refreshAdminData} className="refresh-btn">
                            Sync & Refresh
                        </button>
                    </div>

                    {activeTab === "overview" && (
                        <section className="admin-overview" aria-label="Placement dashboard overview">
                            <div className="admin-stats-summary">
                                <article className="admin-overview-stat students">
                                    <span className="admin-overview-stat-icon">S</span>
                                    <div><span>Total Students</span><strong>{students.length.toLocaleString()}</strong><small>Registered student profiles</small></div>
                                </article>
                                <article className="admin-overview-stat companies">
                                    <span className="admin-overview-stat-icon">C</span>
                                    <div><span>Registered Companies</span><strong>{recruiters.length.toLocaleString()}</strong><small>Recruiter partner accounts</small></div>
                                </article>
                                <article className="admin-overview-stat postings">
                                    <span className="admin-overview-stat-icon">J</span>
                                    <div><span>Job Postings</span><strong>{jobs.length.toLocaleString()}</strong><small>Available placement listings</small></div>
                                </article>
                                <article className="admin-overview-stat approvals">
                                    <span className="admin-overview-stat-icon">A</span>
                                    <div><span>Pending Approvals</span><strong>{(pendingDriveCount + pendingRecruiterCount).toLocaleString()}</strong><small>Drives and companies to review</small></div>
                                </article>
                            </div>

                            <div className="admin-overview-grid">
                                <section className="admin-overview-panel admin-activity-panel">
                                    <div className="admin-panel-heading">
                                        <div><h3>Recent Activity</h3><p>Latest records available in the placement portal</p></div>
                                    </div>
                                    {recentActivity.length === 0 ? (
                                        <div className="admin-overview-empty">Activity will appear here as students, companies, jobs, and drives are added.</div>
                                    ) : (
                                        <ul className="admin-activity-list">
                                            {recentActivity.map(activity => (
                                                <li key={activity.id}>
                                                    <span className="admin-activity-marker">{activity.marker}</span>
                                                    <div><strong>{activity.title}</strong><span>{activity.detail}</span></div>
                                                    <button type="button" onClick={() => openAdminSection(activity.tab)} aria-label={`View ${activity.title}`}>View</button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>

                                <section className="admin-overview-panel admin-approval-panel">
                                    <div className="admin-panel-heading">
                                        <div><h3>Campus Drive Approvals</h3><p>Current review status for submitted drives</p></div>
                                        <button type="button" onClick={() => openAdminSection("drive-approvals")}>View all</button>
                                    </div>
                                    <div className="admin-approval-summary">
                                        {driveStatusSummary.map(item => (
                                            <button
                                                type="button"
                                                className="admin-approval-row"
                                                key={item.label}
                                                onClick={() => {
                                                    setApprovalFilter(item.label === "Pending" ? "Pending Admin Approval" : item.label === "Changes requested" ? "Changes Requested" : item.label);
                                                    openAdminSection("drive-approvals");
                                                }}
                                            >
                                                <span className={`admin-approval-dot ${item.className}`} />
                                                <span className="admin-approval-label">{item.label}</span>
                                                <span className="admin-approval-track"><span style={{ width: `${(item.count / largestDriveStatusCount) * 100}%` }} /></span>
                                                <strong>{item.count}</strong>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="admin-quick-review">
                                        <button type="button" onClick={() => openAdminSection("recruiter-verification")}>
                                            <span><strong>Recruiter approvals</strong><small>{pendingRecruiterCount} pending review</small></span><b>›</b>
                                        </button>
                                        <button type="button" onClick={() => openAdminSection("drive-approvals")}>
                                            <span><strong>Campus drive approvals</strong><small>{pendingDriveCount} pending review</small></span><b>›</b>
                                        </button>
                                    </div>
                                </section>
                            </div>
                        </section>
                    )}

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

                {activeTab === "interviews" && (
                    <InterviewApprovals sessionToken={loggedInUser.sessionToken} />
                )}
                {activeTab === "drive-approvals" && (
                    <section className="admin-drive-approvals" aria-labelledby="campus-drive-approvals-heading">
                        <div className="admin-drive-approval-heading">
                            <div>
                                <h3 id="campus-drive-approvals-heading">Campus Drive Approvals</h3>
                                <p>Review recruiter-submitted campus drives before they become visible to students.</p>
                            </div>
                            <button type="button" className="refresh-btn" onClick={() => loadDriveApprovals()}>Refresh</button>
                        </div>
                        <div className="admin-drive-filters" aria-label="Filter campus drive approvals">
                            {["Pending Admin Approval", "Approved", "Rejected", "Changes Requested", "All"].map(status => (
                                <button
                                    type="button"
                                    key={status}
                                    className={approvalFilter === status ? "active" : ""}
                                    onClick={() => {
                                        setApprovalFilter(status);
                                        loadDriveApprovals(status);
                                    }}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                        {approvalError && <div className="api-error" role="alert">{approvalError}</div>}
                        {approvalLoading && <p role="status">Loading campus drive approvals...</p>}
                        {!approvalLoading && !approvalError && visibleDriveApprovals.length === 0 && (
                            <div className="empty-state"><p>No campus drives in this approval category.</p></div>
                        )}
                        {!approvalLoading && visibleDriveApprovals.map(drive => (
                            <article className="admin-drive-card" key={drive.id}>
                                <div className="admin-drive-card-heading">
                                    <div>
                                        <span className={`rh-tag rh-tag-${drive.approvalStatus.toLowerCase().replaceAll(" ", "-")}`}>
                                            {drive.approvalStatus}
                                        </span>
                                        <h4>{drive.company} · {drive.title}</h4>
                                        <p>{drive.driveId || `Drive #${drive.id}`} · {drive.recruiterName} · {drive.recruiterEmail}</p>
                                    </div>
                                    <button type="button" className="rh-btn" onClick={() => setSelectedApprovalDrive(drive)}>View Details</button>
                                </div>
                                {(drive.rejectionReason || drive.adminNotes) && (
                                    <p className="admin-drive-note">
                                        {drive.rejectionReason && <>Rejection reason: {drive.rejectionReason} </>}
                                        {drive.adminNotes && <>Admin notes: {drive.adminNotes}</>}
                                    </p>
                                )}
                                <div className="admin-drive-actions">
                                    {drive.approvalStatus !== "Approved" && (
                                        <button type="button" className="rh-btn rh-btn-primary" onClick={() => {
                                            setApprovalActionDrive(drive);
                                            setApprovalAction("approve");
                                            setApprovalNote("");
                                        }}>Approve</button>
                                    )}
                                    {drive.approvalStatus !== "Rejected" && (
                                        <button type="button" className="rh-btn rh-btn-danger" onClick={() => {
                                            setApprovalActionDrive(drive);
                                            setApprovalAction("reject");
                                            setApprovalNote("");
                                        }}>Reject</button>
                                    )}
                                    {drive.approvalStatus !== "Changes Requested" && (
                                        <button type="button" className="rh-btn" onClick={() => {
                                            setApprovalActionDrive(drive);
                                            setApprovalAction("requestChanges");
                                            setApprovalNote("");
                                        }}>Request Changes</button>
                                    )}
                                </div>
                            </article>
                        ))}
                    </section>
                )}
                {activeTab === "recruiter-verification" && (
                    <section className="admin-drive-approvals" aria-labelledby="recruiter-verification-heading">
                        <div className="admin-drive-approval-heading">
                            <div>
                                <h3 id="recruiter-verification-heading">Recruiter Approvals</h3>
                                <p>Verify recruiter identity and company information before they can submit campus drives.</p>
                            </div>
                            <button type="button" className="refresh-btn" onClick={loadVerificationRequests}>Refresh</button>
                        </div>
                        <div className="admin-verification-stats">
                            {["Pending", "Approved", "Rejected"].map(status => (
                                <article className="mini-stat-card" key={status}>
                                    <h4>{status === "Pending" ? "Pending Recruiter Approvals" : `${status} Recruiters`}</h4>
                                    <h2>{verificationRequests.filter(request => request.verificationStatus === status).length}</h2>
                                </article>
                            ))}
                        </div>
                        <div className="admin-drive-filters" aria-label="Filter recruiter verifications">
                            {["All", "Pending", "Approved", "Rejected"].map(status => (
                                <button
                                    type="button"
                                    key={status}
                                    className={verificationFilter === status ? "active" : ""}
                                    onClick={() => setVerificationFilter(status)}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                        {verificationError && <div className="api-error" role="alert">{verificationError}</div>}
                        {verificationLoading && <p role="status">Loading recruiter verification requests...</p>}
                        {!verificationLoading && !verificationError && verificationRequests.filter(request =>
                            verificationFilter === "All" || request.verificationStatus === verificationFilter
                        ).length === 0 && (
                            <div className="empty-state"><p>No recruiter verification requests in this category.</p></div>
                        )}
                        {!verificationLoading && verificationRequests
                            .filter(request => verificationFilter === "All" || request.verificationStatus === verificationFilter)
                            .map(request => (
                                <article className="admin-drive-card" key={request.id}>
                                    <div className="admin-drive-card-heading">
                                        <div className="admin-verification-company">
                                            <div className="rh-company-logo-small">
                                                {request.companyLogoUrl
                                                    ? <img src={request.companyLogoUrl} alt={`${request.companyName} logo`} />
                                                    : <span>{(request.companyName || "?").slice(0, 2).toUpperCase()}</span>}
                                            </div>
                                            <div>
                                                <span className={`rh-tag rh-tag-${request.verificationStatus.toLowerCase()}`}>{request.verificationStatus}</span>
                                                <h4>{request.companyName || "Company name not provided"}</h4>
                                                <p>{request.industry || "Industry not provided"} · {request.fullName} · {request.officialEmail || request.email}</p>
                                                <p>{request.phone || "Phone not provided"} · {request.location || "Location not provided"} · Submitted {request.submittedDate ? new Date(request.submittedDate).toLocaleDateString() : "date unavailable"}</p>
                                            </div>
                                        </div>
                                        <button type="button" className="rh-btn" onClick={() => setSelectedVerificationRequest(request)}>View Details</button>
                                    </div>
                                    {request.verificationRejectionReason && (
                                        <p className="admin-drive-note">Rejection reason: {request.verificationRejectionReason}</p>
                                    )}
                                    <div className="admin-drive-actions">
                                        {request.verificationStatus !== "Approved" && (
                                            <button type="button" className="rh-btn rh-btn-primary" onClick={() => {
                                                setVerificationActionRequest(request);
                                                setVerificationAction("approve");
                                                setVerificationReason("");
                                                setVerificationError("");
                                            }}>Approve</button>
                                        )}
                                        {request.verificationStatus !== "Rejected" && (
                                            <button type="button" className="rh-btn rh-btn-danger" onClick={() => {
                                                setVerificationActionRequest(request);
                                                setVerificationAction("reject");
                                                setVerificationReason("");
                                                setVerificationError("");
                                            }}>Reject</button>
                                        )}
                                    </div>
                                </article>
                            ))}
                    </section>
                )}
            </div>
                </main>
            </div>
            {verificationActionRequest && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget && !verificationSubmitting) setVerificationActionRequest(null);
                }}>
                    <section className="rh-dialog rh-panel" role="dialog" aria-modal="true" aria-labelledby="recruiter-verification-action-heading">
                        <h3 id="recruiter-verification-action-heading">
                            {verificationAction === "approve" ? "Approve Recruiter & Company" : "Reject Recruiter & Company"}
                        </h3>
                        <p>{verificationActionRequest.companyName} · {verificationActionRequest.fullName}</p>
                        {verificationError && <div className="api-error" role="alert">{verificationError}</div>}
                        <form className="dashboard-form" onSubmit={submitVerificationDecision}>
                            {verificationAction === "reject" && (
                                <div className="form-group">
                                    <label htmlFor="verification-rejection-reason">Rejection reason</label>
                                    <textarea
                                        id="verification-rejection-reason"
                                        value={verificationReason}
                                        onChange={event => setVerificationReason(event.target.value)}
                                        required
                                    />
                                </div>
                            )}
                            <div className="form-buttons">
                                <button type="submit" className="submit-job-btn" disabled={verificationSubmitting}>
                                    {verificationSubmitting ? "Saving..." : "Confirm"}
                                </button>
                                <button type="button" className="cancel-edit-btn" disabled={verificationSubmitting} onClick={() => setVerificationActionRequest(null)}>Cancel</button>
                            </div>
                        </form>
                    </section>
                </div>
            )}
            {selectedVerificationRequest && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget) setSelectedVerificationRequest(null);
                }}>
                    <section className="rh-dialog rh-panel admin-drive-detail" role="dialog" aria-modal="true" aria-labelledby="recruiter-verification-detail-heading">
                        <div className="rh-panel-heading">
                            <h3 id="recruiter-verification-detail-heading">{selectedVerificationRequest.companyName} · Verification Details</h3>
                            <button type="button" className="rh-dialog-close" aria-label="Close verification details" onClick={() => setSelectedVerificationRequest(null)}>&times;</button>
                        </div>
                        <dl className="rh-details">
                            {[
                                ["Company Logo", selectedVerificationRequest.companyLogoUrl ? <img className="admin-drive-logo" src={selectedVerificationRequest.companyLogoUrl} alt={`${selectedVerificationRequest.companyName} logo`} /> : "Not provided"],
                                ["Company Name", selectedVerificationRequest.companyName],
                                ["Recruiter Name", selectedVerificationRequest.fullName],
                                ["Designation", selectedVerificationRequest.designation],
                                ["HR / Talent Acquisition", selectedVerificationRequest.hrTalentAcquisition],
                                ["Official Email", selectedVerificationRequest.officialEmail || selectedVerificationRequest.email],
                                ["Phone", selectedVerificationRequest.phone],
                                ["Location", selectedVerificationRequest.location],
                                ["Website", selectedVerificationRequest.website],
                                ["LinkedIn", selectedVerificationRequest.linkedInUrl || selectedVerificationRequest.linkedInProfile],
                                ["Industry", selectedVerificationRequest.industry],
                                ["Company Type", selectedVerificationRequest.companyType],
                                ["Company Size", selectedVerificationRequest.companySize],
                                ["Founded Year", selectedVerificationRequest.foundedYear],
                                ["Company Description", selectedVerificationRequest.companyDescription],
                                ["Submitted Date", selectedVerificationRequest.submittedDate ? new Date(selectedVerificationRequest.submittedDate).toLocaleString() : "Not available"],
                                ["Verification Status", selectedVerificationRequest.verificationStatus],
                                ["Approved By", selectedVerificationRequest.approvedBy || "Not applicable"],
                                ["Approved At", selectedVerificationRequest.approvedAt ? new Date(selectedVerificationRequest.approvedAt).toLocaleString() : "Not applicable"],
                                ["Rejected By", selectedVerificationRequest.rejectedBy || "Not applicable"],
                                ["Rejected At", selectedVerificationRequest.rejectedAt ? new Date(selectedVerificationRequest.rejectedAt).toLocaleString() : "Not applicable"],
                                ["Rejection Reason", selectedVerificationRequest.verificationRejectionReason || "Not applicable"]
                            ].map(([label, value]) => (
                                <div key={label}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>
                            ))}
                        </dl>
                    </section>
                </div>
            )}
            {approvalActionDrive && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget && !approvalSubmitting) setApprovalActionDrive(null);
                }}>
                    <section className="rh-dialog rh-panel" role="dialog" aria-modal="true" aria-labelledby="drive-approval-action-heading">
                        <h3 id="drive-approval-action-heading">
                            {approvalAction === "approve" ? "Approve Campus Drive" : approvalAction === "reject" ? "Reject Campus Drive" : "Request Changes"}
                        </h3>
                        <p>{approvalActionDrive.company} · {approvalActionDrive.title}</p>
                        {approvalError && <div className="api-error" role="alert">{approvalError}</div>}
                        <form className="dashboard-form" onSubmit={submitDriveApprovalAction}>
                            {approvalAction !== "approve" && (
                                <div className="form-group">
                                    <label htmlFor="drive-approval-note">
                                        {approvalAction === "reject" ? "Rejection reason" : "Admin notes"}
                                    </label>
                                    <textarea
                                        id="drive-approval-note"
                                        value={approvalNote}
                                        onChange={event => setApprovalNote(event.target.value)}
                                        required
                                    />
                                </div>
                            )}
                            <div className="form-buttons">
                                <button type="submit" className="submit-job-btn" disabled={approvalSubmitting}>
                                    {approvalSubmitting ? "Saving..." : "Confirm"}
                                </button>
                                <button type="button" className="cancel-edit-btn" disabled={approvalSubmitting} onClick={() => setApprovalActionDrive(null)}>Cancel</button>
                            </div>
                        </form>
                    </section>
                </div>
            )}
            {selectedApprovalDrive && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget) setSelectedApprovalDrive(null);
                }}>
                    <section className="rh-dialog rh-panel admin-drive-detail" role="dialog" aria-modal="true" aria-labelledby="drive-detail-heading">
                        <div className="rh-panel-heading">
                            <h3 id="drive-detail-heading">{selectedApprovalDrive.company} · {selectedApprovalDrive.title}</h3>
                            <button type="button" className="rh-dialog-close" aria-label="Close drive details" onClick={() => setSelectedApprovalDrive(null)}>&times;</button>
                        </div>
                        <dl className="rh-details">
                            {[
                                ["Company Logo", selectedApprovalDrive.companyLogoUrl ? <img className="admin-drive-logo" src={selectedApprovalDrive.companyLogoUrl} alt={`${selectedApprovalDrive.company} logo`} /> : "Not provided"],
                                ["Recruiter", selectedApprovalDrive.recruiterName],
                                ["Recruiter Email", selectedApprovalDrive.recruiterEmail],
                                ["Drive ID", selectedApprovalDrive.driveId || selectedApprovalDrive.id],
                                ["Job Position", selectedApprovalDrive.title],
                                ["Job Description", selectedApprovalDrive.description],
                                ["Eligible Course", selectedApprovalDrive.eligibleCourse || "All"],
                                ["Eligible Department", selectedApprovalDrive.eligibleDepartment || "All"],
                                ["Eligible Batch/Semester", selectedApprovalDrive.eligibleSemester || "All"],
                                ["Minimum SPI/CGPA", selectedApprovalDrive.minimumSpiCgpa || "Not specified"],
                                ["10th %", selectedApprovalDrive.minimumTenthPercentage || "Not specified"],
                                ["12th %", selectedApprovalDrive.minimumTwelfthPercentage || "Not specified"],
                                ["Backlog Allowed", selectedApprovalDrive.backlogAllowed ? "Yes" : "No"],
                                ["Required Skills", Array.isArray(selectedApprovalDrive.requiredSkills) ? selectedApprovalDrive.requiredSkills.join(", ") || "Not specified" : "Not specified"],
                                ["Package/CTC", selectedApprovalDrive.salary],
                                ["Job Location", selectedApprovalDrive.location],
                                ["Application Deadline", selectedApprovalDrive.deadline],
                                ["Number of Vacancies", selectedApprovalDrive.vacancies || "Not specified"],
                                ["Selection Process", selectedApprovalDrive.selectionProcess || "Not specified"],
                                ["Created Date", selectedApprovalDrive.createdAt ? new Date(selectedApprovalDrive.createdAt).toLocaleDateString() : "Not available"]
                            ].map(([label, value]) => (
                                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                            ))}
                        </dl>
                    </section>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
