const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = new Set([
    ...(process.env.FRONTEND_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean)
]);

function isLocalOrigin(origin) {
    try {
        const url = new URL(origin);
        return ['localhost', '127.0.0.1'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

app.use((req, res, next) => {
    const origin = req.get('origin');
    const requestHost = req.get('x-forwarded-host') || req.get('host');
    if (origin && requestHost) {
        try {
            if (new URL(origin).host === requestHost) return next();
        } catch {
            return res.status(403).json({ error: 'Origin not allowed by CORS' });
        }
    }

    cors({
        origin(requestOrigin, callback) {
            if (!requestOrigin || allowedOrigins.has(requestOrigin) || isLocalOrigin(requestOrigin)) {
                return callback(null, true);
            }
            callback(new Error('Origin not allowed by CORS'));
        }
    })(req, res, next);
});
app.use(express.json());

const resultUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.mimetype)) {
            return callback(new Error('Result must be a PDF, JPG, or PNG file'));
        }
        callback(null, true);
    }
});

let supabase;
function getSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the backend environment');
    }

    if (!supabase) {
        const { createClient } = require('@supabase/supabase-js');
        supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
    }

    return supabase;
}

function getSupabaseAuthClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
        throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in the backend environment');
    }

    const { createClient } = require('@supabase/supabase-js');
    return createClient(supabaseUrl, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

async function getResultUrl(client, resultPath) {
    if (!resultPath) return null;
    if (/^https?:\/\//i.test(resultPath)) return resultPath;
    const { data, error } = await client.storage.from('results').createSignedUrl(resultPath, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
}

function logDatabaseError(action, error) {
    console.error(`Supabase ${action} failed:`, error.message || error);
}

function isMissingSpiColumn(error) {
    return ['42703', 'PGRST204'].includes(error.code)
        && /(?:students\.)?spi_cgpi/i.test(error.message || '');
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.get('/api/students', async (req, res) => {
    try {
        const client = getSupabase();
        const { data, error } = await client
            .from('students')
            .select('id,full_name,enrollment_no,email,course,spi_cgpi,resume_url,created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const students = await Promise.all(data.map(async student => ({
            id: student.id,
            fullName: student.full_name,
            enrollment: student.enrollment_no,
            email: student.email,
            department: student.course,
            spiCgpi: student.spi_cgpi,
            result: await getResultUrl(client, student.resume_url),
            created_at: student.created_at
        })));
        res.json(students);
    } catch (error) {
        logDatabaseError('student listing', error);
        res.status(500).json({ error: 'Unable to load students from the database' });
    }
});

app.post('/api/students/register', resultUpload.single('result'), async (req, res) => {
    const { fullName, enrollment, email, department, password, spiCgpi, semester, phone } = req.body;

    if (!fullName || !enrollment || !email || !department || !password || spiCgpi === undefined || !req.file) {
        return res.status(400).json({ error: "All fields, SPI/CGPI percentage, and result are required" });
    }

    const percentage = Number(spiCgpi);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        return res.status(400).json({ error: "SPI/CGPI percentage must be between 0 and 100" });
    }

    const studentRecord = {
        full_name: fullName.trim(),
        enrollment_no: enrollment.trim(),
        email: email.trim().toLowerCase(),
        course: department,
        spi_cgpi: percentage
    };
    if (semester !== undefined && semester !== '') {
        const semesterNumber = Number(semester);
        if (!Number.isInteger(semesterNumber) || semesterNumber < -32768 || semesterNumber > 32767) {
            return res.status(400).json({ error: 'Semester must be a valid integer' });
        }
        studentRecord.semester = semesterNumber;
    }
    if (typeof phone === 'string' && phone.trim()) {
        studentRecord.phone = phone.trim();
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedEnrollment = enrollment.trim();
    const resultPath = `${crypto.randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`;
    let client;
    let authUserId;
    let uploadedResult = false;

    try {
        client = getSupabase();
        const [{ data: emailMatch, error: emailError }, { data: enrollmentMatch, error: enrollmentError }] = await Promise.all([
            client.from('students').select('id').ilike('email', normalizedEmail).maybeSingle(),
            client.from('students').select('id').eq('enrollment_no', normalizedEnrollment).maybeSingle()
        ]);
        if (emailError) throw emailError;
        if (enrollmentError) throw enrollmentError;
        if (emailMatch) return res.status(409).json({ error: 'Email is already registered' });
        if (enrollmentMatch) return res.status(409).json({ error: 'Enrollment number is already registered' });

        const { data: authData, error: authError } = await client.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: { role: 'student' }
        });
        if (authError) throw authError;
        authUserId = authData.user.id;

        const { error: uploadError } = await client.storage.from('results').upload(resultPath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
        });
        if (uploadError) throw uploadError;
        uploadedResult = true;

        const resultUrl = await getResultUrl(client, resultPath);
        const { data: student, error: insertError } = await client
            .from('students')
            .insert({ ...studentRecord, resume_url: resultPath })
            .select('id,full_name,enrollment_no,email,course,spi_cgpi')
            .single();
        if (insertError) throw insertError;

        res.status(201).json({
            message: "Student registered successfully",
            student: {
                id: student.id,
                fullName: student.full_name,
                enrollment: student.enrollment_no,
                email: student.email,
                department: student.course,
                spiCgpi: student.spi_cgpi,
                result: resultUrl
            }
        });
    } catch (error) {
        if (client && uploadedResult) {
            const { error: cleanupError } = await client.storage.from('results').remove([resultPath]);
            if (cleanupError) logDatabaseError('result cleanup', cleanupError);
        }
        if (client && authUserId) {
            const { error: cleanupError } = await client.auth.admin.deleteUser(authUserId);
            if (cleanupError) logDatabaseError('auth user cleanup', cleanupError);
        }

        if (error.code === '23505' || error.code === 'email_exists') {
            return res.status(409).json({ error: 'Email or enrollment number is already registered' });
        }
        logDatabaseError('student registration', error);
        if (isMissingSpiColumn(error)) {
            return res.status(503).json({ error: 'Apply the student registration migration in Supabase before registering students' });
        }
        res.status(500).json({ error: 'Unable to register student in the database' });
    }
});

app.post('/api/students/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        const client = getSupabase();
        const { data: authData, error: authError } = await getSupabaseAuthClient().auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });

        if (authError || !authData.user) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const { data: student, error } = await client
            .from('students')
            .select('full_name,email,enrollment_no,course,spi_cgpi,resume_url')
            .ilike('email', authData.user.email)
            .maybeSingle();

        if (error) throw error;
        if (!student) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        res.json({
            message: "Login successful",
            user: {
                role: 'student',
                fullName: student.full_name,
                email: student.email,
                enrollment: student.enrollment_no,
                department: student.course,
                spiCgpi: student.spi_cgpi,
                result: await getResultUrl(client, student.resume_url)
            }
        });
    } catch (error) {
        logDatabaseError('student login', error);
        res.status(500).json({ error: 'Unable to log in with the database' });
    }
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

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? "Result file must be 5MB or less"
            : "Unable to upload result";
        return res.status(400).json({ error: message });
    }

    if (error.message === 'Origin not allowed by CORS') {
        return res.status(403).json({ error: error.message });
    }

    if (error) {
        return res.status(400).json({ error: error.message || "Unable to upload result" });
    }

    next();
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
