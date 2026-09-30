import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/api";

function RecruiterLogin({ setLoggedInUser }) {
    const navigate = useNavigate();

    // Single state object for form
    const [form, setForm] = useState({
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

        if (!form.email.trim()) {
            newErrors.email = "Email is required";
        } else if (!form.email.includes("@")) {
            newErrors.email = "Enter a valid email address";
        }

        if (!form.password) {
            newErrors.password = "Password is required";
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
            const response = await fetch(apiUrl("recruiters/login"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(form)
            });

            const data = await response.json();

            if (response.ok) {
                alert("Login Successful! Welcome, " + data.user.fullName + " (" + data.user.companyName + ")");
                const session = { ...data.user, sessionToken: data.sessionToken };
                localStorage.setItem("ljRecruiterSession", JSON.stringify(session));
                setLoggedInUser(session);
                
                setForm({
                    email: "",
                    password: ""
                });
                setErrors({});
                
                navigate("/recruiter/dashboard");
            } else {
                setErrors({
                    apiError: data.error || "Invalid email or password"
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
                <h2>Recruiter Login</h2>
                <p>Log in to manage job posts and recruit students</p>

                {errors.apiError && <div className="api-error">{errors.apiError}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="Enter your recruiter email"
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
                            placeholder="Enter password"
                            value={form.password}
                            onChange={handleChange}
                        />
                        {errors.password && <span className="field-error">{errors.password}</span>}
                    </div>

                    <button type="submit" className="auth-btn">Log In</button>
                </form>

                <p className="auth-redirect">
                    Don't have an account? <Link to="/recruiter/register">Register here</Link>
                </p>
            </div>
        </div>
    );
}

export default RecruiterLogin;
