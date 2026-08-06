import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function StudentLogin({ setLoggedInUser }) {
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
        e.preventDefault(); // Prevent default submission

        if (!validate()) {
            return;
        }

        try {
            const response = await fetch("http://localhost:5000/api/students/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(form)
            });

            const data = await response.json();

            if (response.ok) {
                alert("Login Successful! Welcome, " + data.user.fullName);
                setLoggedInUser(data.user);
                
                // Reset form
                setForm({
                    email: "",
                    password: ""
                });
                setErrors({});
                
                // Redirect to dashboard
                navigate("/student/dashboard");
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
                <h2>Student Login</h2>
                <p>Log in to view and apply for open jobs</p>

                {errors.apiError && <div className="api-error">{errors.apiError}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="Enter your student email"
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
                    Don't have an account? <Link to="/student/register">Register here</Link>
                </p>
            </div>
        </div>
    );
}

export default StudentLogin;
