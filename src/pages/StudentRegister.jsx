import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function StudentRegister() {
    const navigate = useNavigate();

    // Form single state object as per requirements
    const [form, setForm] = useState({
        fullName: "",
        enrollment: "",
        email: "",
        department: "",
        password: ""
    });

    const [errors, setErrors] = useState({});

    // Generic handleChange using spread operator
    function handleChange(e) {
        setForm({
            ...form,
            [e.target.name]: e.target.value
        });
        // Clear specific error as user types
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

        if (!form.enrollment.trim()) {
            newErrors.enrollment = "Enrollment number is required";
        }

        if (!form.email.trim()) {
            newErrors.email = "Email is required";
        } else if (!form.email.includes("@")) {
            newErrors.email = "Please enter a valid email address";
        }

        if (!form.department) {
            newErrors.department = "Please select a department";
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
        e.preventDefault(); // Prevent page reload

        if (!validate()) {
            return;
        }

        try {
            // Post registration payload to backend
            const response = await fetch("http://localhost:5000/api/students/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(form)
            });

            const data = await response.json();

            if (response.ok) {
                alert("Student Registration Successful! Please log in.");
                
                // Reset form
                setForm({
                    fullName: "",
                    enrollment: "",
                    email: "",
                    department: "",
                    password: ""
                });
                setErrors({});
                
                // Redirect
                navigate("/student/login");
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
                <h2>Student Registration</h2>
                <p>Register to apply for placements at LJ University</p>

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
                        <label>Enrollment Number</label>
                        <input
                            type="text"
                            name="enrollment"
                            placeholder="Enter enrollment number"
                            value={form.enrollment}
                            onChange={handleChange}
                        />
                        {errors.enrollment && <span className="field-error">{errors.enrollment}</span>}
                    </div>

                    <div className="form-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            name="email"
                            placeholder="Enter college email"
                            value={form.email}
                            onChange={handleChange}
                        />
                        {errors.email && <span className="field-error">{errors.email}</span>}
                    </div>

                    <div className="form-group">
                        <label>Department</label>
                        <select
                            name="department"
                            value={form.department}
                            onChange={handleChange}
                        >
                            <option value="">Select Department</option>
                            <option value="BSc IT">BSc IT</option>
                            <option value="MSc IT">MSc IT</option>
                            <option value="BCA">BCA</option>
                            <option value="MCA">MCA</option>
                            <option value="BTech CS">BTech CS</option>
                        </select>
                        {errors.department && <span className="field-error">{errors.department}</span>}
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
                    Already have an account? <Link to="/student/login">Login here</Link>
                </p>
            </div>
        </div>
    );
}

export default StudentRegister;
