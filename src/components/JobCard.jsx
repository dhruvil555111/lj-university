import { useState } from "react";
import { Link } from "react-router-dom";

function JobCard({ job, loggedInUser, onApply, onEdit, onDelete, appliedJobs = [] }) {
    const { id, title, company, location, salary, jobType, description } = job;
    const [justApplied, setJustApplied] = useState(false);
    const [applying, setApplying] = useState(false);
    const [applyError, setApplyError] = useState("");
    const applied = justApplied || appliedJobs.some(appliedJob => appliedJob.id === id);
    const closed = Boolean(job.deadline && job.deadline < new Date().toISOString().slice(0, 10));

    async function handleApplyClick() {
        if (!loggedInUser || loggedInUser.role !== 'student') {
            alert("Please log in as a student to apply.");
            return;
        }
        setApplying(true);
        setApplyError("");
        try {
            await onApply(job);
            setJustApplied(true);
            alert("Application Submitted Successfully");
        } catch (error) {
            setApplyError(error.message || "Unable to submit your application.");
        } finally {
            setApplying(false);
        }
    }

    return (
        <div className="card">
            <div className="card-header">
                <span className="job-badge">{jobType}</span>
                <span className="job-salary">{salary}</span>
            </div>
            <h3>{title}</h3>
            <h4 className="card-company">{company}</h4>
            <p className="card-location">📍 {location}</p>
            <p className="card-description">{description}</p>
            
            <div className="card-actions">
                {loggedInUser && loggedInUser.role === 'admin' ? (
                    <div className="admin-actions">
                        <button className="edit-btn" onClick={() => onEdit(job)}>Edit</button>
                        <button className="delete-btn" onClick={() => onDelete(id)}>Delete</button>
                    </div>
                ) : loggedInUser && loggedInUser.role === 'recruiter' ? (
                    <Link className="apply-btn" to="/recruiter/dashboard">Manage your placements</Link>
                ) : (
                    <button 
                        className={`apply-btn ${applied ? 'applied' : ''}`} 
                        onClick={handleApplyClick}
                        disabled={applied || applying || closed}
                    >
                        {closed ? "Applications closed" : applied ? "Applied ✓" : applying ? "Applying..." : "Apply Now"}
                    </button>
                )}
            </div>
            {applyError && <p className="field-error" role="alert">{applyError}</p>}
        </div>
    );
}

export default JobCard;