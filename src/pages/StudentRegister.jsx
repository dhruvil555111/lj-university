import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/api";

function StudentRegister() {
    const navigate = useNavigate();

    // Form single state object as per requirements
    const [form, setForm] = useState({
        fullName: "",
        enrollment: "",
        email: "",
        department: "",
        spiCgpi: "",
        result: null,
        password: ""
    });

    const [errors, setErrors] = useState({});

    // Generic handleChange using spread operator
    function handleChange(e) {
        const value = e.target.type === "file" ? e.target.files[0] || null : e.target.value;
        setForm({
            ...form,
            [e.target.name]: value
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
        const fullName = form.fullName.trim();
        const enrollment = form.enrollment.trim();
        const email = form.email.trim();
        const percentage = Number(form.spiCgpi);

        if (!fullName) {
            newErrors.fullName = "Full name is required";
        } else if (!/^[A-Za-z][A-Za-z .'-]{1,49}$/.test(fullName)) {
            newErrors.fullName = "Please enter a valid full name";
        }

        if (!enrollment) {
            newErrors.enrollment = "Enrollment number is required";
        } else if (!/^[A-Za-z0-9/-]{3,20}$/.test(enrollment)) {
            newErrors.enrollment = "Please enter a valid enrollment number";
        }

        if (!email) {
            newErrors.email = "Email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            newErrors.email = "Please enter a valid email address";
        }

        if (!form.department) {
            newErrors.department = "Please select a department";
        }

        if (form.spiCgpi === "") {
            newErrors.spiCgpi = "SPI/CGPI percentage is required";
        } else if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
            newErrors.spiCgpi = "Enter a percentage between 0 and 100";
        }

        if (!form.result) {
            newErrors.result = "Result is required";
        } else if (!["application/pdf", "image/jpeg", "image/png"].includes(form.result.type)) {
            newErrors.result = "Upload a PDF, JPG, or PNG file";
        } else if (form.result.size > 5 * 1024 * 1024) {
            newErrors.result = "File size must be 5MB or less";
        }

        if (!form.password.trim()) {
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
            const payload = new FormData();
            Object.entries(form).forEach(([key, value]) => {
                if (value !== null) {
                    payload.append(key, value);
                }
            });

            const response = await fetch(apiUrl("students/register"), {
                method: "POST",
                body: payload
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
                    spiCgpi: "",
                    result: null,
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
                            required
                            maxLength={50}
                        />
                        {errors.fullName && <span className="field-error">{errors.fullName}</span>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="spiCgpi">SPI/CGPI Percentage</label>
                        <input
                            id="spiCgpi"
                            type="number"
                            name="spiCgpi"
                            placeholder="Enter percentage (0-100)"
                            value={form.spiCgpi}
                            onChange={handleChange}
                            min="0"
                            max="100"
                            step="0.01"
                            required
                        />
                        {errors.spiCgpi && <span className="field-error">{errors.spiCgpi}</span>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="result">Result Upload</label>
                        <input
                            id="result"
                            type="file"
                            name="result"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleChange}
                            required
                        />
                        {errors.result && <span className="field-error">{errors.result}</span>}
                    </div>

                    <div className="form-group">
                        <label>Enrollment Number</label>
                        <input
                            type="text"
                            name="enrollment"
                            placeholder="Enter enrollment number"
                            value={form.enrollment}
                            onChange={handleChange}
                            required
                            maxLength={20}
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
                            required
                        />
                        {errors.email && <span className="field-error">{errors.email}</span>}
                    </div>

                    <div className="form-group">
                        <label>Department</label>
                        <select
                            name="department"
                            value={form.department}
                            onChange={handleChange}
                            required
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
                            required
                            minLength={6}
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
