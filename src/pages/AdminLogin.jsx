import { useState } from "react";
import { useNavigate } from "react-router-dom";

function AdminLogin({ setLoggedInUser }) {
    const navigate = useNavigate();

    // Single state object
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
            newErrors.email = "Admin Email is required";
        } else if (!form.email.includes("@")) {
            newErrors.email = "Please enter a valid email address";
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
            const response = await fetch("http://localhost:5000/api/admin/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(form)
            });

            const data = await response.json();

            if (response.ok) {
                alert("Welcome Admin! Redirecting to Admin Dashboard.");
                setLoggedInUser(data.user);
                
                setForm({
                    email: "",
                    password: ""
                });
                setErrors({});
                
                navigate("/admin/dashboard");
            } else {
                setErrors({
                    apiError: data.error || "Invalid Admin username or password"
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
                <h2>Admin Login</h2>
                <p>Authentication portal for LJ placements management</p>
                <div className="demo-credentials">
                    <img src="/LJ%20logo.png" alt="LJ University" />
                </div>

                {errors.apiError && <div className="api-error">{errors.apiError}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Admin Email</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="admin@lj.edu"
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
                            placeholder="••••••••"
                            value={form.password}
                            onChange={handleChange}
                        />
                        {errors.password && <span className="field-error">{errors.password}</span>}
                    </div>

                    <button type="submit" className="auth-btn">Log In as Admin</button>
                </form>
            </div>
        </div>
    );
}

export default AdminLogin;
