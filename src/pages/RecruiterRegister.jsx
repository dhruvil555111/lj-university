import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/api";

function RecruiterRegister() {
    const navigate = useNavigate();

    // Single state object for form
    const [form, setForm] = useState({
        fullName: "",
        companyName: "",
        email: "",
        password: ""
    });

    const [errors, setErrors] = useState({});

    // Generic handleChange using spread operator
    function handleChange(e) {
        setForm({
            ...form,
            [e.target.name]: e.target.value
        });
        if (errors[e.target.name]) {
            setErrors({
                ...errors,
                [e.target.name]: ""
            });
        }
    }

    function validate() {
        let newErrors = {};

        if (!form.fullName.trim()) {
            newErrors.fullName = "Full name is required";
        }

        if (!form.companyName.trim()) {
            newErrors.companyName = "Company name is required";
        }

        if (!form.email.trim()) {
            newErrors.email = "Email is required";
        } else if (!form.email.includes("@")) {
            newErrors.email = "Please enter a valid email address";
        }

        if (!form.password) {
            newErrors.password = "Password is required";
        } else if (form.password.length < 6) {
            newErrors.password = "Password must be at least 6 characters";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    async function handleSubmit(e) {
        e.preventDefault();

        if (!validate()) {
            return;
        }

        try {
            const response = await fetch(apiUrl("recruiters/register"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(form)
            });

            const data = await response.json();

            if (response.ok) {
                alert("Recruiter Registration Successful! Please log in.");
                setForm({
                    fullName: "",
                    companyName: "",
                    email: "",
                    password: ""
                });
                setErrors({});
                navigate("/recruiter/login");
            } else {
                setErrors({
                    apiError: data.error || "Registration failed. Try again."
                });
            }
        } catch (err) {
            console.error(err);
            setErrors({
                apiError: "Failed to connect to backend server. Make sure it is running."
            });
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Recruiter Registration</h2>
                <p>Register to post placements and hire LJ students</p>

                {errors.apiError && <div className="api-error">{errors.apiError}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Full Name</label>
                        <input
                            type="text"
                            name="fullName"
                            placeholder="Enter your full name"
                            value={form.fullName}
                            onChange={handleChange}
                        />
                        {errors.fullName && <span className="field-error">{errors.fullName}</span>}
                    </div>

                    <div className="form-group">
                        <label>Company Name</label>
                        <input
                            type="text"
                            name="companyName"
                            placeholder="Enter hiring company name"
                            value={form.companyName}
                            onChange={handleChange}
                        />
                        {errors.companyName && <span className="field-error">{errors.companyName}</span>}
                    </div>

                    <div className="form-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="Enter recruiter email"
                            value={form.email}
                            onChange={handleChange}
                        />
                        {errors.email && <span className="field-error">{errors.email}</span>}
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            name="password"
                            placeholder="Enter password (min 6 characters)"
                            value={form.password}
                            onChange={handleChange}
                        />
                        {errors.password && <span className="field-error">{errors.password}</span>}
                    </div>

                    <button type="submit" className="auth-btn">Register</button>
                </form>

                <p className="auth-redirect">
                    Already registered? <Link to="/recruiter/login">Login here</Link>
                </p>
            </div>
        </div>
    );
}

export default RecruiterRegister;
