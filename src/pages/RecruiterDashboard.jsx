import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/api";

function RecruiterDashboard({ loggedInUser, jobs, onAddJob, onEditJob, onDeleteJob }) {
    const navigate = useNavigate();

    // Check if recruiter is logged in
    if (!loggedInUser || loggedInUser.role !== 'recruiter') {
        return (
            <div className="unauthorized-container">
                <h2>Access Denied</h2>
                <p>Please log in as a recruiter to access this panel.</p>
                <button onClick={() => navigate("/recruiter/login")}>Go to Recruiter Login</button>
            </div>
        );
    }

    // Filter jobs posted by this recruiter's company
    const companyJobs = jobs.filter(
        job => job.company.toLowerCase() === loggedInUser.companyName.toLowerCase()
    );

    // Single State Object for form (Add / Edit Job)
    const [form, setForm] = useState({
        title: "",
        company: loggedInUser.companyName, // Read-only / auto-populated
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

        if (!form.title.trim()) {
            newErrors.title = "Job Title is required";
        }
        if (!form.location.trim()) {
            newErrors.location = "Location is required";
        }
        if (!form.salary.trim()) {
            newErrors.salary = "Salary package is required (e.g. 6 LPA)";
        }
        if (!form.jobType) {
            newErrors.jobType = "Select a Job Type";
        }
        if (!form.description.trim()) {
            newErrors.description = "Job Description is required";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    async function handleSubmit(e) {
        e.preventDefault(); // Prevent page reload

        if (!validate()) {
            return;
        }

        if (isEditing) {
            // Edit mode
            try {
                const response = await fetch(apiUrl(`jobs/${editingJobId}`), {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json"
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
            // Create mode
            try {
                const response = await fetch(apiUrl("jobs"), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
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
    }

    async function handleDeleteClick(jobId) {
        if (!window.confirm("Are you sure you want to delete this job post?")) {
            return;
        }

        try {
            const response = await fetch(apiUrl(`jobs/${jobId}`), {
                method: "DELETE"
            });

            if (response.ok) {
                alert("Job Deleted Successfully!");
                onDeleteJob(jobId);
                if (isEditing && editingJobId === jobId) {
                    resetForm();
                }
            } else {
                alert("Failed to delete job.");
            }
        } catch (err) {
            console.error(err);
            alert("Error deleting job from server.");
        }
    }

    function resetForm() {
        setForm({
            title: "",
            company: loggedInUser.companyName,
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
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h2>Recruiter Dashboard</h2>
                <p>Post placement listings and manage job openings for <strong>{loggedInUser.companyName}</strong></p>
            </div>

            <div className="dashboard-grid">
                {/* Form Card (Post/Edit Job) */}
                <div className="form-card-container">
                    <h3>{isEditing ? "Edit Job Posting" : "Post a New Placement Job"}</h3>
                    {errors.apiError && <div className="api-error">{errors.apiError}</div>}
                    
                    <form onSubmit={handleSubmit} className="dashboard-form">
                        <div className="form-group">
                            <label>Hiring Company</label>
                            <input
                                type="text"
                                name="company"
                                value={form.company}
                                disabled
                                className="disabled-input"
                            />
                        </div>

                        <div className="form-group">
                            <label>Job Title</label>
                            <input
                                type="text"
                                name="title"
                                placeholder="e.g. Node.js Developer"
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
                                placeholder="e.g. Ahmedabad, Remote"
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
                                placeholder="e.g. 8.5 LPA"
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
                                placeholder="Describe roles, requirements, and tech stack needed..."
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

                {/* Job List Card */}
                <div className="jobs-list-container">
                    <h3>Your Job Postings ({companyJobs.length})</h3>
                    {companyJobs.length === 0 ? (
                        <div className="empty-state">
                            <p>No job postings created by your company yet.</p>
                        </div>
                    ) : (
                        <div className="recruiter-jobs-list">
                            {companyJobs.map(job => (
                                <div className="recruiter-job-card" key={job.id}>
                                    <div className="job-summary">
                                        <h4>{job.title}</h4>
                                        <div className="meta">
                                            <span>📍 {job.location}</span>
                                            <span>💰 {job.salary}</span>
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
        </div>
    );
}

export default RecruiterDashboard;
