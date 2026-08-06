import JobCard from "./JobCard";

function JobList({ jobs, loggedInUser, onApply, onEdit, onDelete }) {
    if (!jobs || jobs.length === 0) {
        return (
            <div className="no-jobs">
                <p>No jobs found matching your criteria.</p>
            </div>
        );
    }

    return (
        <div className="job-container">
            {jobs.map((job) => (
                <JobCard
                    key={job.id}
                    job={job}
                    loggedInUser={loggedInUser}
                    onApply={onApply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
}

export default JobList;