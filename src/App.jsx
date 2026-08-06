import { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";

// Components
import Header from "./components/Header";
import Footer from "./components/Footer";

// Pages
import Home from "./pages/Home";
import JobsPage from "./pages/JobsPage";
import StudentRegister from "./pages/StudentRegister";
import StudentLogin from "./pages/StudentLogin";
import StudentDashboard from "./pages/StudentDashboard";
import RecruiterRegister from "./pages/RecruiterRegister";
import RecruiterLogin from "./pages/RecruiterLogin";
import RecruiterDashboard from "./pages/RecruiterDashboard";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";

// Initial Data
import { initialJobs } from "./data/initialData";

function App() {
  // Application State
  const [jobs, setJobs] = useState(initialJobs);
  const [students, setStudents] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [appliedJobs, setAppliedJobs] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Sync / Load Admin Tables on event (Admin Login or Manual Refresh)
  async function refreshAdminData() {
    try {
      const studentRes = await fetch("http://localhost:5000/api/students");
      if (studentRes.ok) {
        const studentData = await studentRes.ok ? await studentRes.json() : [];
        setStudents(studentData);
      }

      const recruiterRes = await fetch("http://localhost:5000/api/recruiters");
      if (recruiterRes.ok) {
        const recruiterData = await recruiterRes.json();
        setRecruiters(recruiterData);
      }

      const jobsRes = await fetch("http://localhost:5000/api/jobs");
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }
    } catch (err) {
      console.error("Failed to sync backend data:", err);
    }
  }

  // Set logged in admin and fetch tables immediately in callback
  function handleAdminLoginSuccess(user) {
    setLoggedInUser(user);
    refreshAdminData();
  }

  // Logout handler
  function handleLogout() {
    setLoggedInUser(null);
    setAppliedJobs([]);
  }

  // Job state modifiers (called after successful backend API response in pages)
  function addJob(newJob) {
    setJobs([newJob, ...jobs]);
  }

  function editJob(updatedJob) {
    setJobs(jobs.map(job => job.id === updatedJob.id ? updatedJob : job));
  }

  function deleteJob(jobId) {
    setJobs(jobs.filter(job => job.id !== jobId));
  }

  // Student apply handler
  function applyToJob(job) {
    // Check if already applied
    if (appliedJobs.some(j => j.id === job.id)) return;
    setAppliedJobs([...appliedJobs, job]);
  }

  return (
    <Router>
      <Header loggedInUser={loggedInUser} handleLogout={handleLogout} />
      
      <main className="main-content">
        <Routes>
          {/* Landing / Home Page */}
          <Route 
            path="/" 
            element={
              <Home 
                jobs={jobs} 
                loggedInUser={loggedInUser} 
                onApply={applyToJob} 
              />
            } 
          />

          {/* Job Listings Page */}
          <Route 
            path="/jobs" 
            element={
              <JobsPage 
                jobs={jobs} 
                loggedInUser={loggedInUser} 
                onApply={applyToJob} 
              />
            } 
          />

          {/* Student Routes */}
          <Route path="/student/register" element={<StudentRegister />} />
          <Route 
            path="/student/login" 
            element={<StudentLogin setLoggedInUser={setLoggedInUser} />} 
          />
          <Route 
            path="/student/dashboard" 
            element={
              <StudentDashboard 
                loggedInUser={loggedInUser} 
                appliedJobs={appliedJobs} 
              />
            } 
          />

          {/* Recruiter Routes */}
          <Route path="/recruiter/register" element={<RecruiterRegister />} />
          <Route 
            path="/recruiter/login" 
            element={<RecruiterLogin setLoggedInUser={setLoggedInUser} />} 
          />
          <Route 
            path="/recruiter/dashboard" 
            element={
              <RecruiterDashboard 
                loggedInUser={loggedInUser} 
                jobs={jobs} 
                onAddJob={addJob} 
                onEditJob={editJob} 
                onDeleteJob={deleteJob} 
              />
            } 
          />

          {/* Admin Routes */}
          <Route 
            path="/admin/login" 
            element={<AdminLogin setLoggedInUser={handleAdminLoginSuccess} />} 
          />
          <Route 
            path="/admin/dashboard" 
            element={
              <AdminDashboard 
                loggedInUser={loggedInUser} 
                jobs={jobs} 
                students={students} 
                recruiters={recruiters} 
                onAddJob={addJob} 
                onEditJob={editJob} 
                onDeleteJob={deleteJob} 
                refreshAdminData={refreshAdminData}
              />
            } 
          />
        </Routes>
      </main>

      <Footer />
    </Router>
  );
}

export default App;