import { useState } from "react";

function JobCard({ job, loggedInUser, onApply, onEdit, onDelete }) {
    const { id, title, company, location, salary, jobType, description } = job;
    const [applied, setApplied] = useState(false);

    function handleApplyClick() {
        if (!loggedInUser || loggedInUser.role !== 'student') {
            alert("Please log in as a student to apply.");
            return;
        }
        setApplied(true);
        if (onApply) onApply(job);
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
                    <div className="recruiter-actions">
                        <button className="edit-btn" onClick={() => onEdit(job)}>Edit</button>
                        <button className="delete-btn" onClick={() => onDelete(id)}>Delete</button>
                    </div>
                ) : (
                    <button 
                        className={`apply-btn ${applied ? 'applied' : ''}`} 
                        onClick={handleApplyClick}
                        disabled={applied}
                    >
                        {applied ? "Applied ✓" : "Apply Now"}
                    </button>
                )}
            </div>
        </div>
    );
}

export default JobCard;