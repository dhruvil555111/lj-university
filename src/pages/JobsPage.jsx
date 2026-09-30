import { useState } from "react";
import { useLocation } from "react-router-dom";
import JobList from "../components/JobList";

function JobsPage({ jobs, loggedInUser, onApply, appliedJobs }) {
    const routeLocation = useLocation();
    
    // Check if search criteria was passed from Home page search box
    const initialSearch = routeLocation.state || { title: "", location: "" };

    const [filters, setFilters] = useState({
        title: initialSearch.title || "",
        company: "",
        location: initialSearch.location || ""
    });

    function handleFilterChange(e) {
        setFilters({
            ...filters,
            [e.target.name]: e.target.value
        });
    }

    function handleResetFilters() {
        setFilters({
            title: "",
            company: "",
            location: ""
        });
    }

    // Filter logic
    const filteredJobs = jobs.filter(job => {
        const matchesTitle = job.title.toLowerCase().includes(filters.title.toLowerCase()) || 
                             job.description.toLowerCase().includes(filters.title.toLowerCase());
        const matchesCompany = filters.company === "" || job.company.toLowerCase() === filters.company.toLowerCase();
        const matchesLocation = filters.location === "" || job.location.toLowerCase().includes(filters.location.toLowerCase());
        
        return matchesTitle && matchesCompany && matchesLocation;
    });

    // Get unique list of companies for select filter dropdown
    const uniqueCompanies = [...new Set(jobs.map(job => job.company))];

    return (
        <div className="jobs-page">
            <div className="jobs-page-header">
                <h2>Browse Open Placement Positions</h2>
                <p>Find the perfect career match matching your skill set</p>
            </div>

            {/* Filter Dashboard Card */}
            <div className="filters-container">
                <h3>Filters Panel</h3>
                <div className="filters-grid">
                    <div className="filter-item">
                        <label>Search Title/Keyword</label>
                        <input
                            type="text"
                            name="title"
                            placeholder="e.g. Developer, React"
                            value={filters.title}
                            onChange={handleFilterChange}
                        />
                    </div>
                    
                    <div className="filter-item">
                        <label>Filter Company</label>
                        <select
                            name="company"
                            value={filters.company}
                            onChange={handleFilterChange}
                        >
                            <option value="">All Companies</option>
                            {uniqueCompanies.map(company => (
                                <option key={company} value={company}>{company}</option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-item">
                        <label>Filter Location</label>
                        <input
                            type="text"
                            name="location"
                            placeholder="e.g. Ahmedabad"
                            value={filters.location}
                            onChange={handleFilterChange}
                        />
                    </div>
                </div>
                <div className="filters-actions">
                    <button className="reset-btn" onClick={handleResetFilters}>Reset Filters</button>
                </div>
            </div>

            {/* Render Job List */}
            <div className="jobs-results">
                <h3>Found {filteredJobs.length} matching jobs</h3>
                <JobList 
                    jobs={filteredJobs} 
                    loggedInUser={loggedInUser} 
                    onApply={onApply} 
                    appliedJobs={appliedJobs}
                />
            </div>
        </div>
    );
}

export default JobsPage;
