import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Hero from "../components/Hero";
import JobList from "../components/JobList";
import { initialStats, initialCompanies } from "../data/initialData";

function Home({ jobs, loggedInUser, onApply }) {
    const navigate = useNavigate();
    const [searchState, setSearchState] = useState({
        title: "",
        location: ""
    });

    function handleSearchChange(e) {
        setSearchState({
            ...searchState,
            [e.target.name]: e.target.value
        });
    }

    function handleSearchSubmit(e) {
        e.preventDefault();
        // Redirect to jobs page with state containing filters
        navigate("/jobs", { state: searchState });
    }

    // Limit featured jobs to 3 or 4
    const featuredJobs = jobs.slice(0, 4);

    return (
        <div className="home-page">
            <Hero />

            {/* Search Section */}
            <section className="search-section">
                <h2>Find Your Next Career Move</h2>
                <form onSubmit={handleSearchSubmit} className="search-box">
                    <input
                        type="text"
                        name="title"
                        placeholder="Search by job title or keyword..."
                        value={searchState.title}
                        onChange={handleSearchChange}
                    />
                    <input
                        type="text"
                        name="location"
                        placeholder="Search by location..."
                        value={searchState.location}
                        onChange={handleSearchChange}
                    />
                    <button type="submit">Search Jobs</button>
                </form>
            </section>

            {/* Statistics Section */}
            <section className="stats-section">
                <div className="section-header">
                    <h2>LJ University Placement Statistics</h2>
                    <p>Track our performance and placement success</p>
                </div>
                <div className="stats">
                    {initialStats.map(stat => (
                        <div className="stat-card" key={stat.id}>
                            <h2>{stat.count}</h2>
                            <p>{stat.label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Featured Jobs Section */}
            <section className="featured-jobs-section">
                <div className="section-header">
                    <h2>Featured Job Openings</h2>
                    <p>Handpicked placements for LJ students</p>
                </div>
                <JobList 
                    jobs={featuredJobs} 
                    loggedInUser={loggedInUser} 
                    onApply={onApply} 
                />
                <div className="view-all-container">
                    <button className="view-all-btn" onClick={() => navigate("/jobs")}>
                        View All Jobs
                    </button>
                </div>
            </section>

            {/* Recruiters Section */}
            <section className="companies-section">
                <div className="section-header">
                    <h2>Top Hiring Partners</h2>
                    <p>LJ University students are hired by top global brands</p>
                </div>
                <div className="company-grid">
                    {initialCompanies.map(company => (
                        <div className="company-card" key={company.id}>
                            <div className="company-logo">{company.logoText}</div>
                            <h3>{company.name}</h3>
                            <p>Verify placements</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

export default Home;
