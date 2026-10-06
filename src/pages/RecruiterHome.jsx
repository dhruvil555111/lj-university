import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/api";
import "./RecruiterHome.css";

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

function newDriveForm(companyName = "") {
    return {
        driveId: "",
        title: "",
        company: companyName,
        location: "",
        salary: "",
        jobType: "",
        description: "",
        eligibleCourse: "",
        eligibleDepartment: "",
        eligibleSemester: "",
        minimumSpiCgpa: "",
        minimumTenthPercentage: "",
        minimumTwelfthPercentage: "",
        backlogAllowed: "No",
        requiredSkills: "",
        applicationStartDate: new Date().toISOString().slice(0, 10),
        deadline: "",
        vacancies: "",
        selectionProcess: "",
        driveStatus: "Open"
    };
}

function newProfileForm(user = {}) {
    user = user || {};
    return {
        fullName: user.fullName || "",
        designation: user.designation || "",
        hrTalentAcquisition: user.hrTalentAcquisition || "",
        officialEmail: user.officialEmail || user.email || "",
        phone: user.phone || "",
        linkedInProfile: user.linkedInProfile || "",
        location: user.location || "",
        shortBio: user.shortBio || "",
        companyName: user.companyName || "",
        industry: user.industry || "",
        companyType: user.companyType || "",
        companySize: user.companySize || "",
        foundedYear: user.foundedYear || "",
        website: user.website || "",
        fullAddress: user.fullAddress || "",
        linkedInUrl: user.linkedInUrl || "",
        companyDescription: user.companyDescription || "",
        companyLogoUrl: user.companyLogoUrl || null,
        profilePhotoUrl: user.profilePhotoUrl || null,
        verificationStatus: user.verificationStatus || "Pending",
        verificationRejectionReason: user.verificationRejectionReason || ""
    };
}

function formatDate(value) {
    if (!value) return "No deadline";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "No deadline";
    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function isPostingOpen(posting) {
    if (posting.approvalStatus && posting.approvalStatus !== "Approved") return false;
    if (posting.driveStatus) {
        return posting.driveStatus === "Open"
            && (!posting.applicationStartDate || posting.applicationStartDate <= new Date().toISOString().slice(0, 10))
            && (!posting.deadline || posting.deadline >= new Date().toISOString().slice(0, 10));
    }
    if (posting.status) return posting.status.toLowerCase() === "open";
    return !posting.deadline || posting.deadline >= new Date().toISOString().slice(0, 10);
}

function CompanyLogoBlock({ profile, preview, onFile, onUpload, uploading, error }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const logo = preview || profile.companyLogoUrl;
    return (
        <div className="rh-logo-editor">
            <div className="rh-company-logo-preview">
                {logo
                    ? <img src={logo} alt={`${profile.companyName || "Company"} logo preview`} />
                    : <span>{(profile.companyName || "Company").split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className="rh-logo-controls">
                <label className="rh-btn">
                    Choose Company Logo
                    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event => {
                        const file = event.target.files?.[0] || null;
                        setSelectedFile(file);
                        onFile(file);
                        event.target.value = "";
                    }} />
                </label>
                <button type="button" className="rh-btn rh-btn-primary" disabled={!selectedFile || uploading} onClick={async () => {
                    if (await onUpload(selectedFile)) setSelectedFile(null);
                }}>{uploading ? "Uploading..." : "Save Logo"}</button>
                {error && <div className="api-error" role="alert">{error}</div>}
                <p className="rh-note">JPG, PNG, or WebP, up to 3 MB.</p>
            </div>
        </div>
    );
}

function RecruiterVerificationNotice({ status, reason, onEdit }) {
    if (status === "Approved") {
        return (
            <div className="rh-verification-notice rh-verification-approved" role="status">
                <strong>Company Verified &#10003;</strong>
                <span>You can now create campus drives.</span>
            </div>
        );
    }
    if (status === "Rejected") {
        return (
            <div className="rh-verification-notice rh-verification-rejected" role="status">
                <strong>Company profile was rejected.</strong>
                <span>Reason: {reason || "No reason provided."}</span>
                <button type="button" className="rh-btn" onClick={onEdit}>Edit Profile &amp; Resubmit</button>
            </div>
        );
    }
    if (status === "Changes Requested") {
        return (
            <div className="rh-verification-notice rh-verification-pending" role="status">
                <strong>Changes Requested</strong>
                <span>{reason || "Placement Cell requested updates to your company profile."}</span>
                <button type="button" className="rh-btn" onClick={onEdit}>Edit Profile &amp; Resubmit</button>
            </div>
        );
    }
    return (
        <div className="rh-verification-notice rh-verification-pending" role="status">
            <strong>Pending Placement Cell Verification</strong>
            <span>Company profile is awaiting Placement Cell approval.</span>
            <button type="button" className="rh-btn" onClick={onEdit}>Complete company profile</button>
        </div>
    );
}

function verificationBadgeLabel(status, subject) {
    if (status === "Approved") return subject === "company" ? "Company Verified ✓" : "Verified Recruiter ✓";
    if (status === "Pending") return "Pending Placement Cell Verification";
    return status;
}

function RecruiterHome({ loggedInUser, onAddJob, onEditJob, onDeleteJob, onLogout }) {
    const navigate = useNavigate();
    const formCardRef = useRef(null);
    const [activeSection, setActiveSection] = useState("Dashboard");
    const [postings, setPostings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deletingJobId, setDeletingJobId] = useState(null);
    const [selectedPosting, setSelectedPosting] = useState(null);
    const [selectedDriveDetail, setSelectedDriveDetail] = useState(null);
    const [driveDetailTab, setDriveDetailTab] = useState("Overview");
    const [allApplicants, setAllApplicants] = useState([]);
    const [workflowError, setWorkflowError] = useState("");
    const [savingApplicationId, setSavingApplicationId] = useState(null);
    const [resultEditing, setResultEditing] = useState(null);
    const [offerUploadingId, setOfferUploadingId] = useState(null);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [applicants, setApplicants] = useState([]);
    const [applicantsLoading, setApplicantsLoading] = useState(false);
    const [applicantsError, setApplicantsError] = useState("");
    const [schedulingApplication, setSchedulingApplication] = useState(null);
    const [scheduleForm, setScheduleForm] = useState({
        interviewDate: "",
        interviewTime: "",
        interviewType: "",
        locationOrMeetingLink: "",
        notes: ""
    });
    const [scheduleError, setScheduleError] = useState("");
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [completingApplicationId, setCompletingApplicationId] = useState(null);
    const [form, setForm] = useState(() => newDriveForm());
    const [errors, setErrors] = useState({});
    const [editingJobId, setEditingJobId] = useState(null);
    const [editingResubmission, setEditingResubmission] = useState(false);
    const [recruiterProfile, setRecruiterProfile] = useState(() => newProfileForm(loggedInUser));
    const [profileForm, setProfileForm] = useState(() => newProfileForm(loggedInUser));
    const [profileEditing, setProfileEditing] = useState(false);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState("");
    const [profileNotice, setProfileNotice] = useState("");
    const [companyLogoPreview, setCompanyLogoPreview] = useState("");
    const [logoUploading, setLogoUploading] = useState(false);
    const [logoError, setLogoError] = useState("");
    const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoError, setPhotoError] = useState("");

    useEffect(() => {
        if (!loggedInUser || loggedInUser.role !== "recruiter") return undefined;
        const controller = new AbortController();
        async function loadProfile() {
            setProfileLoading(true);
            setProfileError("");
            try {
                const response = await fetch(apiUrl("recruiters/me/profile"), {
                    signal: controller.signal,
                    headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
                });
                const data = await readApiResponse(response);
                const loadedProfile = newProfileForm(data.profile || loggedInUser);
                setRecruiterProfile(loadedProfile);
                setProfileForm(loadedProfile);
            } catch (error) {
                if (error.name !== "AbortError") {
                    console.error("Failed to load recruiter profile:", error);
                    setProfileError(error.message || "Unable to load recruiter profile.");
                }
            } finally {
                if (!controller.signal.aborted) setProfileLoading(false);
            }
        }
        loadProfile();
        return () => controller.abort();
    }, [loggedInUser]);

    useEffect(() => {
        if (!loggedInUser || loggedInUser.role !== "recruiter") return undefined;
        const controller = new AbortController();

        async function loadPlacements() {
            setLoading(true);
            setListError("");
            try {
                const response = await fetch(apiUrl("recruiters/me/placements"), {
                    signal: controller.signal,
                    headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
                });
                let data;
                try {
                    data = await readApiResponse(response);
                } catch (error) {
                    if (response.status === 401) {
                        onLogout();
                        navigate("/recruiter/login", { replace: true });
                        return;
                    }
                    throw error;
                }
                setPostings(Array.isArray(data.placements) ? data.placements : []);
            } catch (error) {
                if (error.name !== "AbortError") {
                    console.error("Failed to load recruiter placements:", error);
                    setListError(error.message || "Unable to load your placements.");
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        loadPlacements();
        return () => controller.abort();
    }, [loggedInUser, navigate, onLogout]);

    useEffect(() => {
        if (!loggedInUser || loggedInUser.role !== "recruiter" || postings.length === 0) {
            return undefined;
        }
        const controller = new AbortController();
        async function loadDriveApplicants() {
            try {
                const responses = await Promise.all(postings.map(async posting => {
                    const response = await fetch(
                        apiUrl(`recruiters/me/placements/${posting.id}/applicants`),
                        {
                            signal: controller.signal,
                            headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
                        }
                    );
                    const data = await readApiResponse(response);
                    return (Array.isArray(data.applicants) ? data.applicants : [])
                        .map(applicant => ({ ...applicant, jobTitle: posting.title, jobId: posting.id, company: posting.company }));
                }));
                setAllApplicants(responses.flat());
                setWorkflowError("");
            } catch (error) {
                if (error.name !== "AbortError") {
                    console.error("Failed to load recruiter application workflow:", error);
                    setWorkflowError(error.message || "Unable to load student applications.");
                }
            }
        }
        loadDriveApplicants();
        return () => controller.abort();
    }, [loggedInUser, postings]);

    const orderedPostings = useMemo(
        () => [...postings].sort((first, second) =>
            (first.deadline || "9999-12-31").localeCompare(second.deadline || "9999-12-31")),
        [postings]
    );
    const openCount = postings.filter(isPostingOpen).length;
    const applicantTotal = postings.reduce(
        (total, posting) => total + (Number(posting.applicantsCount) || 0),
        0
    );
    const shortlistedApplicants = allApplicants.filter(applicant => applicant.status === "Shortlisted");
    const selectedApplicants = allApplicants.filter(applicant =>
        applicant.finalStatus === "Selected" || applicant.status === "Selected"
    );
    const waitlistedApplicants = allApplicants.filter(applicant =>
        applicant.finalStatus === "Waitlisted" || applicant.status === "Waitlisted"
    );
    const rejectedApplicants = allApplicants.filter(applicant =>
        applicant.finalStatus === "Rejected" || applicant.status === "Rejected"
    );
    const interviewApplicants = allApplicants.filter(applicant =>
        ["Interview", "Pending Admin Approval", "Interview Scheduled", "Interview Completed", "Completed"].includes(applicant.status)
    );
    const pendingApprovalCount = postings.filter(posting => posting.approvalStatus === "Pending Admin Approval").length;
    const changesRequestedCount = postings.filter(posting => posting.approvalStatus === "Changes Requested").length;
    const rejectedDriveCount = postings.filter(posting => posting.approvalStatus === "Rejected").length;
    const approvedDriveCount = postings.filter(posting => posting.approvalStatus === "Approved").length;
    const verificationStatus = recruiterProfile.verificationStatus || "Pending";
    const recruiterVerified = verificationStatus === "Approved";
    const profileCompletionFields = [
        profileForm.fullName, profileForm.designation, profileForm.shortBio, profileForm.officialEmail,
        profileForm.phone, profileForm.linkedInProfile, profileForm.location,
        profileForm.companyName, profileForm.industry, profileForm.companyType,
        profileForm.companySize, profileForm.foundedYear, profileForm.website, profileForm.fullAddress,
        profileForm.linkedInUrl, profileForm.companyDescription, profileForm.companyLogoUrl
    ];
    const profileCompletion = Math.round(
        profileCompletionFields.filter(value => String(value || "").trim()).length
        / profileCompletionFields.length * 100
    );
    const sections = [
        "Dashboard",
        "Company Profile",
        "Recruiter Profile",
        "Company Logo",
        "Company Information",
        "Campus Drives",
        "Student Applications",
        "Shortlisted Students",
        "Interview Schedule",
        "Final Results",
        "Offer Letters",
        "Placement Cell Messages",
        "Notifications",
        "Settings"
    ];
    const companyInitials = (loggedInUser?.companyName || "Company")
        .split(/\s+/)
        .map(word => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    if (!loggedInUser || loggedInUser.role !== "recruiter") {
        return (
            <div className="unauthorized-container">
                <h2>Recruiter login required</h2>
                <p>Please log in as a recruiter to manage your placement listings.</p>
                <button type="button" onClick={() => navigate("/recruiter/login")}>Go to Recruiter Login</button>
            </div>
        );
    }

    function openForm() {
        if (!recruiterVerified) {
            setActiveSection("Company Profile");
            setProfileNotice("Your company profile must be approved by the Placement Cell before you can create a campus drive.");
            return;
        }
        setShowForm(true);
        window.requestAnimationFrame(() => {
            formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    function startProfileEdit() {
        setProfileForm({ ...recruiterProfile });
        setProfileError("");
        setProfileNotice("");
        setCompanyLogoPreview("");
        setProfileEditing(true);
    }

    function cancelProfileEdit() {
        setProfileForm({ ...recruiterProfile });
        setProfileError("");
        setProfileNotice("");
        setProfilePhotoPreview("");
        setCompanyLogoPreview("");
        setProfileEditing(false);
    }

    async function saveRecruiterProfile(event) {
        event.preventDefault();
        if (profileForm.fullName.trim().length < 2) {
            setProfileError("Enter your full name.");
            return;
        }
        if (!profileForm.designation.trim()) {
            setProfileError("Enter your designation.");
            return;
        }
        if (!profileForm.companyName.trim()) {
            setProfileError("Enter your company name.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(profileForm.officialEmail.trim())) {
            setProfileError("Enter a valid official company email.");
            return;
        }
        if (!/^\+?[0-9()\-\s]{7,20}$/.test(profileForm.phone.trim())) {
            setProfileError("Enter a valid phone number.");
            return;
        }
        for (const [label, url] of [
            ["LinkedIn profile", profileForm.linkedInProfile],
            ["Website", profileForm.website],
            ["LinkedIn URL", profileForm.linkedInUrl]
        ]) {
            if (url && !/^https?:\/\/\S+$/i.test(url)) {
                setProfileError(`${label} must be a valid HTTP or HTTPS URL.`);
                return;
            }
        }
        setProfileSaving(true);
        setProfileError("");
        setProfileNotice("");
        try {
            const response = await fetch(apiUrl("recruiters/me/profile"), {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${loggedInUser.sessionToken}`
                },
                body: JSON.stringify(profileForm)
            });
            const data = await readApiResponse(response);
            const savedProfile = newProfileForm(data.profile);
            setRecruiterProfile(savedProfile);
            setProfileForm(savedProfile);
            setProfileEditing(false);
            setProfileNotice("Profile saved and submitted for Placement Cell verification.");
            setCompanyLogoPreview("");
        } catch (error) {
            console.error("Failed to save recruiter profile:", error);
            setProfileError(error.message || "Unable to save your profile.");
        } finally {
            setProfileSaving(false);
        }
    }

    async function uploadCompanyLogo(file) {
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            setLogoError("Choose a JPG, PNG, or WebP image.");
            return;
        }
        if (file.size > 3 * 1024 * 1024) {
            setLogoError("Company logo must be 3 MB or smaller.");
            return;
        }
        setLogoUploading(true);
        setLogoError("");
        setProfileNotice("");
        try {
            const payload = new FormData();
            payload.append("companyLogo", file);
            const response = await fetch(apiUrl("recruiters/me/profile/company-logo"), {
                method: "POST",
                headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` },
                body: payload
            });
            const data = await readApiResponse(response);
            const savedProfile = newProfileForm(data.profile);
            setRecruiterProfile(savedProfile);
            setProfileForm(savedProfile);
            setCompanyLogoPreview("");
            setProfileNotice("Company logo saved. Your company profile is now pending Placement Cell verification.");
            return true;
        } catch (error) {
            console.error("Failed to upload company logo:", error);
            setLogoError(error.message || "Unable to upload company logo.");
            return false;
        } finally {
            setLogoUploading(false);
        }
    }

    async function uploadRecruiterPhoto(file) {
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
            setPhotoError("Choose a JPG, PNG, or WebP image up to 3 MB.");
            return;
        }
        setPhotoUploading(true);
        setPhotoError("");
        try {
            const payload = new FormData();
            payload.append("profilePhoto", file);
            const response = await fetch(apiUrl("recruiters/me/profile/photo"), {
                method: "POST",
                headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` },
                body: payload
            });
            const data = await readApiResponse(response);
            const savedProfile = newProfileForm(data.profile);
            setRecruiterProfile(savedProfile);
            setProfileForm(savedProfile);
            setProfilePhotoPreview("");
            setProfileNotice("Profile photo saved. Your recruiter profile is pending Placement Cell verification.");
        } catch (error) {
            console.error("Failed to upload recruiter profile photo:", error);
            setPhotoError(error.message || "Unable to upload profile photo.");
        } finally {
            setPhotoUploading(false);
        }
    }

    function handleLogout() {
        onLogout();
        navigate("/", { replace: true });
    }

    function resetForm() {
        setForm(newDriveForm(loggedInUser.companyName));
        setErrors({});
        setEditingJobId(null);
        setEditingResubmission(false);
        setShowForm(false);
    }

    function handleChange(event) {
        const { name, value } = event.target;
        setForm(current => ({ ...current, [name]: value }));
        setErrors(current => ({ ...current, [name]: "", apiError: "" }));
    }

    function validate() {
        const nextErrors = {};
        if (!form.title.trim()) nextErrors.title = "Job title is required.";
        if (!form.location.trim()) nextErrors.location = "Location is required.";
        if (!form.salary.trim()) nextErrors.salary = "Salary package is required.";
        if (!form.jobType) nextErrors.jobType = "Select a job type.";
        if (!form.description.trim()) nextErrors.description = "Job description is required.";
        if (!form.deadline) nextErrors.deadline = "Application deadline is required.";
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!validate()) return;

        setSubmitting(true);
        setErrors({});
        const isEditing = editingJobId !== null;
        try {
            const response = await fetch(apiUrl(
                isEditing
                    ? `recruiters/me/placements/${editingJobId}`
                    : "recruiters/me/placements"
            ), {
                method: isEditing ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${loggedInUser.sessionToken}`
                },
                body: JSON.stringify({ ...form, resubmitForApproval: editingResubmission })
            });
            const data = await readApiResponse(response);

            if (isEditing) {
                setPostings(current => current.map(posting =>
                    String(posting.id) === String(data.job.id) ? data.job : posting
                ));
                onEditJob(data.job);
            } else {
                setPostings(current => [data.job, ...current]);
                onAddJob(data.job);
            }
            resetForm();
        } catch (error) {
            console.error("Failed to save recruiter placement:", error);
            setErrors({ apiError: error.message || "Unable to save this placement." });
        } finally {
            setSubmitting(false);
        }
    }

    function handleEditClick(posting) {
        setEditingJobId(posting.id);
        setEditingResubmission(posting.approvalStatus === "Changes Requested");
        setForm({
            ...newDriveForm(loggedInUser.companyName),
            driveId: posting.driveId || "",
            title: posting.title || "",
            company: posting.company || loggedInUser.companyName,
            location: posting.location || "",
            salary: posting.salary || "",
            jobType: posting.jobType || "",
            description: posting.description || "",
            eligibleCourse: posting.eligibleCourse || "",
            eligibleDepartment: posting.eligibleDepartment || "",
            eligibleSemester: posting.eligibleSemester || "",
            minimumSpiCgpa: posting.minimumSpiCgpa ?? "",
            minimumTenthPercentage: posting.minimumTenthPercentage ?? "",
            minimumTwelfthPercentage: posting.minimumTwelfthPercentage ?? "",
            backlogAllowed: posting.backlogAllowed ? "Yes" : "No",
            requiredSkills: Array.isArray(posting.requiredSkills) ? posting.requiredSkills.join(", ") : "",
            applicationStartDate: posting.applicationStartDate || "",
            deadline: posting.deadline || "",
            vacancies: posting.vacancies ?? "",
            selectionProcess: posting.selectionProcess || "",
            driveStatus: posting.driveStatus || (posting.status === "open" ? "Open" : "Closed")
        });
        setErrors({});
        openForm();
    }

    async function handleDeleteClick(posting) {
        if (!window.confirm(`Delete "${posting.title}"? This will also remove its applications.`)) return;
        setDeletingJobId(posting.id);
        try {
            const response = await fetch(apiUrl(`recruiters/me/placements/${posting.id}`), {
                method: "DELETE",
                headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
            });
            await readApiResponse(response);
            setPostings(current => current.filter(item => String(item.id) !== String(posting.id)));
            onDeleteJob(posting.id);
            setAllApplicants(current => current.filter(item => String(item.jobId) !== String(posting.id)));
            if (String(editingJobId) === String(posting.id)) resetForm();
        } catch (error) {
            console.error("Failed to delete recruiter placement:", error);
            setListError(error.message || "Unable to delete this placement.");
        } finally {
            setDeletingJobId(null);
        }
    }

    async function handleViewApplicants(posting) {
        setSelectedPosting(posting);
        setApplicants([]);
        setApplicantsError("");
        setApplicantsLoading(true);
        try {
            const response = await fetch(
                apiUrl(`recruiters/me/placements/${posting.id}/applicants`),
                { headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` } }
            );
            const data = await readApiResponse(response);
            setApplicants(Array.isArray(data.applicants) ? data.applicants : []);
        } catch (error) {
            console.error("Failed to load placement applicants:", error);
            setApplicantsError(error.message || "Unable to load applicants.");
        } finally {
            setApplicantsLoading(false);
        }
    }

    function startScheduling(application) {
        const posting = postings.find(item => String(item.id) === String(application.jobId));
        if (posting) setSelectedPosting(posting);
        setScheduleForm({
            interviewDate: "",
            interviewTime: "",
            interviewType: "",
            locationOrMeetingLink: "",
            notes: "",
            interviewRound: "",
            interviewer: ""
        });
        setScheduleError("");
        setSchedulingApplication(application);
    }

    async function handleScheduleInterview(event) {
        event.preventDefault();
        setSavingSchedule(true);
        setScheduleError("");
        try {
            const response = await fetch(
                apiUrl(`recruiters/me/applications/${schedulingApplication.id}/interview`),
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${loggedInUser.sessionToken}`
                    },
                    body: JSON.stringify(scheduleForm)
                }
            );
            const data = await readApiResponse(response);
            setApplicants(current => current.map(applicant =>
                applicant.id === data.application.id ? data.application : applicant
            ));
            setSchedulingApplication(null);
        } catch (error) {
            console.error("Failed to propose an interview:", error);
            setScheduleError(error.message || "Unable to propose an interview.");
        } finally {
            setSavingSchedule(false);
        }
    }

    async function handleCompleteInterview(application) {
        setCompletingApplicationId(application.id);
        try {
            const response = await fetch(
                apiUrl(`recruiters/me/applications/${application.id}/interview/complete`),
                {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
                }
            );
            const data = await readApiResponse(response);
            setApplicants(current => current.map(applicant =>
                applicant.id === data.application.id ? data.application : applicant
            ));
        } catch (error) {
            console.error("Failed to complete interview:", error);
            setApplicantsError(error.message || "Unable to complete interview.");
        } finally {
            setCompletingApplicationId(null);
        }
    }

    async function handleDriveStatus(posting, driveStatus) {
        setWorkflowError("");
        try {
            const response = await fetch(apiUrl(`recruiters/me/placements/${posting.id}`), {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${loggedInUser.sessionToken}`
                },
                body: JSON.stringify({
                    ...posting,
                    backlogAllowed: posting.backlogAllowed ? "Yes" : "No",
                    requiredSkills: Array.isArray(posting.requiredSkills) ? posting.requiredSkills : [],
                    driveStatus
                })
            });
            const data = await readApiResponse(response);
            setPostings(current => current.map(item =>
                String(item.id) === String(posting.id) ? data.job : item
            ));
            onEditJob(data.job);
            if (selectedDriveDetail && String(selectedDriveDetail.id) === String(posting.id)) {
                setSelectedDriveDetail(data.job);
            }
        } catch (error) {
            console.error("Failed to update campus drive status:", error);
            setWorkflowError(error.message || "Unable to update campus drive status.");
        }
    }

    async function cancelInterview(application) {
        setSavingApplicationId(application.id);
        try {
            const response = await fetch(apiUrl(`recruiters/me/applications/${application.id}/interview/cancel`), {
                method: "PATCH",
                headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
            });
            const data = await readApiResponse(response);
            const updated = { ...application, ...data.application };
            setAllApplicants(current => current.map(item => item.id === application.id ? updated : item));
            setApplicants(current => current.map(item => item.id === application.id ? updated : item));
        } catch (error) {
            console.error("Failed to cancel interview:", error);
            setWorkflowError(error.message || "Unable to cancel the interview.");
        } finally {
            setSavingApplicationId(null);
        }
    }

    function renderApplicantCard(applicant, shortlistedOnly = false) {
        const isFinal = ["Selected", "Rejected", "Waitlisted"].includes(applicant.finalStatus || applicant.status);
        return (
            <li className="rh-applicant rh-workflow-applicant" key={applicant.id}>
                <div className="rh-candidate-heading">
                    <div>
                        <h3>{applicant.fullName || "Student"}</h3>
                        <p>{applicant.jobTitle} · Applied {formatDate(applicant.appliedAt?.slice(0, 10))}</p>
                    </div>
                    <span className={`rh-status rh-status-${(applicant.status || "Applied").toLowerCase().replaceAll(" ", "-")}`}>
                        {applicant.status || "Applied"}
                    </span>
                </div>
                <dl className="rh-candidate-details">
                    <div><dt>Enrollment</dt><dd>{applicant.enrollment || "Not provided"}</dd></div>
                    <div><dt>Course</dt><dd>{applicant.course || applicant.department || "Not provided"}</dd></div>
                    <div><dt>Department</dt><dd>{applicant.department || "Not provided"}</dd></div>
                    <div><dt>Semester</dt><dd>{applicant.semester || "Not provided"}</dd></div>
                    <div><dt>SPI/CGPA</dt><dd>{applicant.spiCgpi ?? "Not provided"}</dd></div>
                    <div><dt>10th %</dt><dd>{applicant.tenthPercentage ?? "Not provided"}</dd></div>
                    <div><dt>12th %</dt><dd>{applicant.twelfthPercentage ?? "Not provided"}</dd></div>
                    <div><dt>Eligibility</dt><dd>{applicant.eligibility || "Profile criteria checked"}</dd></div>
                    <div className="rh-candidate-skills"><dt>Skills</dt><dd>{Array.isArray(applicant.skills) ? applicant.skills.join(", ") || "Not provided" : applicant.skills || "Not provided"}</dd></div>
                </dl>
                <div className="rh-applicant-actions">
                    <button type="button" className="rh-btn" onClick={() => setSelectedCandidate(applicant)}>View Student Profile</button>
                    {applicant.resumeUrl || applicant.result ? (
                        <a className="rh-btn" href={applicant.resumeUrl || applicant.result} target="_blank" rel="noreferrer">View Resume</a>
                    ) : <span className="rh-note">Resume not provided</span>}
                    {shortlistedOnly ? (
                        <>
                            <button type="button" className="rh-btn rh-btn-primary" onClick={() => startScheduling(applicant)}>Schedule Interview</button>
                            <button type="button" className="rh-btn rh-btn-danger" onClick={() => updateApplicationStatus(applicant, "Rejected")}>Reject</button>
                        </>
                    ) : (
                        <>
                            {!["Under Review", "Shortlisted", "Interview", "Interview Scheduled", "Interview Completed", "Completed"].includes(applicant.status) && (
                                <button type="button" className="rh-btn" disabled={savingApplicationId === applicant.id} onClick={() => updateApplicationStatus(applicant, "Under Review")}>Under Review</button>
                            )}
                            {!["Shortlisted", "Interview", "Interview Scheduled", "Interview Completed", "Completed", "Selected"].includes(applicant.status) && (
                                <button type="button" className="rh-btn rh-btn-primary" disabled={savingApplicationId === applicant.id} onClick={() => updateApplicationStatus(applicant, "Shortlisted")}>Shortlist</button>
                            )}
                            {!isFinal && !["Rejected", "Interview Scheduled", "Interview Completed", "Completed"].includes(applicant.status) && (
                                <button type="button" className="rh-btn rh-btn-danger" disabled={savingApplicationId === applicant.id} onClick={() => updateApplicationStatus(applicant, "Rejected")}>Reject</button>
                            )}
                            {["Shortlisted", "Interview"].includes(applicant.status) && (
                                <button type="button" className="rh-btn" onClick={() => {
                                    updateApplicationStatus(applicant, "Interview");
                                    startScheduling(applicant);
                                }}>Move to Interview</button>
                            )}
                        </>
                    )}
                </div>
                {applicant.status === "Interview Scheduled" && (
                    <div className="rh-interview-summary">
                        <strong>{applicant.workflow?.interviewRound || "Interview"} · {formatDate(applicant.proposedDate)} at {applicant.proposedTime}</strong>
                        <span>{applicant.interviewType} · {applicant.locationOrMeetingLink}</span>
                        {applicant.workflow?.interviewer && <span>Panel: {applicant.workflow.interviewer}</span>}
                        {applicant.notes && <span>Notes: {applicant.notes}</span>}
                        <div className="rh-inline-actions">
                            <button type="button" className="rh-btn" onClick={() => startScheduling(applicant)}>Reschedule</button>
                            <button type="button" className="rh-btn rh-btn-danger" disabled={savingApplicationId === applicant.id} onClick={() => cancelInterview(applicant)}>Cancel Interview</button>
                            {applicant.canComplete && <button type="button" className="rh-btn rh-btn-primary" disabled={completingApplicationId === applicant.id} onClick={() => handleCompleteInterview(applicant)}>Mark Completed</button>}
                        </div>
                    </div>
                )}
                {applicant.status === "Pending Admin Approval" && (
                    <p className="rh-approval-notice">Interview proposal pending placement cell approval.</p>
                )}
                {["Interview Completed", "Completed"].includes(applicant.status) && (
                    <div className="rh-result-editor">
                        <strong>Interview completed</strong>
                        {resultEditing?.id === applicant.id ? (
                            <div className="rh-result-fields">
                                <select value={resultEditing.status} onChange={event => setResultEditing(current => ({ ...current, status: event.target.value }))}>
                                    <option value="Selected">Selected</option>
                                    <option value="Rejected">Rejected</option>
                                    <option value="Waitlisted">Waitlisted</option>
                                </select>
                                <input aria-label="Package or CTC" placeholder="Package / CTC" value={resultEditing.package} onChange={event => setResultEditing(current => ({ ...current, package: event.target.value }))} />
                                <input aria-label="Joining date" type="date" value={resultEditing.joiningDate} onChange={event => setResultEditing(current => ({ ...current, joiningDate: event.target.value }))} />
                                <input aria-label="Remarks" placeholder="Remarks" value={resultEditing.remarks} onChange={event => setResultEditing(current => ({ ...current, remarks: event.target.value }))} />
                                <button type="button" className="rh-btn rh-btn-primary" disabled={savingApplicationId === applicant.id} onClick={() => updateApplicationStatus(applicant, resultEditing.status, resultEditing)}>Save Final Result</button>
                            </div>
                        ) : (
                            <button type="button" className="rh-btn rh-btn-primary" onClick={() => setResultEditing({
                                id: applicant.id,
                                status: applicant.finalStatus || "Selected",
                                package: applicant.package || "",
                                joiningDate: applicant.joiningDate || "",
                                remarks: applicant.remarks || ""
                            })}>Record Final Result</button>
                        )}
                        {applicant.finalStatus && <span>{applicant.finalStatus} · {applicant.package || "Package not set"} · Joining {formatDate(applicant.joiningDate)}</span>}
                    </div>
                )}
                {(applicant.finalStatus === "Selected" || applicant.status === "Selected") && (
                    <div className="rh-offer-actions">
                        {applicant.offerLetterUrl && <a className="rh-btn" href={applicant.offerLetterUrl} target="_blank" rel="noreferrer">View Offer Letter</a>}
                        {applicant.offerLetterUrl && <a className="rh-btn" href={applicant.offerLetterUrl} download>Download Offer Letter</a>}
                        <label className="rh-btn rh-file-button">
                            {offerUploadingId === applicant.id ? "Uploading..." : applicant.offerLetterUrl ? "Replace Offer Letter" : "Upload Offer Letter"}
                            <input type="file" accept="application/pdf,.pdf" disabled={offerUploadingId === applicant.id} onChange={event => {
                                uploadOfferLetter(applicant, event.target.files?.[0]);
                                event.target.value = "";
                            }} />
                        </label>
                    </div>
                )}
            </li>
        );
    }

    async function loadDriveDetail(posting) {
            setSelectedDriveDetail(posting);
            setDriveDetailTab("Overview");
            setApplicantsLoading(true);
            setApplicantsError("");
            try {
                const response = await fetch(apiUrl(`recruiters/me/placements/${posting.id}/applicants`), {
                    headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` }
                });
                const data = await readApiResponse(response);
                const driveApplicants = (Array.isArray(data.applicants) ? data.applicants : [])
                    .map(applicant => ({ ...applicant, jobTitle: posting.title, jobId: posting.id, company: posting.company }));
                setApplicants(driveApplicants);
                setAllApplicants(current => [
                    ...current.filter(item => String(item.jobId) !== String(posting.id)),
                    ...driveApplicants
                ]);
            } catch (error) {
                console.error("Failed to load campus drive details:", error);
                setApplicantsError(error.message || "Unable to load campus drive applications.");
            } finally {
                setApplicantsLoading(false);
            }
    }

    async function updateApplicationStatus(application, status, extra = {}) {
            setSavingApplicationId(application.id);
            setWorkflowError("");
            try {
                const response = await fetch(apiUrl(`recruiters/me/applications/${application.id}/status`), {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${loggedInUser.sessionToken}`
                    },
                    body: JSON.stringify({ status, ...extra })
                });
                const data = await readApiResponse(response);
                const updated = { ...application, ...data.application, status: data.application?.status || status };
                setApplicants(current => current.map(item => item.id === application.id ? updated : item));
                setAllApplicants(current => current.map(item => item.id === application.id ? updated : item));
                setResultEditing(null);
            } catch (error) {
                console.error("Failed to update student application:", error);
                setWorkflowError(error.message || "Unable to update student application.");
            } finally {
                setSavingApplicationId(null);
            }
    }

    async function uploadOfferLetter(application, file) {
            if (!file) return;
            setOfferUploadingId(application.id);
            setWorkflowError("");
            try {
                const payload = new FormData();
                payload.append("offerLetter", file);
                const response = await fetch(
                    apiUrl(`recruiters/me/applications/${application.id}/offer-letter`),
                    {
                        method: "POST",
                        headers: { Authorization: `Bearer ${loggedInUser.sessionToken}` },
                        body: payload
                    }
                );
                const data = await readApiResponse(response);
                const updated = { ...application, offerLetterUrl: data.offerLetter?.url };
                setAllApplicants(current => current.map(item => item.id === application.id ? updated : item));
                setApplicants(current => current.map(item => item.id === application.id ? updated : item));
            } catch (error) {
                console.error("Failed to upload offer letter:", error);
                setWorkflowError(error.message || "Unable to upload the offer letter.");
            } finally {
                setOfferUploadingId(null);
        }
    }

    return (
        <div className="rh-page">
            <header className="rh-header">
                <div className="rh-header-copy">
                    <span className="rh-eyebrow">In-campus hiring workspace</span>
                    <h1>Recruiter Panel</h1>
                    <p>{loggedInUser.companyName} <span aria-hidden="true">&middot;</span> {loggedInUser.fullName}</p>
                </div>
                <div className="rh-header-actions">
                    {activeSection === "Campus Drives" && (
                        <button type="button" className="rh-btn rh-btn-primary" disabled={!recruiterVerified} onClick={openForm}>
                            {recruiterVerified ? "Create campus drive" : "Company verification required"}
                        </button>
                    )}
                    <button type="button" className="rh-btn" onClick={handleLogout}>Log out</button>
                </div>
            </header>

            <div className="rh-workspace">
                <nav className="rh-navigation" aria-label="Recruiter Panel">
                    <p className="rh-nav-heading">WORKSPACE</p>
                    {sections.map(section => (
                        <button
                            type="button"
                            key={section}
                            className={`rh-nav-item${activeSection === section ? " rh-nav-item-active" : ""}`}
                            aria-current={activeSection === section ? "page" : undefined}
                            onClick={() => setActiveSection(section)}
                        >
                            {section}
                            {section === "Notifications" && <span className="rh-nav-dot" aria-label="No new notifications" />}
                        </button>
                    ))}
                </nav>

                <section className="rh-content" aria-labelledby="rh-active-section">
                    <div className="rh-content-heading">
                        <div>
                            <span className="rh-eyebrow">Recruiter workspace</span>
                            <h2 id="rh-active-section">{activeSection}</h2>
                        </div>
                    </div>

                    {activeSection === "Dashboard" && (
                        <>
                            <RecruiterVerificationNotice
                                status={verificationStatus}
                                reason={recruiterProfile.verificationRejectionReason}
                                onEdit={() => {
                                    setActiveSection("Company Profile");
                                    startProfileEdit();
                                }}
                            />
                            <h3 className="rh-dashboard-statistics-title">Dashboard Statistics</h3>
                            <section className="rh-stats" aria-label="Campus placement summary">
                                <article className="rh-stat">
                                    <span className="rh-stat-value">{postings.length}</span>
                                    <span className="rh-stat-label">Campus drives</span>
                                </article>
                                <article className="rh-stat">
                                    <span className="rh-stat-value">{openCount}</span>
                                    <span className="rh-stat-label">Accepting applications</span>
                                </article>
                                <article className="rh-stat">
                                    <span className="rh-stat-value">{applicantTotal}</span>
                                    <span className="rh-stat-label">Student applications</span>
                                </article>
                                <article className="rh-stat">
                                    <span className="rh-stat-value">{pendingApprovalCount}</span>
                                    <span className="rh-stat-label">Pending drive approvals</span>
                                </article>
                            </section>
                            <section className="rh-panel rh-overview">
                                <h3>In-campus recruitment</h3>
                                <p>Manage campus drives and coordinate your student hiring workflow from one place.</p>
                                <button type="button" className="rh-btn rh-btn-primary" onClick={() => setActiveSection("Campus Drives")}>
                                    View campus drives
                                </button>
                            </section>
                            <section className="rh-panel rh-glance">
                                <div className="rh-glance-heading">
                                    <div>
                                        <span className="rh-eyebrow">Company at a Glance</span>
                                        <h3>{recruiterProfile.companyName || "Complete your company profile"}</h3>
                                    </div>
                                    <span className={`rh-tag rh-tag-${verificationStatus.toLowerCase()}`}>
                                        {verificationBadgeLabel(verificationStatus, "company")}
                                    </span>
                                </div>
                                <div className="rh-glance-content">
                                    <div className="rh-company-logo-preview">
                                        {recruiterProfile.companyLogoUrl
                                            ? <img src={recruiterProfile.companyLogoUrl} alt={`${recruiterProfile.companyName} logo`} />
                                            : <span aria-label="Company logo placeholder">{companyInitials}</span>}
                                    </div>
                                    <dl className="rh-details">
                                        <div><dt>Industry</dt><dd>{recruiterProfile.industry || "Not provided"}</dd></div>
                                        <div><dt>Location</dt><dd>{recruiterProfile.location || "Not provided"}</dd></div>
                                        <div><dt>Recruiter</dt><dd>{recruiterProfile.fullName || loggedInUser.fullName}</dd></div>
                                        <div><dt>Designation</dt><dd>{recruiterProfile.designation || "Not provided"}</dd></div>
                                        <div><dt>Recruiter verification</dt><dd>{verificationStatus === "Approved" ? "Verified Recruiter" : verificationStatus}</dd></div>
                                    </dl>
                                </div>
                                <div className="rh-glance-actions">
                                    <button type="button" className="rh-btn" onClick={() => setActiveSection("Company Profile")}>View Company Profile</button>
                                    <button type="button" className="rh-btn rh-btn-primary" onClick={() => {
                                        setActiveSection("Recruiter Profile");
                                        startProfileEdit();
                                    }}>Edit Profile</button>
                                </div>
                                <div className="rh-profile-completion">
                                    <div><span>Profile completion</span><strong>{profileCompletion}%</strong></div>
                                    <progress value={profileCompletion} max="100">{profileCompletion}%</progress>
                                </div>
                            </section>
                        </>
                    )}

                    {activeSection === "Company Profile" && (
                        <section className="rh-panel rh-profile-panel">
                            <div className="rh-section-heading">
                                <div>
                                    <h3>Company Profile</h3>
                                    <p className="rh-section-description">Company details and Placement Cell verification.</p>
                                </div>
                                <span className={`rh-tag rh-tag-${verificationStatus.toLowerCase()}`}>
                                    {verificationBadgeLabel(verificationStatus, "company")}
                                </span>
                            </div>
                            <RecruiterVerificationNotice
                                status={verificationStatus}
                                reason={recruiterProfile.verificationRejectionReason}
                                onEdit={() => {
                                    setActiveSection("Company Profile");
                                    startProfileEdit();
                                }}
                            />
                            {profileLoading && <p role="status">Loading company profile...</p>}
                            {verificationStatus === "Rejected" && recruiterProfile.verificationRejectionReason && (
                                <p className="rh-admin-feedback">Placement Cell feedback: {recruiterProfile.verificationRejectionReason}</p>
                            )}
                            {profileError && <div className="api-error" role="alert">{profileError}</div>}
                            {profileNotice && <p className="rh-success-message" role="status">{profileNotice}</p>}
                            <div className="rh-profile-subsection">
                                <h4>Company Logo</h4>
                                <CompanyLogoBlock
                                    profile={profileEditing ? profileForm : recruiterProfile}
                                    preview={companyLogoPreview}
                                    onFile={file => {
                                        setLogoError("");
                                        setCompanyLogoPreview(file ? URL.createObjectURL(file) : "");
                                    }}
                                    onUpload={uploadCompanyLogo}
                                    uploading={logoUploading}
                                    error={logoError}
                                />
                            </div>
                            {profileEditing ? (
                                <form className="dashboard-form rh-form rh-profile-form" onSubmit={saveRecruiterProfile}>
                                    <div className="rh-form-row">
                                        <div className="form-group"><label htmlFor="profile-company-name">Company Name</label><input id="profile-company-name" required value={profileForm.companyName} onChange={event => setProfileForm(current => ({ ...current, companyName: event.target.value }))} /></div>
                                        <div className="form-group"><label htmlFor="profile-industry">Industry</label><input id="profile-industry" value={profileForm.industry} onChange={event => setProfileForm(current => ({ ...current, industry: event.target.value }))} /></div>
                                    </div>
                                    <div className="rh-form-row">
                                        <div className="form-group"><label htmlFor="profile-company-type">Company Type</label><input id="profile-company-type" value={profileForm.companyType} onChange={event => setProfileForm(current => ({ ...current, companyType: event.target.value }))} placeholder="e.g. Private / Public / Startup" /></div>
                                        <div className="form-group"><label htmlFor="profile-company-size">Company Size</label><input id="profile-company-size" value={profileForm.companySize} onChange={event => setProfileForm(current => ({ ...current, companySize: event.target.value }))} placeholder="e.g. 500-1000 employees" /></div>
                                    </div>
                                    <div className="rh-form-row">
                                        <div className="form-group"><label htmlFor="profile-founded-year">Founded Year</label><input id="profile-founded-year" type="number" min="1800" max={new Date().getFullYear()} value={profileForm.foundedYear} onChange={event => setProfileForm(current => ({ ...current, foundedYear: event.target.value }))} /></div>
                                        <div className="form-group"><label htmlFor="profile-website">Official Website</label><input id="profile-website" type="url" placeholder="https://" value={profileForm.website} onChange={event => setProfileForm(current => ({ ...current, website: event.target.value }))} /></div>
                                    </div>
                                    <div className="rh-form-row">
                                        <div className="form-group"><label htmlFor="profile-official-email">Official Company Email</label><input id="profile-official-email" type="email" required value={profileForm.officialEmail} onChange={event => setProfileForm(current => ({ ...current, officialEmail: event.target.value }))} /></div>
                                        <div className="form-group"><label htmlFor="profile-phone">Company Phone Number</label><input id="profile-phone" type="tel" required value={profileForm.phone} onChange={event => setProfileForm(current => ({ ...current, phone: event.target.value }))} /></div>
                                    </div>
                                    <div className="rh-form-row">
                                        <div className="form-group"><label htmlFor="profile-location">Company Location</label><input id="profile-location" value={profileForm.location} onChange={event => setProfileForm(current => ({ ...current, location: event.target.value }))} /></div>
                                        <div className="form-group"><label htmlFor="profile-linkedin-url">LinkedIn URL</label><input id="profile-linkedin-url" type="url" placeholder="https://" value={profileForm.linkedInUrl} onChange={event => setProfileForm(current => ({ ...current, linkedInUrl: event.target.value }))} /></div>
                                    </div>
                                    <div className="form-group"><label htmlFor="profile-full-address">Full Address</label><textarea id="profile-full-address" value={profileForm.fullAddress} onChange={event => setProfileForm(current => ({ ...current, fullAddress: event.target.value }))} /></div>
                                    <div className="form-group"><label htmlFor="profile-company-description">Company Description</label><textarea id="profile-company-description" value={profileForm.companyDescription} onChange={event => setProfileForm(current => ({ ...current, companyDescription: event.target.value }))} /></div>
                                    <div className="form-buttons">
                                        <button type="submit" className="submit-job-btn" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save Changes"}</button>
                                        <button type="button" className="cancel-edit-btn" onClick={cancelProfileEdit}>Cancel</button>
                                    </div>
                                </form>
                            ) : (
                                <>
                                    <dl className="rh-details">
                                        <div><dt>Company Name</dt><dd>{recruiterProfile.companyName || "Not provided"}</dd></div>
                                        <div><dt>Industry</dt><dd>{recruiterProfile.industry || "Not provided"}</dd></div>
                                        <div><dt>Company Size</dt><dd>{recruiterProfile.companySize || "Not provided"}</dd></div>
                                        <div><dt>Founded Year</dt><dd>{recruiterProfile.foundedYear || "Not provided"}</dd></div>
                                        <div><dt>Official Website</dt><dd>{recruiterProfile.website || "Not provided"}</dd></div>
                                        <div><dt>Official Email</dt><dd>{recruiterProfile.officialEmail || "Not provided"}</dd></div>
                                        <div><dt>Phone</dt><dd>{recruiterProfile.phone || "Not provided"}</dd></div>
                                        <div><dt>Location</dt><dd>{recruiterProfile.location || "Not provided"}</dd></div>
                                        <div><dt>Full Address</dt><dd>{recruiterProfile.fullAddress || "Not provided"}</dd></div>
                                        <div><dt>LinkedIn</dt><dd>{recruiterProfile.linkedInUrl || "Not provided"}</dd></div>
                                        <div><dt>About Company</dt><dd>{recruiterProfile.companyDescription || "Not provided"}</dd></div>
                                        <div><dt>Verification Status</dt><dd>{verificationBadgeLabel(verificationStatus, "company")}</dd></div>
                                    </dl>
                                    <button type="button" className="rh-btn rh-btn-primary" onClick={startProfileEdit}>Edit Profile</button>
                                </>
                            )}
                        </section>
                    )}

                    {activeSection === "Recruiter Profile" && (
                        <section className="rh-panel">
                            <div className="rh-section-heading">
                                <div><h3>Recruiter Profile</h3><p className="rh-section-description">Your professional contact details and verification.</p></div>
                                <span className={`rh-tag rh-tag-${verificationStatus.toLowerCase()}`}>
                                    {verificationBadgeLabel(verificationStatus, "recruiter")}
                                </span>
                            </div>
                            {profileLoading && <p role="status">Loading recruiter profile...</p>}
                            {profileError && <div className="api-error" role="alert">{profileError}</div>}
                            {profileNotice && <p className="rh-success-message" role="status">{profileNotice}</p>}
                            {verificationStatus === "Rejected" && recruiterProfile.verificationRejectionReason && <p className="rh-admin-feedback">Placement Cell feedback: {recruiterProfile.verificationRejectionReason}</p>}
                            {profileEditing ? (
                                <form className="dashboard-form rh-form rh-profile-form" onSubmit={saveRecruiterProfile}>
                                    <div className="form-group">
                                        <label htmlFor="profile-photo">Recruiter Profile Photo</label>
                                        <div className="rh-profile-photo-row">
                                            <div className="rh-profile-avatar">
                                                {profilePhotoPreview || recruiterProfile.profilePhotoUrl
                                                    ? <img src={profilePhotoPreview || recruiterProfile.profilePhotoUrl} alt="Recruiter profile preview" />
                                                    : <span>{(recruiterProfile.fullName || "R").split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase()}</span>}
                                            </div>
                                            <label className="rh-btn">
                                                {photoUploading ? "Uploading..." : "Choose Profile Photo"}
                                                <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={photoUploading} onChange={event => {
                                                    const file = event.target.files?.[0];
                                                    if (file) {
                                                        setProfilePhotoPreview(URL.createObjectURL(file));
                                                        uploadRecruiterPhoto(file);
                                                    }
                                                    event.target.value = "";
                                                }} />
                                            </label>
                                        </div>
                                        {photoError && <div className="api-error" role="alert">{photoError}</div>}
                                    </div>
                                    <div className="rh-form-row">
                                        <div className="form-group"><label htmlFor="recruiter-full-name">Recruiter Full Name</label><input id="recruiter-full-name" required value={profileForm.fullName} onChange={event => setProfileForm(current => ({ ...current, fullName: event.target.value }))} /></div>
                                        <div className="form-group"><label htmlFor="recruiter-designation">Designation</label><input id="recruiter-designation" required value={profileForm.designation} onChange={event => setProfileForm(current => ({ ...current, designation: event.target.value }))} /></div>
                                    </div>
                                    <div className="rh-form-row">
                                        <div className="form-group"><label htmlFor="recruiter-hr-function">HR / Talent Acquisition</label><input id="recruiter-hr-function" value={profileForm.hrTalentAcquisition} onChange={event => setProfileForm(current => ({ ...current, hrTalentAcquisition: event.target.value }))} /></div>
                                        <div className="form-group"><label htmlFor="recruiter-official-email">Official Company Email</label><input id="recruiter-official-email" type="email" required value={profileForm.officialEmail} onChange={event => setProfileForm(current => ({ ...current, officialEmail: event.target.value }))} /></div>
                                    </div>
                                    <div className="rh-form-row">
                                        <div className="form-group"><label htmlFor="recruiter-phone">Phone Number</label><input id="recruiter-phone" type="tel" required value={profileForm.phone} onChange={event => setProfileForm(current => ({ ...current, phone: event.target.value }))} /></div>
                                        <div className="form-group"><label htmlFor="recruiter-linkedin">LinkedIn Profile</label><input id="recruiter-linkedin" type="url" value={profileForm.linkedInProfile} onChange={event => setProfileForm(current => ({ ...current, linkedInProfile: event.target.value }))} /></div>
                                    </div>
                                    <div className="form-group"><label htmlFor="recruiter-location">Location</label><input id="recruiter-location" value={profileForm.location} onChange={event => setProfileForm(current => ({ ...current, location: event.target.value }))} /></div>
                                    <div className="form-group"><label htmlFor="recruiter-short-bio">Short Bio</label><textarea id="recruiter-short-bio" maxLength="500" value={profileForm.shortBio} onChange={event => setProfileForm(current => ({ ...current, shortBio: event.target.value }))} placeholder="Briefly describe your recruiting role and focus." /></div>
                                    <div className="form-buttons">
                                        <button type="submit" className="submit-job-btn" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save Changes"}</button>
                                        <button type="button" className="cancel-edit-btn" onClick={cancelProfileEdit}>Cancel</button>
                                    </div>
                                </form>
                            ) : (
                                <>
                                    <div className="rh-profile-avatar">
                                        {recruiterProfile.profilePhotoUrl
                                            ? <img src={recruiterProfile.profilePhotoUrl} alt={`${recruiterProfile.fullName} profile`} />
                                            : <span>{(recruiterProfile.fullName || "R").split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase()}</span>}
                                    </div>
                                    <dl className="rh-details">
                                        <div><dt>Recruiter Full Name</dt><dd>{recruiterProfile.fullName || "Not provided"}</dd></div>
                                        <div><dt>Designation</dt><dd>{recruiterProfile.designation || "Not provided"}</dd></div>
                                        <div><dt>HR / Talent Acquisition</dt><dd>{recruiterProfile.hrTalentAcquisition || "Not provided"}</dd></div>
                                        <div><dt>Official Company Email</dt><dd>{recruiterProfile.officialEmail || "Not provided"}</dd></div>
                                        <div><dt>Login Email</dt><dd>{loggedInUser.email || "Not provided"}</dd></div>
                                        <div><dt>Phone Number</dt><dd>{recruiterProfile.phone || "Not provided"}</dd></div>
                                        <div><dt>LinkedIn Profile</dt><dd>{recruiterProfile.linkedInProfile || "Not provided"}</dd></div>
                                        <div><dt>Location</dt><dd>{recruiterProfile.location || "Not provided"}</dd></div>
                                        <div><dt>Short Bio</dt><dd>{recruiterProfile.shortBio || "Not provided"}</dd></div>
                                        <div><dt>Company Name</dt><dd>{recruiterProfile.companyName || "Not provided"}</dd></div>
                                    </dl>
                                    <button type="button" className="rh-btn rh-btn-primary" onClick={startProfileEdit}>Edit Profile</button>
                                </>
                            )}
                        </section>
                    )}

                    {activeSection === "Company Logo" && (
                        <section className="rh-panel">
                            <h3>Company Logo</h3>
                            {profileNotice && <p className="rh-success-message" role="status">{profileNotice}</p>}
                            <CompanyLogoBlock
                                profile={recruiterProfile}
                                preview={companyLogoPreview}
                                onFile={file => {
                                    setLogoError("");
                                    setCompanyLogoPreview(file ? URL.createObjectURL(file) : "");
                                }}
                                onUpload={uploadCompanyLogo}
                                uploading={logoUploading}
                                error={logoError}
                            />
                            <p className="rh-section-description">Changing the company logo submits your profile for Placement Cell verification.</p>
                        </section>
                    )}

                    {activeSection === "Company Information" && (
                        <section className="rh-panel">
                            <h3>Company Information</h3>
                            <div className="rh-company-information">
                                <div className="rh-company-logo-small">
                                    {recruiterProfile.companyLogoUrl
                                        ? <img src={recruiterProfile.companyLogoUrl} alt="" />
                                        : <span aria-hidden="true">{companyInitials}</span>}
                                </div>
                                <strong>{recruiterProfile.companyName || "Company not provided"}</strong>
                            </div>
                            <dl className="rh-details">
                                <div><dt>Company</dt><dd>{recruiterProfile.companyName || "Not provided"}</dd></div>
                                <div><dt>Industry</dt><dd>{recruiterProfile.industry || "Not provided"}</dd></div>
                                <div><dt>Company type</dt><dd>{recruiterProfile.companyType || "Not provided"}</dd></div>
                                <div><dt>Company size</dt><dd>{recruiterProfile.companySize || "Not provided"}</dd></div>
                                <div><dt>Founded</dt><dd>{recruiterProfile.foundedYear || "Not provided"}</dd></div>
                                <div><dt>Website</dt><dd>{recruiterProfile.website || "Not provided"}</dd></div>
                                <div><dt>Official email</dt><dd>{recruiterProfile.officialEmail || "Not provided"}</dd></div>
                                <div><dt>Phone</dt><dd>{recruiterProfile.phone || "Not provided"}</dd></div>
                                <div><dt>Location</dt><dd>{recruiterProfile.location || "Not provided"}</dd></div>
                                <div><dt>LinkedIn</dt><dd>{recruiterProfile.linkedInUrl || "Not provided"}</dd></div>
                                <div><dt>Recruiter contact</dt><dd>{recruiterProfile.fullName || loggedInUser.fullName}</dd></div>
                                <div><dt>Login email</dt><dd>{loggedInUser.email || "Not provided"}</dd></div>
                            </dl>
                            <button type="button" className="rh-btn rh-btn-primary" onClick={() => {
                                setActiveSection("Company Profile");
                                startProfileEdit();
                            }}>Edit Company Profile</button>
                        </section>
                    )}

                    {activeSection === "Campus Drives" && (
                        <section className="rh-section" id="placements">
                            <div className="rh-section-heading">
                                <h3>Campus Drives</h3>
                                {postings.length > 0 && (
                                    <span className="rh-posting-total" aria-label={`${postings.length} campus drives`}>
                                        {postings.length}
                                    </span>
                                )}
                            </div>
                            <RecruiterVerificationNotice
                                status={verificationStatus}
                                reason={recruiterProfile.verificationRejectionReason}
                                onEdit={() => {
                                    setActiveSection("Company Profile");
                                    startProfileEdit();
                                }}
                            />
                            {loading && <p className="rh-note" role="status">Loading your campus drives...</p>}
                            {listError && <div className="api-error" role="alert">{listError}</div>}
                            {!loading && !listError && orderedPostings.length === 0 && (
                                <div className="rh-empty">
                                    <p>You haven't created any campus drives yet.</p>
                                    <button type="button" className="rh-btn rh-btn-primary" disabled={!recruiterVerified} onClick={openForm}>
                                        Create your first campus drive
                                    </button>
                                </div>
                            )}
                            {!loading && orderedPostings.length > 0 && (
                                <ul className="rh-list">
                                    {orderedPostings.map(posting => {
                                        const open = isPostingOpen(posting);
                                        return (
                                            <li className="rh-item" key={posting.id}>
                                                <div className="rh-item-main">
                                                    <button type="button" className="rh-text-action" onClick={() => loadDriveDetail(posting)}>
                                                        {posting.title || "Untitled campus drive"}
                                                    </button>
                                                    <p>{posting.driveId || `CD-${posting.id}`} · {posting.company}</p>
                                                    <p>
                                                        {posting.location || "Location not set"}
                                                        <span aria-hidden="true"> &middot; </span>
                                                        Apply by {formatDate(posting.deadline)}
                                                    </p>
                                                    {(posting.rejectionReason || posting.adminNotes) && (
                                                        <p className="rh-admin-feedback">
                                                            {posting.rejectionReason && <>Admin rejection reason: {posting.rejectionReason} </>}
                                                            {posting.adminNotes && <>Admin notes: {posting.adminNotes}</>}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="rh-item-meta">
                                                    <span className={`rh-tag rh-approval-${(posting.approvalStatus === "Approved"
                                                        ? posting.driveStatus || (open ? "Open" : "Closed")
                                                        : posting.approvalStatus || posting.driveStatus || "Open").toLowerCase().replaceAll(" ", "-")}`}>
                                                        {posting.approvalStatus === "Approved"
                                                            ? posting.driveStatus || (open ? "Open" : "Closed")
                                                            : posting.approvalStatus || posting.driveStatus || "Open"}
                                                    </span>
                                                    <span className="rh-count">
                                                        {Number(posting.applicantsCount) || 0} applicants
                                                    </span>
                                                    <button type="button" className="rh-btn" onClick={() => loadDriveDetail(posting)}>
                                                        Drive details
                                                    </button>
                                                    <button type="button" className="rh-btn" onClick={() => handleViewApplicants(posting)}>
                                                        View applications
                                                    </button>
                                                    {posting.approvalStatus === "Changes Requested" && (
                                                        <button type="button" className="rh-btn rh-btn-primary" onClick={() => handleEditClick(posting)}>
                                                            Edit and resubmit
                                                        </button>
                                                    )}
                                                    {posting.approvalStatus === "Approved" && posting.driveStatus !== "Completed" && (
                                                        <button type="button" className="rh-btn" onClick={() => handleDriveStatus(posting, open ? "Closed" : "Open")}>
                                                            {open ? "Close applications" : "Open applications"}
                                                        </button>
                                                    )}
                                                    <button type="button" className="rh-btn" onClick={() => handleEditClick(posting)}>
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rh-btn rh-btn-danger"
                                                        disabled={deletingJobId === posting.id}
                                                        onClick={() => handleDeleteClick(posting)}
                                                    >
                                                        {deletingJobId === posting.id ? "Deleting..." : "Delete"}
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    )}

                    {activeSection === "Student Applications" && (
                        <section className="rh-section">
                            <p className="rh-section-description">Review applications across your approved campus drives.</p>
                            {workflowError && <div className="api-error" role="alert">{workflowError}</div>}
                            {loading && <p className="rh-note" role="status">Loading campus drives...</p>}
                            {!loading && postings.length > 0 && allApplicants.length === 0 && (
                                <div className="rh-empty"><p>No student applications yet.</p></div>
                            )}
                            {!loading && postings.length === 0 && <div className="rh-empty"><p>Create a campus drive to start receiving applications.</p></div>}
                            {allApplicants.length > 0 && (
                                <ul className="rh-applicant-list">{allApplicants.map(applicant => renderApplicantCard(applicant))}</ul>
                            )}
                        </section>
                    )}

                    {activeSection === "Shortlisted Students" && (
                        <section className="rh-section">
                            {shortlistedApplicants.length === 0 ? (
                                <div className="rh-empty"><p>No students have been shortlisted yet.</p></div>
                            ) : (
                                <ul className="rh-applicant-list">{shortlistedApplicants.map(applicant => renderApplicantCard(applicant, true))}</ul>
                            )}
                        </section>
                    )}

                    {activeSection === "Interview Schedule" && (
                        <section className="rh-section">
                            {workflowError && <div className="api-error" role="alert">{workflowError}</div>}
                            {interviewApplicants.length === 0 ? (
                                <div className="rh-empty"><p>No interviews scheduled.</p></div>
                            ) : (
                                <ul className="rh-applicant-list">{interviewApplicants.map(applicant => renderApplicantCard(applicant))}</ul>
                            )}
                        </section>
                    )}

                    {activeSection === "Final Results" && (
                        <section className="rh-section">
                            <div className="rh-result-counts">
                                <article><strong>{selectedApplicants.length}</strong><span>Selected</span></article>
                                <article><strong>{rejectedApplicants.length}</strong><span>Rejected</span></article>
                                <article><strong>{waitlistedApplicants.length}</strong><span>Waitlisted</span></article>
                            </div>
                            {selectedApplicants.length + rejectedApplicants.length + waitlistedApplicants.length === 0 ? (
                                <div className="rh-empty"><p>No final results recorded yet.</p></div>
                            ) : (
                                <ul className="rh-applicant-list">
                                    {[...selectedApplicants, ...rejectedApplicants, ...waitlistedApplicants].map(applicant => renderApplicantCard(applicant))}
                                </ul>
                            )}
                        </section>
                    )}

                    {activeSection === "Offer Letters" && (
                        <section className="rh-section">
                            {selectedApplicants.length === 0 ? (
                                <div className="rh-empty"><p>No selected students yet.</p></div>
                            ) : (
                                <ul className="rh-applicant-list">{selectedApplicants.map(applicant => renderApplicantCard(applicant))}</ul>
                            )}
                        </section>
                    )}

                    {activeSection === "Notifications" && (
                        <section className="rh-panel">
                            <h3>Notifications</h3>
                            {pendingApprovalCount + changesRequestedCount + rejectedDriveCount + approvedDriveCount === 0 ? (
                                <div className="rh-empty"><p>No new campus drive approval notifications.</p></div>
                            ) : (
                                <ul className="rh-notification-list">
                                    {postings.filter(posting => [
                                        "Pending Admin Approval", "Approved", "Changes Requested", "Rejected"
                                    ].includes(posting.approvalStatus)).map(posting => (
                                        <li key={posting.id}>
                                            <strong>{posting.company}: {posting.title}</strong>
                                            <span>{posting.approvalStatus}</span>
                                            {posting.rejectionReason && <p>Reason: {posting.rejectionReason}</p>}
                                            {posting.adminNotes && <p>Admin notes: {posting.adminNotes}</p>}
                                            {posting.approvalStatus === "Approved" && <p>Your campus drive has been approved by the placement cell.</p>}
                                            {posting.approvalStatus === "Changes Requested" && (
                                                <button type="button" className="rh-btn rh-btn-primary" onClick={() => {
                                                    setActiveSection("Campus Drives");
                                                    handleEditClick(posting);
                                                }}>Edit and resubmit</button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    )}

                    {activeSection === "Placement Cell Messages" && (
                        <section className="rh-panel rh-module-empty">
                            <h3>{activeSection}</h3>
                            <p>There are no placement cell messages to display.</p>
                        </section>
                    )}

                    {activeSection === "Settings" && (
                        <section className="rh-panel">
                            <h3>Settings</h3>
                            <p className="rh-section-description">Manage your recruiter session.</p>
                            <button type="button" className="rh-btn" onClick={handleLogout}>Log out</button>
                        </section>
                    )}
                </section>
            </div>

            {showForm && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget) resetForm();
                }}>
                    <section
                        className="rh-dialog rh-panel"
                        id="placement-form"
                        ref={formCardRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="placement-form-title"
                    >
                        <div className="rh-panel-heading">
                            <div>
                                <span className="rh-eyebrow">In-campus placement management</span>
                                <h2 id="placement-form-title">{editingJobId === null ? "Create Campus Drive" : "Edit Campus Drive"}</h2>
                            </div>
                            <button type="button" className="rh-dialog-close" onClick={resetForm} aria-label="Close form">
                                &times;
                            </button>
                        </div>
                        {errors.apiError && <div className="api-error" role="alert">{errors.apiError}</div>}

                        <form onSubmit={handleSubmit} className="dashboard-form rh-form">
                            <div className="form-group">
                                <label htmlFor="drive-id">Drive ID</label>
                                <input
                                    id="drive-id"
                                    name="driveId"
                                    value={form.driveId}
                                    onChange={handleChange}
                                    placeholder="Auto-generated if left blank"
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="recruiter-company">Company Name</label>
                                <input id="recruiter-company" value={loggedInUser.companyName} disabled />
                            </div>
                            <div className="form-group">
                                <label htmlFor="recruiter-title">Job Position</label>
                                <input
                                    id="recruiter-title"
                                    name="title"
                                    value={form.title}
                                    onChange={handleChange}
                                    placeholder="e.g. Software Engineer"
                                    aria-invalid={Boolean(errors.title)}
                                />
                                {errors.title && <span className="field-error">{errors.title}</span>}
                            </div>
                            <div className="rh-form-row">
                                <div className="form-group">
                                    <label htmlFor="recruiter-location">Location</label>
                                    <input
                                        id="recruiter-location"
                                        name="location"
                                        value={form.location}
                                        onChange={handleChange}
                                        placeholder="e.g. Ahmedabad, Remote"
                                        aria-invalid={Boolean(errors.location)}
                                    />
                                    {errors.location && <span className="field-error">{errors.location}</span>}
                                </div>
                                <div className="rh-form-row">
                                    <div className="form-group">
                                        <label htmlFor="eligible-course">Eligible Course</label>
                                        <input id="eligible-course" name="eligibleCourse" value={form.eligibleCourse} onChange={handleChange} placeholder="e.g. BCA, BTech CS (blank means all)" />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="eligible-department">Eligible Department</label>
                                        <input id="eligible-department" name="eligibleDepartment" value={form.eligibleDepartment} onChange={handleChange} placeholder="e.g. Computer Science" />
                                    </div>
                                </div>
                                <div className="rh-form-row">
                                    <div className="form-group">
                                        <label htmlFor="eligible-semester">Eligible Semester/Batch</label>
                                        <input id="eligible-semester" name="eligibleSemester" value={form.eligibleSemester} onChange={handleChange} placeholder="e.g. 6, 8 (blank means all)" />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="minimum-spi">Minimum SPI/CGPA</label>
                                        <input id="minimum-spi" name="minimumSpiCgpa" type="number" min="0" max="100" step="0.01" value={form.minimumSpiCgpa} onChange={handleChange} />
                                    </div>
                                </div>
                                <div className="rh-form-row">
                                    <div className="form-group">
                                        <label htmlFor="minimum-tenth">Minimum 10th %</label>
                                        <input id="minimum-tenth" name="minimumTenthPercentage" type="number" min="0" max="100" step="0.01" value={form.minimumTenthPercentage} onChange={handleChange} />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="minimum-twelfth">Minimum 12th %</label>
                                        <input id="minimum-twelfth" name="minimumTwelfthPercentage" type="number" min="0" max="100" step="0.01" value={form.minimumTwelfthPercentage} onChange={handleChange} />
                                    </div>
                                </div>
                                <div className="rh-form-row">
                                    <div className="form-group">
                                        <label htmlFor="backlog-allowed">Backlog Allowed</label>
                                        <select id="backlog-allowed" name="backlogAllowed" value={form.backlogAllowed} onChange={handleChange}>
                                            <option value="No">No</option>
                                            <option value="Yes">Yes</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="required-skills">Required Skills</label>
                                        <input id="required-skills" name="requiredSkills" value={form.requiredSkills} onChange={handleChange} placeholder="Comma-separated, e.g. Java, SQL" />
                                    </div>
                                </div>
                                <div className="rh-form-row">
                                    <div className="form-group">
                                        <label htmlFor="application-start">Application Start Date</label>
                                        <input id="application-start" type="date" name="applicationStartDate" value={form.applicationStartDate} onChange={handleChange} />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="vacancies">Number of Vacancies</label>
                                        <input id="vacancies" type="number" name="vacancies" min="0" value={form.vacancies} onChange={handleChange} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="selection-process">Selection Process</label>
                                    <textarea id="selection-process" name="selectionProcess" value={form.selectionProcess} onChange={handleChange} placeholder="e.g. Aptitude test, technical interview, HR round" />
                                </div>
                                <div className="rh-form-row">
                                    <div className="form-group">
                                        <label htmlFor="drive-status">Drive Status</label>
                                        <select id="drive-status" name="driveStatus" value={form.driveStatus} onChange={handleChange}>
                                            <option value="Open">Open</option>
                                            <option value="Closed">Closed</option>
                                            <option value="Completed">Completed</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="recruiter-salary">Salary package</label>
                                    <input
                                        id="recruiter-salary"
                                        name="salary"
                                        value={form.salary}
                                        onChange={handleChange}
                                        placeholder="e.g. 8.5 LPA"
                                        aria-invalid={Boolean(errors.salary)}
                                    />
                                    {errors.salary && <span className="field-error">{errors.salary}</span>}
                                </div>
                            </div>
                            <div className="rh-form-row">
                                <div className="form-group">
                                    <label htmlFor="recruiter-job-type">Job type</label>
                                    <select
                                        id="recruiter-job-type"
                                        name="jobType"
                                        value={form.jobType}
                                        onChange={handleChange}
                                        aria-invalid={Boolean(errors.jobType)}
                                    >
                                        <option value="">Select job type</option>
                                        <option value="Full Time">Full Time</option>
                                        <option value="Part Time">Part Time</option>
                                        <option value="Internship">Internship</option>
                                    </select>
                                    {errors.jobType && <span className="field-error">{errors.jobType}</span>}
                                </div>
                                <div className="form-group">
                                    <label htmlFor="recruiter-deadline">Application deadline</label>
                                    <input
                                        id="recruiter-deadline"
                                        type="date"
                                        name="deadline"
                                        value={form.deadline}
                                        onChange={handleChange}
                                        min={!form.deadline || form.deadline >= new Date().toISOString().slice(0, 10)
                                            ? new Date().toISOString().slice(0, 10)
                                            : undefined}
                                        aria-invalid={Boolean(errors.deadline)}
                                    />
                                    {errors.deadline && <span className="field-error">{errors.deadline}</span>}
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="recruiter-description">Job description</label>
                                <textarea
                                    id="recruiter-description"
                                    name="description"
                                    value={form.description}
                                    onChange={handleChange}
                                    placeholder="Describe the role, requirements, and skills needed..."
                                    aria-invalid={Boolean(errors.description)}
                                />
                                {errors.description && <span className="field-error">{errors.description}</span>}
                            </div>
                            <div className="form-buttons">
                                <button type="submit" className="submit-job-btn" disabled={submitting}>
                                    {submitting ? "Saving..." : editingJobId === null ? "Create Campus Drive" : "Save Campus Drive"}
                                </button>
                                <button type="button" className="cancel-edit-btn" onClick={resetForm}>Cancel</button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {selectedDriveDetail && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget) setSelectedDriveDetail(null);
                }}>
                    <section className="rh-dialog rh-panel rh-drive-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="drive-detail-title">
                        <div className="rh-panel-heading">
                            <div>
                                <span className="rh-eyebrow">{selectedDriveDetail.driveId || `Drive #${selectedDriveDetail.id}`}</span>
                                <h2 id="drive-detail-title">{selectedDriveDetail.company} · {selectedDriveDetail.title}</h2>
                            </div>
                            <button type="button" className="rh-dialog-close" aria-label="Close campus drive details" onClick={() => setSelectedDriveDetail(null)}>&times;</button>
                        </div>
                        <div className="rh-drive-tabs" role="tablist" aria-label="Campus drive details">
                            {["Overview", "Applications", "Shortlisted", "Interviews", "Final Results", "Offer Letters"].map(tab => (
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={driveDetailTab === tab}
                                    className={driveDetailTab === tab ? "active" : ""}
                                    key={tab}
                                    onClick={() => setDriveDetailTab(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                        {applicantsError && <div className="api-error" role="alert">{applicantsError}</div>}
                        {applicantsLoading && <p className="rh-note" role="status">Loading campus drive details...</p>}
                        {!applicantsLoading && driveDetailTab === "Overview" && (
                            <div className="rh-drive-overview">
                                <div className="rh-company-logo-small">
                                    {selectedDriveDetail.companyLogoUrl
                                        ? <img src={selectedDriveDetail.companyLogoUrl} alt={`${selectedDriveDetail.company} logo`} />
                                        : <span aria-hidden="true">{companyInitials}</span>}
                                </div>
                                <dl className="rh-details">
                                    <div><dt>Company Name</dt><dd>{selectedDriveDetail.company}</dd></div>
                                    <div><dt>Job Position</dt><dd>{selectedDriveDetail.title}</dd></div>
                                    <div><dt>Package</dt><dd>{selectedDriveDetail.salary}</dd></div>
                                    <div><dt>Location</dt><dd>{selectedDriveDetail.location}</dd></div>
                                    <div><dt>Eligibility</dt><dd>{selectedDriveDetail.eligibleCourse || "All courses"} · {selectedDriveDetail.eligibleDepartment || "All departments"}</dd></div>
                                    <div><dt>Required Skills</dt><dd>{Array.isArray(selectedDriveDetail.requiredSkills) ? selectedDriveDetail.requiredSkills.join(", ") || "Not specified" : "Not specified"}</dd></div>
                                    <div><dt>Deadline</dt><dd>{formatDate(selectedDriveDetail.deadline)}</dd></div>
                                    <div><dt>Vacancies</dt><dd>{selectedDriveDetail.vacancies || "Not specified"}</dd></div>
                                    <div><dt>Selection Process</dt><dd>{selectedDriveDetail.selectionProcess || "Not specified"}</dd></div>
                                </dl>
                            </div>
                        )}
                        {!applicantsLoading && driveDetailTab !== "Overview" && (
                            <div className="rh-drive-tab-content">
                                {(() => {
                                    const driveApplicants = applicants.filter(item => String(item.jobId) === String(selectedDriveDetail.id));
                                    const tabApplicants = driveDetailTab === "Applications" ? driveApplicants
                                        : driveDetailTab === "Shortlisted" ? driveApplicants.filter(item => item.status === "Shortlisted")
                                            : driveDetailTab === "Interviews" ? driveApplicants.filter(item => interviewApplicants.some(interview => interview.id === item.id))
                                                : driveDetailTab === "Final Results" ? driveApplicants.filter(item => item.finalStatus || ["Selected", "Rejected", "Waitlisted"].includes(item.status))
                                                    : driveApplicants.filter(item => item.finalStatus === "Selected" || item.status === "Selected");
                                    return tabApplicants.length === 0
                                        ? <div className="rh-empty"><p>{driveDetailTab === "Applications" ? "No student applications yet." : `No ${driveDetailTab.toLowerCase()} for this campus drive yet.`}</p></div>
                                        : <ul className="rh-applicant-list">{tabApplicants.map(item => renderApplicantCard(item))}</ul>;
                                })()}
                            </div>
                        )}
                    </section>
                </div>
            )}

            {selectedCandidate && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget) setSelectedCandidate(null);
                }}>
                    <section className="rh-dialog rh-panel" role="dialog" aria-modal="true" aria-labelledby="student-profile-title">
                        <div className="rh-panel-heading">
                            <div><span className="rh-eyebrow">Student Profile</span><h2 id="student-profile-title">{selectedCandidate.fullName || "Student"}</h2></div>
                            <button type="button" className="rh-dialog-close" aria-label="Close student profile" onClick={() => setSelectedCandidate(null)}>&times;</button>
                        </div>
                        <dl className="rh-details">
                            <div><dt>Enrollment Number</dt><dd>{selectedCandidate.enrollment || "Not provided"}</dd></div>
                            <div><dt>Email</dt><dd>{selectedCandidate.email || "Not provided"}</dd></div>
                            <div><dt>Course</dt><dd>{selectedCandidate.course || selectedCandidate.department || "Not provided"}</dd></div>
                            <div><dt>Department</dt><dd>{selectedCandidate.department || "Not provided"}</dd></div>
                            <div><dt>Semester</dt><dd>{selectedCandidate.semester || "Not provided"}</dd></div>
                            <div><dt>SPI/CGPA</dt><dd>{selectedCandidate.spiCgpi ?? "Not provided"}</dd></div>
                            <div><dt>Skills</dt><dd>{Array.isArray(selectedCandidate.skills) ? selectedCandidate.skills.join(", ") || "Not provided" : selectedCandidate.skills || "Not provided"}</dd></div>
                        </dl>
                        {(selectedCandidate.resumeUrl || selectedCandidate.result) && (
                            <a className="rh-btn rh-btn-primary" href={selectedCandidate.resumeUrl || selectedCandidate.result} target="_blank" rel="noreferrer">View Resume</a>
                        )}
                    </section>
                </div>
            )}

            {selectedPosting && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget) setSelectedPosting(null);
                }}>
                    <section
                        className="rh-dialog rh-panel rh-applicants-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="applicants-title"
                    >
                        <div className="rh-panel-heading">
                            <div>
                                <span className="rh-eyebrow">Placement applicants</span>
                                <h2 id="applicants-title">{selectedPosting.title}</h2>
                            </div>
                            <button
                                type="button"
                                className="rh-dialog-close"
                                onClick={() => setSelectedPosting(null)}
                                aria-label="Close applicants"
                            >
                                &times;
                            </button>
                        </div>
                        {applicantsLoading && <p className="rh-note" role="status">Loading applicants...</p>}
                        {applicantsError && <div className="api-error" role="alert">{applicantsError}</div>}
                        {!applicantsLoading && !applicantsError && applicants.length === 0 && (
                            <div className="rh-empty"><p>No students have applied to this placement yet.</p></div>
                        )}
                        {!applicantsLoading && applicants.length > 0 && (
                            <ul className="rh-applicant-list">
                                {applicants.map(applicant => (
                                    <li className="rh-applicant" key={applicant.studentId}>
                                        <div>
                                            <h3>{applicant.fullName}</h3>
                                            <p>{applicant.email}</p>
                                        </div>
                                        <div className="rh-applicant-meta">
                                            <span>{applicant.enrollment}</span>
                                            <span>{applicant.department}</span>
                                            <time dateTime={applicant.appliedAt}>
                                                Applied {formatDate(applicant.appliedAt?.slice(0, 10))}
                                            </time>
                                        </div>
                                        <div className="rh-applicant-workflow">
                                            <span className={`rh-status rh-status-${(applicant.status || "Applied").toLowerCase().replaceAll(" ", "-")}`}>
                                                {applicant.status || "Applied"}
                                            </span>
                                            {applicant.status === "Pending Admin Approval" && (
                                                <p>
                                                    Proposed: {formatDate(applicant.proposedDate)} at {applicant.proposedTime}
                                                    {" · "}{applicant.interviewType}
                                                </p>
                                            )}
                                            {applicant.status === "Interview Scheduled" && (
                                                <div className="rh-confirmed-interview">
                                                    <strong>Admin approved interview</strong>
                                                    <span>{formatDate(applicant.proposedDate)} at {applicant.proposedTime}</span>
                                                    <span>{applicant.interviewType} · {applicant.locationOrMeetingLink}</span>
                                                    {applicant.notes && <span>Notes: {applicant.notes}</span>}
                                                    {applicant.canComplete && (
                                                        <button
                                                            type="button"
                                                            className="rh-btn"
                                                            disabled={completingApplicationId === applicant.id}
                                                            onClick={() => handleCompleteInterview(applicant)}
                                                        >
                                                            {completingApplicationId === applicant.id ? "Updating..." : "Mark completed"}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {applicant.status === "Rejected" && applicant.rejectionReason && (
                                                <p className="rh-rejection-reason">Change requested: {applicant.rejectionReason}</p>
                                            )}
                                            {["Applied", "Rejected"].includes(applicant.status || "Applied") && (
                                                <button
                                                    type="button"
                                                    className="rh-btn rh-btn-primary"
                                                    onClick={() => startScheduling(applicant)}
                                                >
                                                    Schedule interview
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}

            {schedulingApplication && (
                <div className="rh-dialog-backdrop" onMouseDown={event => {
                    if (event.target === event.currentTarget) setSchedulingApplication(null);
                }}>
                    <section
                        className="rh-dialog rh-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="schedule-interview-title"
                    >
                        <div className="rh-panel-heading">
                            <div>
                                <span className="rh-eyebrow">Admin approval required</span>
                                <h2 id="schedule-interview-title">Propose an interview</h2>
                                <p>{schedulingApplication.fullName} · {selectedPosting.title}</p>
                            </div>
                            <button
                                type="button"
                                className="rh-dialog-close"
                                onClick={() => setSchedulingApplication(null)}
                                aria-label="Close interview form"
                            >
                                &times;
                            </button>
                        </div>
                        <p className="rh-approval-notice">
                            Your proposed time will remain pending until an administrator approves it.
                        </p>
                        {scheduleError && <div className="api-error" role="alert">{scheduleError}</div>}
                        <form className="dashboard-form rh-form" onSubmit={handleScheduleInterview}>
                            <div className="rh-form-row">
                                <div className="form-group">
                                    <label htmlFor="interview-date">Interview date</label>
                                    <input
                                        id="interview-date"
                                        type="date"
                                        min={new Date().toISOString().slice(0, 10)}
                                        value={scheduleForm.interviewDate}
                                        onChange={event => setScheduleForm(current => ({
                                            ...current,
                                            interviewDate: event.target.value
                                        }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="interview-time">Interview time</label>
                                    <input
                                        id="interview-time"
                                        type="time"
                                        value={scheduleForm.interviewTime}
                                        onChange={event => setScheduleForm(current => ({
                                            ...current,
                                            interviewTime: event.target.value
                                        }))}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="interview-type">Interview type</label>
                                <select
                                    id="interview-type"
                                    value={scheduleForm.interviewType}
                                    onChange={event => setScheduleForm(current => ({
                                        ...current,
                                        interviewType: event.target.value
                                    }))}
                                    required
                                >
                                    <option value="">Select interview type</option>
                                    <option value="Online">Online</option>
                                    <option value="In-person">In-person</option>
                                    <option value="Phone">Phone</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="interview-location">Location or meeting link</label>
                                <input
                                    id="interview-location"
                                    value={scheduleForm.locationOrMeetingLink}
                                    onChange={event => setScheduleForm(current => ({
                                        ...current,
                                        locationOrMeetingLink: event.target.value
                                    }))}
                                    placeholder="Office address or video meeting URL"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="interview-notes">Notes</label>
                                <textarea
                                    id="interview-notes"
                                    value={scheduleForm.notes}
                                    onChange={event => setScheduleForm(current => ({
                                        ...current,
                                        notes: event.target.value
                                    }))}
                                    placeholder="Optional instructions for the student"
                                />
                            </div>
                            <div className="form-buttons">
                                <button type="submit" className="submit-job-btn" disabled={savingSchedule}>
                                    {savingSchedule ? "Submitting..." : "Submit for admin approval"}
                                </button>
                                <button
                                    type="button"
                                    className="cancel-edit-btn"
                                    onClick={() => setSchedulingApplication(null)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}
        </div>
    );
}

export default RecruiterHome;
