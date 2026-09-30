import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../lib/api";
import "./InterviewApprovals.css";

function formatInterviewDate(value) {
    if (!value) return "Date not set";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function InterviewApprovals({ sessionToken }) {
    const [approvals, setApprovals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reasons, setReasons] = useState({});
    const [submittingId, setSubmittingId] = useState(null);

    const loadApprovals = useCallback(async (signal) => {
        setError("");
        try {
            const response = await fetch(apiUrl("admin/interview-approvals"), {
                signal,
                headers: { Authorization: `Bearer ${sessionToken}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to load interview approvals.");
            setApprovals(data.approvals);
        } catch (requestError) {
            if (requestError.name !== "AbortError") {
                console.error("Failed to load interview approvals:", requestError);
                setError(requestError.message || "Unable to load interview approvals.");
            }
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [sessionToken]);

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => loadApprovals(controller.signal), 0);
        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [loadApprovals]);

    async function decide(application, action) {
        const reason = reasons[application.id]?.trim() || "";
        if (action === "request-change" && !reason) {
            setError("Enter a reason before rejecting or requesting a change.");
            return;
        }

        setSubmittingId(application.id);
        setError("");
        try {
            const response = await fetch(apiUrl(`admin/interview-approvals/${application.id}`), {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ action, reason })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to save the interview decision.");
            setApprovals(current => current.filter(item => item.id !== application.id));
        } catch (requestError) {
            console.error("Failed to update interview approval:", requestError);
            setError(requestError.message || "Unable to save the interview decision.");
        } finally {
            setSubmittingId(null);
        }
    }

    return (
        <section className="ia-page" aria-labelledby="interview-approvals-heading">
            <div className="ia-heading">
                <div>
                    <h2 id="interview-approvals-heading">Interview Approvals</h2>
                    <p>Review recruiter proposals before interview details are confirmed with students.</p>
                </div>
                <button type="button" className="refresh-btn" onClick={() => loadApprovals()}>
                    Refresh
                </button>
            </div>

            {error && <div className="api-error" role="alert">{error}</div>}
            {loading && <p className="ia-muted" role="status">Loading approval requests...</p>}
            {!loading && approvals.length === 0 && !error && (
                <div className="ia-empty">
                    <h3>No interviews awaiting approval</h3>
                    <p>New recruiter proposals will appear here for review.</p>
                </div>
            )}

            <div className="ia-list">
                {approvals.map(application => (
                    <article className="ia-card" key={application.id}>
                        <div className="ia-card-heading">
                            <div>
                                <span className="ia-status">Pending Admin Approval</span>
                                <h3>{application.jobTitle}</h3>
                                <p>{application.company}</p>
                            </div>
                            <div className="ia-schedule">
                                <span>{formatInterviewDate(application.proposedDate)}</span>
                                <strong>{application.proposedTime}</strong>
                            </div>
                        </div>

                        <dl className="ia-details">
                            <div><dt>Student</dt><dd>{application.fullName}</dd></div>
                            <div><dt>Student email</dt><dd>{application.email}</dd></div>
                            <div><dt>Enrollment</dt><dd>{application.enrollment}</dd></div>
                            <div><dt>Recruiter</dt><dd>{application.recruiterName} ({application.recruiterEmail})</dd></div>
                            <div><dt>Interview type</dt><dd>{application.interviewType}</dd></div>
                            <div><dt>Location / meeting</dt><dd>{application.locationOrMeetingLink}</dd></div>
                        </dl>
                        {application.notes && (
                            <p className="ia-notes"><strong>Recruiter notes:</strong> {application.notes}</p>
                        )}

                        <div className="ia-actions">
                            <button
                                type="button"
                                className="ia-approve"
                                disabled={submittingId === application.id}
                                onClick={() => decide(application, "approve")}
                            >
                                {submittingId === application.id ? "Saving..." : "Approve interview"}
                            </button>
                            <form className="ia-reject-form" onSubmit={event => {
                                event.preventDefault();
                                decide(application, "request-change");
                            }}>
                                <label htmlFor={`interview-reason-${application.id}`}>
                                    Reject / request change (reason required)
                                </label>
                                <textarea
                                    id={`interview-reason-${application.id}`}
                                    value={reasons[application.id] || ""}
                                    onChange={event => setReasons(current => ({
                                        ...current,
                                        [application.id]: event.target.value
                                    }))}
                                    placeholder="Explain what needs to change"
                                    required
                                />
                                <button type="submit" className="ia-reject" disabled={submittingId === application.id}>
                                    Reject / request change
                                </button>
                            </form>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

export default InterviewApprovals;
