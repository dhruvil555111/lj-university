const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Helper functions for reading/writing data
const getFilePath = (filename) => path.join(__dirname, 'data', filename);

const readData = (filename) => {
    try {
        const filePath = getFilePath(filename);
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data || '[]');
    } catch (error) {
        console.error(`Error reading file ${filename}:`, error);
        return [];
    }
};

const writeData = (filename, data) => {
    try {
        const filePath = getFilePath(filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Error writing file ${filename}:`, error);
    }
};

// Jobs Endpoints
app.get('/api/jobs', (req, res) => {
    const jobs = readData('jobs.json');
    res.json(jobs);
});

app.post('/api/jobs', (req, res) => {
    const jobs = readData('jobs.json');
    const { title, company, location, salary, jobType, description } = req.body;
    
    if (!title || !company || !location || !salary || !jobType || !description) {
        return res.status(400).json({ error: "All fields are required" });
    }

    const newJob = {
        id: jobs.length > 0 ? Math.max(...jobs.map(j => j.id)) + 1 : 1,
        title,
        company,
        location,
        salary,
        jobType,
        description
    };

    jobs.unshift(newJob); // Add to the front of list
    writeData('jobs.json', jobs);
    res.status(201).json({ message: "Job created successfully", job: newJob });
});

app.put('/api/jobs/:id', (req, res) => {
    const jobs = readData('jobs.json');
    const id = parseInt(req.params.id);
    const { title, company, location, salary, jobType, description } = req.body;

    const index = jobs.findIndex(j => j.id === id);
    if (index === -1) {
        return res.status(404).json({ error: "Job not found" });
    }

    jobs[index] = {
        ...jobs[index],
        title: title || jobs[index].title,
        company: company || jobs[index].company,
        location: location || jobs[index].location,
        salary: salary || jobs[index].salary,
        jobType: jobType || jobs[index].jobType,
        description: description || jobs[index].description
    };

    writeData('jobs.json', jobs);
    res.json({ message: "Job updated successfully", job: jobs[index] });
});

app.delete('/api/jobs/:id', (req, res) => {
    const jobs = readData('jobs.json');
    const id = parseInt(req.params.id);

    const filteredJobs = jobs.filter(j => j.id !== id);
    if (jobs.length === filteredJobs.length) {
        return res.status(404).json({ error: "Job not found" });
    }

    writeData('jobs.json', filteredJobs);
    res.json({ message: "Job deleted successfully" });
});

// Students Endpoints
app.get('/api/students', (req, res) => {
    const students = readData('students.json');
    res.json(students.map(s => {
        const { password, ...rest } = s;
        return rest;
    }));
});

app.post('/api/students/register', (req, res) => {
    const students = readData('students.json');
    const { fullName, enrollment, email, department, password } = req.body;

    if (!fullName || !enrollment || !email || !department || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    if (students.some(s => s.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ error: "Email is already registered" });
    }

    const newStudent = { fullName, enrollment, email, department, password };
    students.push(newStudent);
    writeData('students.json', students);

    res.status(201).json({ message: "Student registered successfully", student: { fullName, enrollment, email, department } });
});

app.post('/api/students/login', (req, res) => {
    const students = readData('students.json');
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    const student = students.find(s => s.email.toLowerCase() === email.toLowerCase() && s.password === password);
    if (!student) {
        return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({
        message: "Login successful",
        user: {
            role: 'student',
            fullName: student.fullName,
            email: student.email,
            enrollment: student.enrollment,
            department: student.department
        }
    });
});

// Recruiters Endpoints
app.get('/api/recruiters', (req, res) => {
    const recruiters = readData('recruiters.json');
    res.json(recruiters.map(r => {
        const { password, ...rest } = r;
        return rest;
    }));
});

app.post('/api/recruiters/register', (req, res) => {
    const recruiters = readData('recruiters.json');
    const { fullName, companyName, email, password } = req.body;

    if (!fullName || !companyName || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    if (recruiters.some(r => r.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ error: "Email is already registered" });
    }

    const newRecruiter = { fullName, companyName, email, password };
    recruiters.push(newRecruiter);
    writeData('recruiters.json', recruiters);

    res.status(201).json({ message: "Recruiter registered successfully", recruiter: { fullName, companyName, email } });
});

app.post('/api/recruiters/login', (req, res) => {
    const recruiters = readData('recruiters.json');
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    const recruiter = recruiters.find(r => r.email.toLowerCase() === email.toLowerCase() && r.password === password);
    if (!recruiter) {
        return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({
        message: "Login successful",
        user: {
            role: 'recruiter',
            fullName: recruiter.fullName,
            companyName: recruiter.companyName,
            email: recruiter.email
        }
    });
});

// Admin Endpoint
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    // Dummy credentials
    if (email === 'admin@lj.edu' && password === 'admin123') {
        return res.json({
            message: "Admin login successful",
            user: {
                role: 'admin',
                fullName: 'LJ Admin',
                email: 'admin@lj.edu'
            }
        });
    }

    res.status(401).json({ error: "Invalid admin credentials" });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
