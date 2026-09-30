import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/api";

// Single source of truth for the dropdown AND validation (no duplicate MCA)
const DEPARTMENTS = [
    "BSc IT", "MSc IT", "BCA", "MCA", "BTech CS", "BBA", "BBA FBE",
    "B.com", "M.com", "B.pharm", "M.pharm", "B.Ed", "M.Ed",
    "B.A", "M.A", "B.Arch", "M.Arch"
];

const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_FILE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const INITIAL_FORM = {
    fullName: "",
    enrollment: "",
    email: "",
    department: "",
    spiCgpi: "",
    result: null,
    password: "",
    confirmPassword: ""
};

// Order matches the on-screen order so we can focus the first invalid field
const FIELD_ORDER = [
    "fullName",
    "spiCgpi",
    "result",
    "enrollment",
    "email",
    "department",
    "password",
    "confirmPassword"
];

// Validates ONE field. Returns an error message, or "" if valid.
function validateField(name, value, form) {
    switch (name) {
        case "fullName": {
            const v = value.trim();
            if (!v) return "Full name is required";
            if (v.length < 2) return "Full name must be at least 2 characters";
            if (v.length > 50) return "Full name must be 50 characters or less";
            if (!/^[A-Za-z][A-Za-z .'-]*$/.test(v)) {
                return "Use only letters, spaces, apostrophes, dots and hyphens";
            }
            if (/\s{2,}/.test(v)) return "Remove extra spaces between words";
            return "";
        }

        case "enrollment": {
            const v = value.trim();
            if (!v) return "Enrollment number is required";
            if (v.length < 3) return "Enrollment number must be at least 3 characters";
            if (v.length > 20) return "Enrollment number must be 20 characters or less";
            if (!/^[A-Za-z0-9/-]+$/.test(v)) {
                return "Use only letters, numbers, / and -";
            }
            return "";
        }

        case "email": {
            const v = value.trim();
            if (!v) return "Email is required";
            if (v.length > 100) return "Email must be 100 characters or less";
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
                return "Please enter a valid email address";
            }
            // Uncomment to restrict to your university domain:
            // if (!v.toLowerCase().endsWith("@ljku.edu.in")) {
            //     return "Please use your college email address";
            // }
            return "";
        }

        case "department": {
            if (!value) return "Please select a department";
            if (!DEPARTMENTS.includes(value)) return "Please select a valid department";
            return "";
        }

        case "spiCgpi": {
            if (String(value).trim() === "") return "SPI/CGPI percentage is required";
            const num = Number(value);
            if (!Number.isFinite(num)) return "Enter a valid number";
            if (num < 0 || num > 100) return "Enter a percentage between 0 and 100";
            if (!/^\d{1,3}(\.\d{1,2})?$/.test(String(value).trim())) {
                return "Use at most 2 decimal places";
            }
            return "";
        }

        case "result": {
            if (!value) return "Result is required";
            const ext = value.name.split(".").pop().toLowerCase();
            if (!ALLOWED_FILE_TYPES.includes(value.type) || !ALLOWED_FILE_EXTENSIONS.includes(ext)) {
                return "Upload a PDF, JPG, or PNG file";
            }
            if (value.size === 0) return "The selected file is empty";
            if (value.size > MAX_FILE_SIZE) return "File size must be 5MB or less";
            return "";
        }

        case "password": {
            if (!value) return "Password is required";
            if (/\s/.test(value)) return "Password cannot contain spaces";
            if (value.length < 6) return "Password must be at least 6 characters";
            if (value.length > 64) return "Password must be 64 characters or less";
            if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
                return "Password must include at least one letter and one number";
            }
            return "";
        }

        case "confirmPassword": {
            if (!value) return "Please confirm your password";
            if (value !== form.password) return "Passwords do not match";
            return "";
        }

        default:
            return "";
    }
}

function StudentRegister() {
    const navigate = useNavigate();
    const formRef = useRef(null);

    const [form, setForm] = useState(INITIAL_FORM);
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    function handleChange(e) {
        const { name, type, value, files } = e.target;
        const newValue = type === "file" ? files[0] || null : value;

        const nextForm = { ...form, [name]: newValue };
        setForm(nextForm);

        setErrors((prev) => {
            const next = { ...prev, apiError: "" };

            // Re-check a field live only once it has already shown an error
            if (prev[name]) {
                next[name] = validateField(name, newValue, nextForm);
            }

            // Keep confirm-password in sync when the password changes
            if (name === "password" && prev.confirmPassword) {
                next.confirmPassword = validateField("confirmPassword", nextForm.confirmPassword, nextForm);
            }
            return next;
        });
    }

    // Validate a field when the user leaves it
    function handleBlur(e) {
        const { name, type, value, files } = e.target;
        const fieldValue = type === "file" ? files[0] || null : value;
        setErrors((prev) => ({
            ...prev,
            [name]: validateField(name, fieldValue, form)
        }));
    }

    function validate() {
        const newErrors = {};
        FIELD_ORDER.forEach((name) => {
            const message = validateField(name, form[name], form);
            if (message) newErrors[name] = message;
        });

        setErrors(newErrors);

        // Move focus to the first invalid field
        const firstInvalid = FIELD_ORDER.find((name) => newErrors[name]);
        if (firstInvalid && formRef.current) {
            const el = formRef.current.elements[firstInvalid];
            if (el) el.focus();
        }

        return Object.keys(newErrors).length === 0;
    }

    async function handleSubmit(e) {
        e.preventDefault();

        if (isSubmitting) return; // block double submits
        if (!validate()) return;

        setIsSubmitting(true);

        try {
            // Send cleaned values (the same ones that were validated)
            const cleaned = {
                fullName: form.fullName.trim().replace(/\s+/g, " "),
                enrollment: form.enrollment.trim().toUpperCase(),
                email: form.email.trim().toLowerCase(),
                department: form.department,
                spiCgpi: String(form.spiCgpi).trim(),
                result: form.result,
                password: form.password
                // confirmPassword is intentionally NOT sent
            };

            const payload = new FormData();
            Object.entries(cleaned).forEach(([key, value]) => {
                if (value !== null) payload.append(key, value);
            });

            const response = await fetch(apiUrl("students/register"), {
                method: "POST",
                body: payload
            });

            // The server may return a non-JSON error page; don't crash on it
            let data = {};
            try {
                data = await response.json();
            } catch {
                data = {};
            }

            if (response.ok) {
                alert("Student Registration Successful! Please log in.");
                setForm(INITIAL_FORM);
                setErrors({});
                navigate("/student/login");
            } else {
                // Support both { error: "..." } and { errors: { field: "..." } }
                const fieldErrors =
                    data.errors && typeof data.errors === "object" ? data.errors : {};
                setErrors({
                    ...fieldErrors,
                    apiError: data.error || "Registration failed. Try again."
                });
            }
        } catch (err) {
            console.error(err);
            setErrors({
                apiError: "Failed to connect to backend server. Make sure it is running."
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    // Shared accessibility props for every field
    function fieldProps(name) {
        return {
            id: name,
            name,
            onChange: handleChange,
            onBlur: handleBlur,
            "aria-invalid": errors[name] ? "true" : "false",
            "aria-describedby": errors[name] ? `${name}-error` : undefined
        };
    }

    function renderError(name) {
        return errors[name] ? (
            <span id={`${name}-error`} className="field-error" role="alert">
                {errors[name]}
            </span>
        ) : null;
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Student Registration</h2>
                <p>Register to apply for placements at LJ University</p>

                {errors.apiError && (
                    <div className="api-error" role="alert">{errors.apiError}</div>
                )}

                {/* noValidate turns off the browser's popups so our messages show */}
                <form ref={formRef} onSubmit={handleSubmit} className="auth-form" noValidate>
                    <div className="form-group">
                        <label htmlFor="fullName">Full Name</label>
                        <input
                            {...fieldProps("fullName")}
                            type="text"
                            placeholder="Enter your full name"
                            value={form.fullName}
                            maxLength={50}
                            autoComplete="name"
                        />
                        {renderError("fullName")}
                    </div>

                    <div className="form-group">
                        <label htmlFor="spiCgpi">SPI/CGPI Percentage</label>
                        <input
                            {...fieldProps("spiCgpi")}
                            type="number"
                            inputMode="decimal"
                            placeholder="Enter percentage (0-100)"
                            value={form.spiCgpi}
                            min="0"
                            max="100"
                            step="0.01"
                        />
                        {renderError("spiCgpi")}
                    </div>

                    <div className="form-group">
                        <label htmlFor="result">Result Upload</label>
                        <input
                            {...fieldProps("result")}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                        />
                        {renderError("result")}
                    </div>

                    <div className="form-group">
                        <label htmlFor="enrollment">Enrollment Number</label>
                        <input
                            {...fieldProps("enrollment")}
                            type="text"
                            placeholder="Enter enrollment number"
                            value={form.enrollment}
                            maxLength={20}
                        />
                        {renderError("enrollment")}
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input
                            {...fieldProps("email")}
                            type="email"
                            placeholder="Enter college email"
                            value={form.email}
                            maxLength={100}
                            autoComplete="email"
                        />
                        {renderError("email")}
                    </div>

                    <div className="form-group">
                        <label htmlFor="department">Department</label>
                        <select
                            {...fieldProps("department")}
                            value={form.department}
                        >
                            <option value="">Select Department</option>
                            {DEPARTMENTS.map((dept) => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                        {renderError("department")}
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            {...fieldProps("password")}
                            type="password"
                            placeholder="Min 6 characters, with a letter and a number"
                            value={form.password}
                            maxLength={64}
                            autoComplete="new-password"
                        />
                        {renderError("password")}
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            {...fieldProps("confirmPassword")}
                            type="password"
                            placeholder="Re-enter your password"
                            value={form.confirmPassword}
                            maxLength={64}
                            autoComplete="new-password"
                        />
                        {renderError("confirmPassword")}
                    </div>

                    <button type="submit" className="auth-btn" disabled={isSubmitting}>
                        {isSubmitting ? "Registering..." : "Register"}
                    </button>
                </form>

                <p className="auth-redirect">
                    Already have an account? <Link to="/student/login">Login here</Link>
                </p>
            </div>
        </div>
    );
}

export default StudentRegister;