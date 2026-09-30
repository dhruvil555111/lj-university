import { useCallback, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import { apiUrl } from "./lib/api";

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
import RecruiterHome from "./pages/RecruiterHome";
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
  const [loggedInUser, setLoggedInUser] = useState(() => {
    try {
      const session = JSON.parse(localStorage.getItem("ljRecruiterSession"));
      return session?.role === "recruiter" ? session : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("jobs"), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load placement listings.");
        setJobs(await response.json());
      })
      .catch(error => {
        if (error.name !== "AbortError") console.error("Failed to load placements:", error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (loggedInUser?.role !== "student" || !loggedInUser.sessionToken) {
      return undefined;
    }
    const controller = new AbortController();
    async function loadApplications() {
      try {
        const response = await fetch(apiUrl("students/me/applications"), {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load your applications.");
        setAppliedJobs(data.applications);
      } catch (error) {
        if (error.name !== "AbortError") console.error("Failed to load student applications:", error);
      }
    }
    loadApplications();
    const intervalId = window.setInterval(loadApplications, 15000);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [loggedInUser?.role, loggedInUser?.sessionToken]);

  // Sync / Load Admin Tables on event (Admin Login or Manual Refresh)
  async function refreshAdminData() {
    try {
      const studentRes = await fetch(apiUrl("students"));
      if (studentRes.ok) {
        const studentData = await studentRes.ok ? await studentRes.json() : [];
        setStudents(studentData);
      }

      const recruiterRes = await fetch(apiUrl("recruiters"));
      if (recruiterRes.ok) {
        const recruiterData = await recruiterRes.json();
        setRecruiters(recruiterData);
      }

      const jobsRes = await fetch(apiUrl("jobs"));
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
  const handleLogout = useCallback(() => {
    if (loggedInUser?.sessionToken && ["recruiter", "admin"].includes(loggedInUser.role)) {
      fetch(apiUrl(`${loggedInUser.role}/logout`), {
        method: "POST",
        headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
      }).catch(error => console.error("Failed to revoke session:", error));
    }
    localStorage.removeItem("ljRecruiterSession");
    setLoggedInUser(null);
    setAppliedJobs([]);
  }, [loggedInUser]);

  // Job state modifiers (called after successful backend API response in pages)
  function addJob(newJob) {
    setJobs(currentJobs => [newJob, ...currentJobs.filter(job => job.id !== newJob.id)]);
  }

  function editJob(updatedJob) {
    setJobs(currentJobs => currentJobs.map(job => job.id === updatedJob.id ? updatedJob : job));
  }

  function deleteJob(jobId) {
    setJobs(currentJobs => currentJobs.filter(job => job.id !== jobId));
  }

  // Student apply handler
  async function applyToJob(job) {
    if (appliedJobs.some(j => j.id === job.id)) return;
    const response = await fetch(apiUrl("applications"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loggedInUser.sessionToken}`
      },
      body: JSON.stringify({ jobId: job.id })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to submit your application.");
    setAppliedJobs(currentJobs => currentJobs.some(item => String(item.id) === String(job.id))
      ? currentJobs
      : [...currentJobs, { ...job, status: "Applied" }]);
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
                appliedJobs={appliedJobs}
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
                appliedJobs={appliedJobs}
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
              <RecruiterHome
                loggedInUser={loggedInUser} 
                onAddJob={addJob} 
                onEditJob={editJob} 
                onDeleteJob={deleteJob} 
                onLogout={handleLogout}
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