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

function validImageContents(file) {
    const buffer = file?.buffer;
    if (!buffer || buffer.length < 12) return false;
    if (file.mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (file.mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (file.mimetype === 'image/webp') {
        return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    }
    return false;
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

const companyLogoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            return callback(new Error('Profile images must be JPG, PNG, or WebP files.'));
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
        return true;
    } catch (error) {
        console.error(`Error writing file ${filename}:`, error);
        return false;
    }
};

function getBearerToken(req) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}

function findSession(req, role) {
    const token = getBearerToken(req);
    if (!token) return null;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    return readData('recruiter-sessions.json').find(session => {
        const storedHash = Buffer.from(session.tokenHash || '', 'hex');
        const requestHash = Buffer.from(tokenHash, 'hex');
        return session.role === role
            && Date.parse(session.expiresAt) > now
            && storedHash.length === requestHash.length
            && crypto.timingSafeEqual(storedHash, requestHash);
    }) || null;
}

function authenticateSession(role) {
    return (req, res, next) => {
        const session = findSession(req, role);
        if (!session) {
            return res.status(401).json({ error: 'Your session is invalid or has expired. Please log in again.' });
        }

        const user = readData(role === 'recruiter' ? 'recruiters.json' : 'admins.json')
            .find(account => account.email.toLowerCase() === session.email.toLowerCase());
        if (!user) {
            return res.status(401).json({ error: 'Your account could not be verified. Please log in again.' });
        }

        req.authenticatedUser = user;
        req.sessionTokenHash = session.tokenHash;
        next();
    };
}

function createSession(role, email) {
    const sessions = readData('recruiter-sessions.json')
        .filter(session => Date.parse(session.expiresAt) > Date.now());
    const token = crypto.randomBytes(32).toString('hex');
    sessions.push({
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        email,
        role,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    return writeData('recruiter-sessions.json', sessions) ? token : null;
}

function isValidDeadline(deadline) {
    if (typeof deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return false;
    const date = new Date(`${deadline}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === deadline;
}

function isJobOpen(job) {
    if (job.driveStatus) {
        return job.driveStatus === 'Open'
            && (job.approvalStatus === undefined || job.approvalStatus === 'Approved')
            && (!job.applicationStartDate || job.applicationStartDate <= new Date().toISOString().slice(0, 10))
            && (!job.deadline || job.deadline >= new Date().toISOString().slice(0, 10));
    }
    return !job.deadline || job.deadline >= new Date().toISOString().slice(0, 10);
}

function recruiterOwnsJob(recruiter, job) {
    return job.recruiterEmail
        ? job.recruiterEmail.toLowerCase() === recruiter.email.toLowerCase()
        : (job.company || '').toLowerCase() === recruiter.companyName.toLowerCase();
}

function recruiterVerificationStatus(recruiter) {
    return ['Pending', 'Approved', 'Rejected', 'Changes Requested'].includes(recruiter.verificationStatus)
        ? recruiter.verificationStatus
        : 'Pending';
}

function publicRecruiter(recruiter, companyLogoUrl = null) {
    const { password, passwordHash, ...safeRecruiter } = recruiter;
    const verificationStatus = recruiterVerificationStatus(recruiter);
    return {
        ...safeRecruiter,
        verificationStatus,
        verified: verificationStatus === 'Approved',
        approvedBy: verificationStatus === 'Approved' ? recruiter.verifiedBy || null : null,
        approvedAt: verificationStatus === 'Approved' ? recruiter.verifiedAt || null : null,
        rejectedBy: verificationStatus === 'Rejected' ? recruiter.rejectedBy || null : null,
        rejectedAt: verificationStatus === 'Rejected' ? recruiter.rejectedAt || null : null,
        companyLogoUrl
    };
}

function validEmail(value) {
    return typeof value === 'string'
        && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function validPhone(value) {
    return typeof value === 'string' && /^\+?[0-9()\-\s]{7,20}$/.test(value.trim());
}

function validOptionalUrl(value) {
    if (!value) return true;
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

function validRecruiterProfile(profile) {
    return typeof profile.fullName === 'string' && profile.fullName.trim().length >= 2
        && typeof profile.designation === 'string' && profile.designation.trim().length > 0
        && typeof profile.companyName === 'string' && profile.companyName.trim().length > 0
        && validEmail(profile.officialEmail)
        && validPhone(profile.phone)
        && validOptionalUrl(profile.linkedInProfile)
        && validOptionalUrl(profile.website)
        && validOptionalUrl(profile.linkedInUrl);
}

async function companyLogoUrlFor(recruiter) {
    if (!recruiter.companyLogoPath) return null;
    if (hasSupabaseConfiguration()) return getResultUrl(getSupabase(), recruiter.companyLogoPath);
    return `/uploads/company-logos/${encodeURIComponent(path.basename(recruiter.companyLogoPath))}`;
}

async function recruiterPhotoUrlFor(recruiter) {
    if (!recruiter.profilePhotoPath) return null;
    if (hasSupabaseConfiguration()) return getResultUrl(getSupabase(), recruiter.profilePhotoPath);
    return `/uploads/recruiter-profiles/${encodeURIComponent(path.basename(recruiter.profilePhotoPath))}`;
}

async function syncRecruiterProfileToDatabase(recruiter) {
    if (!hasSupabaseConfiguration()) return;
    const { error } = await getSupabase()
        .from('recruiters')
        .update({
            full_name: recruiter.fullName,
            company_name: recruiter.companyName,
            designation: recruiter.designation || null,
            hr_talent_acquisition: recruiter.hrTalentAcquisition || null,
            short_bio: recruiter.shortBio || null,
            official_email: recruiter.officialEmail || null,
            phone: recruiter.phone || null,
            linkedin_profile: recruiter.linkedInProfile || null,
            location: recruiter.location || null,
            industry: recruiter.industry || null,
            company_type: recruiter.companyType || null,
            company_size: recruiter.companySize || null,
            founded_year: recruiter.foundedYear || null,
            website: recruiter.website || null,
            full_address: recruiter.fullAddress || null,
            linkedin_url: recruiter.linkedInUrl || null,
            company_description: recruiter.companyDescription || null,
            company_logo_path: recruiter.companyLogoPath || null,
            profile_photo_path: recruiter.profilePhotoPath || null,
            verification_status: recruiterVerificationStatus(recruiter),
            verified: recruiterVerificationStatus(recruiter) === 'Approved',
            verification_submitted_at: recruiter.verificationSubmittedAt || null,
            verified_by: recruiter.verifiedBy || null,
            verified_at: recruiter.verifiedAt || null,
            verification_rejection_reason: recruiter.verificationRejectionReason || null,
            rejected_by: recruiter.rejectedBy || null,
            rejected_at: recruiter.rejectedAt || null
        })
        .ilike('email', recruiter.email);
    if (error) throw error;
}

function recruiterCanCreateDrives(recruiter) {
    return recruiterVerificationStatus(recruiter) === 'Approved';
}

function resetRecruiterVerificationForResubmission(recruiter) {
    recruiter.verificationStatus = 'Pending';
    recruiter.verified = false;
    recruiter.verificationSubmittedAt = new Date().toISOString();
    recruiter.verifiedBy = null;
    recruiter.verifiedAt = null;
    recruiter.rejectedBy = null;
    recruiter.rejectedAt = null;
    recruiter.verificationRejectionReason = '';
}

function recruiterApprovedForJob(job) {
    if (!job.driveStatus) return true;
    const recruiter = readData('recruiters.json').find(account =>
        job.recruiterEmail
            ? account.email.toLowerCase() === job.recruiterEmail.toLowerCase()
            : String(account.id) === String(job.recruiterId)
    );
    return Boolean(recruiter && recruiterCanCreateDrives(recruiter));
}

function getRecruiterForJob(job) {
    const recruiters = readData('recruiters.json');
    const recruiter = recruiters.find(account =>
        job.recruiterEmail
            ? account.email.toLowerCase() === job.recruiterEmail.toLowerCase()
            : account.companyName.toLowerCase() === (job.company || '').toLowerCase()
    );
    if (!recruiter) return null;
    if (!recruiter.id) {
        recruiter.id = crypto.randomUUID();
        if (!writeData('recruiters.json', recruiters)) return null;
    }
    return recruiter;
}

function hasSupabaseConfiguration() {
    return Boolean(process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function persistInterviewWorkflow(application) {
    if (!hasSupabaseConfiguration()) return;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set to persist interview workflow data');
    }

    const { error } = await getSupabase()
        .from('placement_interviews')
        .upsert({
            application_id: application.id,
            recruiter_id: application.recruiterId,
            student_id: application.studentId,
            job_id: String(application.jobId),
            proposed_date: application.proposedDate,
            proposed_time: application.proposedTime,
            interview_type: application.interviewType,
            location_or_meeting_link: application.locationOrMeetingLink,
            notes: application.notes,
            status: application.status,
            admin_approval_status: application.adminApprovalStatus,
            admin_approval_by: application.adminApprovalBy || null,
            admin_approval_at: application.adminApprovalAt || null,
            rejection_reason: application.rejectionReason || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'application_id' });
    if (error) throw error;
}

function workflowFromDatabaseRow(row) {
    return {
        id: row.application_id,
        recruiterId: row.recruiter_id,
        studentId: row.student_id,
        jobId: row.job_id,
        proposedDate: row.proposed_date,
        proposedTime: row.proposed_time ? String(row.proposed_time).slice(0, 5) : null,
        interviewType: row.interview_type,
        locationOrMeetingLink: row.location_or_meeting_link,
        notes: row.notes,
        status: row.status,
        adminApprovalStatus: row.admin_approval_status,
        adminApprovalBy: row.admin_approval_by,
        adminApprovalAt: row.admin_approval_at,
        rejectionReason: row.rejection_reason,
        appliedAt: row.created_at
    };
}

async function readWorkflowApplications({ id, jobId, studentId, status } = {}) {
    let applications = readData('applications.json');
    const workflowByApplication = await applicationWorkflowMap();

    if (hasSupabaseConfiguration()) {
        const client = getSupabase();
        const [{ data: databaseApplications, error: applicationsError }, { data: interviewRows, error: interviewsError }] = await Promise.all([
            client.from('applications')
                .select('id,student_id,job_id,portal_job_id,status,created_at'),
            client.from('placement_interviews').select('*')
        ]);
        if (applicationsError) throw applicationsError;
        if (interviewsError) throw interviewsError;

        const databaseJobIds = [...new Set(databaseApplications.map(application => application.job_id).filter(Boolean))];
        let databaseJobs = [];
        if (databaseJobIds.length > 0) {
            const { data, error } = await client
                .from('jobs')
                .select('id,portal_job_id,title,company,location')
                .in('id', databaseJobIds);
            if (error) throw error;
            databaseJobs = data;
        }
        const localJobs = readData('jobs.json');
        const portalJobIds = new Map(databaseJobs.map(databaseJob => {
            const matchingLocalJob = localJobs.find(job =>
                job.title.toLowerCase() === (databaseJob.title || '').toLowerCase()
                && job.company.toLowerCase() === (databaseJob.company || '').toLowerCase()
                && job.location.toLowerCase() === (databaseJob.location || '').toLowerCase()
            );
            return [databaseJob.id, databaseJob.portal_job_id || matchingLocalJob?.id];
        }));
        const databasePairs = new Set();
        const databaseRecords = databaseApplications
            .map(application => {
                const resolvedJobId = application.portal_job_id || portalJobIds.get(application.job_id);
                if (!resolvedJobId) return null;
                const job = localJobs.find(item => String(item.id) === String(resolvedJobId));
                const recruiter = job ? getRecruiterForJob(job) : null;
                const record = {
                    id: application.id,
                    jobId: resolvedJobId,
                    databaseJobId: application.job_id,
                    studentId: application.student_id,
                    recruiterId: job?.recruiterId || recruiter?.id || null,
                    recruiterEmail: job?.recruiterEmail || recruiter?.email || null,
                    appliedAt: application.created_at,
                    status: application.status,
                    adminApprovalStatus: 'Not Required'
                };
                databasePairs.add(`${record.studentId}:${record.jobId}`);
                return record;
            })
            .filter(Boolean);

        const byId = new Map(applications
            .filter(application => !databasePairs.has(`${application.studentId}:${application.jobId}`))
            .map(application => [application.id, application]));
        databaseRecords.forEach(application => byId.set(application.id, application));
        interviewRows.forEach(row => {
            const interview = workflowFromDatabaseRow(row);
            byId.set(interview.id, {
                ...byId.get(interview.id),
                ...interview
            });
        });
        applications = [...byId.values()].map(application => ({
            ...application,
            ...(workflowByApplication.get(String(application.id)) || {}),
            workflow: workflowByApplication.get(String(application.id)) || {}
        }));
    } else {
        applications = applications.map(application => ({
            ...application,
            ...(workflowByApplication.get(String(application.id)) || {}),
            workflow: workflowByApplication.get(String(application.id)) || {}
        }));
    }

    applications = applications.filter(application =>
        (!id || application.id === id)
        && (jobId === undefined || String(application.jobId) === String(jobId))
        && (!studentId || application.studentId === studentId)
        && (!status || getApplicationStatus(application) === status)
    );

    const missingStudentIds = [...new Set(applications
        .filter(application => !application.fullName && application.studentId)
        .map(application => application.studentId))];
    if (hasSupabaseConfiguration() && missingStudentIds.length > 0) {
        const { data, error } = await getSupabase()
            .from('students')
            .select('id,full_name,email,enrollment_no,course,spi_cgpi,semester,tenth_percentage,twelfth_percentage,skills,resume_url')
            .in('id', missingStudentIds);
        if (error) throw error;
        const studentsById = new Map(data.map(student => [student.id, student]));
        applications = await Promise.all(applications.map(async application => {
            const student = studentsById.get(application.studentId);
            return student ? {
                ...application,
                fullName: student.full_name,
                email: student.email,
                enrollment: student.enrollment_no,
                department: student.course,
                course: student.course,
                semester: student.semester,
                spiCgpi: student.spi_cgpi,
                tenthPercentage: student.tenth_percentage,
                twelfthPercentage: student.twelfth_percentage,
                skills: student.skills || [],
                resumeUrl: await getResultUrl(getSupabase(), student.resume_url)
            } : application;
        }));
    }

    return applications;
}

async function saveWorkflowApplications(applications, updatedApplication) {
    if (hasSupabaseConfiguration()) {
        await persistInterviewWorkflow(updatedApplication);
        const { error } = await writeApplicationWorkflow(
            updatedApplication,
            updatedApplication.workflow || {}
        );
        if (error) throw error;
        return true;
    }
    return writeData('applications.json', applications);
}

function getApplicationStatus(application) {
    if (application.workflow?.interviewCancelled) return application.workflowStatus || 'Shortlisted';
    if (application.workflow?.finalStatus) return application.workflow.finalStatus;
    if (['Pending Admin Approval', 'Interview Scheduled'].includes(application.status)) {
        return application.status;
    }
    if (application.workflowStatus) return application.workflowStatus;
    if (['Completed', 'Interview'].includes(application.status)) return application.status;
    const status = application.status || 'Applied';
    const normalizedStatus = String(status).toLowerCase();
    return {
        applied: 'Applied',
        shortlisted: 'Shortlisted',
        rejected: 'Rejected',
        selected: 'Selected'
    }[normalizedStatus] || status;
}

function readApplicationWorkflows() {
    return readData('recruiter-application-workflows.json');
}

function writeApplicationWorkflow(application, workflow) {
    if (hasSupabaseConfiguration()) {
        return getSupabase()
            .from('recruiter_application_workflows')
            .upsert({
                application_id: String(application.id),
                recruiter_id: String(application.recruiterId || ''),
                job_id: String(application.jobId),
                workflow,
                updated_at: new Date().toISOString()
            }, { onConflict: 'application_id' });
    }
    const workflows = readApplicationWorkflows();
    const index = workflows.findIndex(item => String(item.applicationId) === String(application.id));
    const record = {
        applicationId: String(application.id),
        recruiterId: application.recruiterId,
        jobId: String(application.jobId),
        workflow
    };
    if (index < 0) workflows.push(record);
    else workflows[index] = record;
    return writeData('recruiter-application-workflows.json', workflows)
        ? Promise.resolve({ error: null })
        : Promise.resolve({ error: new Error('Unable to save recruiter application workflow.') });
}

async function applicationWorkflowMap() {
    if (!hasSupabaseConfiguration()) {
        return new Map(readApplicationWorkflows().map(item => [String(item.applicationId), item.workflow || {}]));
    }
    const { data, error } = await getSupabase()
        .from('recruiter_application_workflows')
        .select('application_id,workflow');
    if (error) throw error;
    return new Map(data.map(item => [String(item.application_id), item.workflow || {}]));
}

async function saveApplicationStatus(application, workflowStatus, fields = {}) {
    const workflow = {
        ...(application.workflow || {}),
        ...fields,
        workflowStatus,
        updatedAt: new Date().toISOString()
    };
    if (hasSupabaseConfiguration()) {
        const databaseStatus = {
            Shortlisted: 'shortlisted',
            Selected: 'selected',
            Rejected: 'rejected'
        }[workflowStatus];
        if (databaseStatus) {
            const { error: statusError } = await getSupabase()
                .from('applications')
                .update({ status: databaseStatus })
                .eq('id', application.id);
            if (statusError) throw statusError;
        }
    }
    const { error } = await writeApplicationWorkflow(application, workflow);
    if (error) throw error;
    Object.assign(application, workflow);
}

async function getOrCreateDatabaseJob(job) {
    const { data, error } = await getSupabase()
        .from('jobs')
        .upsert({
            portal_job_id: String(job.id),
            title: job.title,
            company: job.company,
            location: job.location,
            salary: job.salary,
            job_type: job.jobType,
            description: job.description,
            approval_status: job.approvalStatus || null,
            approved_by: job.approvedBy || null,
            approved_at: job.approvedAt || null,
            rejection_reason: job.rejectionReason || null,
            admin_notes: job.adminNotes || null
        }, { onConflict: 'portal_job_id' })
        .select('id')
        .single();
    if (error) throw error;
    return data.id;
}

function isValidInterviewDateTime(date, time) {
    if (!isValidDeadline(date) || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        return false;
    }
    return new Date(`${date}T${time}:00`).getTime() > Date.now();
}

function meetsDriveEligibility(student, job) {
    const course = String(student.course || '').toLowerCase();
    const department = String(student.course || student.department || '').toLowerCase();
    const eligibleCourse = String(job.eligibleCourse || '').trim().toLowerCase();
    const eligibleDepartment = String(job.eligibleDepartment || '').trim().toLowerCase();
    if (eligibleCourse && eligibleCourse !== 'all' && !course.includes(eligibleCourse)) return false;
    if (eligibleDepartment && eligibleDepartment !== 'all' && !department.includes(eligibleDepartment)) return false;
    if (job.eligibleSemester && job.eligibleSemester !== 'All') {
        const semester = String(student.semester ?? '').toLowerCase();
        const allowedSemesters = String(job.eligibleSemester).split(/[,\s]+/).filter(Boolean).map(value => value.toLowerCase());
        if (!semester || !allowedSemesters.includes(semester)) return false;
    }
    if (Number(job.minimumSpiCgpa) > 0 && Number(student.spi_cgpi) < Number(job.minimumSpiCgpa)) return false;
    if (Number(job.minimumTenthPercentage) > 0
        && Number(student.tenth_percentage) < Number(job.minimumTenthPercentage)) return false;
    if (Number(job.minimumTwelfthPercentage) > 0
        && Number(student.twelfth_percentage) < Number(job.minimumTwelfthPercentage)) return false;
    const requiredSkills = Array.isArray(job.requiredSkills) ? job.requiredSkills : [];
    const skills = Array.isArray(student.skills) ? student.skills : [];
    return requiredSkills.every(skill => skills.some(candidate =>
        String(candidate).toLowerCase() === String(skill).toLowerCase()
    ));
}

const requireRecruiter = authenticateSession('recruiter');
const requireAdmin = authenticateSession('admin');

app.get('/api/recruiters/me/profile', requireRecruiter, async (req, res) => {
    try {
        const recruiter = readData('recruiters.json')
            .find(account => account.email.toLowerCase() === req.authenticatedUser.email.toLowerCase());
        if (!recruiter) return res.status(404).json({ error: 'Recruiter profile not found.' });
        res.json({
            profile: {
                ...publicRecruiter(recruiter, await companyLogoUrlFor(recruiter)),
                profilePhotoUrl: await recruiterPhotoUrlFor(recruiter)
            }
        });
    } catch (error) {
        logDatabaseError('recruiter profile listing', error);
        res.status(500).json({ error: 'Unable to load your recruiter and company profile.' });
    }
});

app.put('/api/recruiters/me/profile', requireRecruiter, async (req, res) => {
    const recruiters = readData('recruiters.json');
    const recruiter = recruiters.find(account =>
        account.email.toLowerCase() === req.authenticatedUser.email.toLowerCase()
    );
    if (!recruiter) return res.status(404).json({ error: 'Recruiter profile not found.' });

    const fields = [
        'fullName', 'designation', 'hrTalentAcquisition', 'shortBio', 'officialEmail', 'phone',
        'linkedInProfile', 'location', 'companyName', 'industry', 'companyType',
        'companySize', 'foundedYear', 'website', 'fullAddress', 'linkedInUrl', 'companyDescription'
    ];
    const profile = Object.fromEntries(fields.map(field => [
        field,
        typeof req.body[field] === 'string' ? req.body[field].trim() : ''
    ]));
    if (!validRecruiterProfile(profile)) {
        return res.status(400).json({
            error: 'Provide a recruiter name, designation, company name, valid official email, valid phone number, and valid profile URLs.'
        });
    }
    if (profile.shortBio.length > 500 || profile.fullAddress.length > 500
        || profile.companyDescription.length > 5000) {
        return res.status(400).json({
            error: 'Short bio and full address must be 500 characters or less; company description must be 5,000 characters or less.'
        });
    }
    if (profile.foundedYear && (!/^\d{4}$/.test(profile.foundedYear)
        || Number(profile.foundedYear) < 1800
        || Number(profile.foundedYear) > new Date().getFullYear())) {
        return res.status(400).json({ error: 'Founded year must be a valid year.' });
    }

    Object.assign(recruiter, profile);
    resetRecruiterVerificationForResubmission(recruiter);
    if (!writeData('recruiters.json', recruiters)) {
        return res.status(500).json({ error: 'Unable to save your profile. Please try again.' });
    }
    try {
        await syncRecruiterProfileToDatabase(recruiter);
        res.json({
            profile: {
                ...publicRecruiter(recruiter, await companyLogoUrlFor(recruiter)),
                profilePhotoUrl: await recruiterPhotoUrlFor(recruiter)
            }
        });
    } catch (error) {
        logDatabaseError('recruiter profile synchronization', error);
        res.status(500).json({ error: 'Profile was saved, but database synchronization failed.' });
    }
});

app.post('/api/recruiters/me/profile/photo', requireRecruiter, companyLogoUpload.single('profilePhoto'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, or WebP profile photo.' });
    if (!validImageContents(req.file)) return res.status(400).json({ error: 'The uploaded profile photo is not a valid image file.' });
    const recruiters = readData('recruiters.json');
    const recruiter = recruiters.find(account =>
        account.email.toLowerCase() === req.authenticatedUser.email.toLowerCase()
    );
    if (!recruiter) return res.status(404).json({ error: 'Recruiter profile not found.' });
    const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype];
    const fileName = `${crypto.randomUUID()}${extension}`;
    const storagePath = `recruiter-profiles/${fileName}`;
    try {
        if (hasSupabaseConfiguration()) {
            const { error } = await getSupabase().storage.from('results').upload(storagePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });
            if (error) throw error;
        } else {
            const directory = path.join(__dirname, 'uploads', 'recruiter-profiles');
            fs.mkdirSync(directory, { recursive: true });
            fs.writeFileSync(path.join(directory, fileName), req.file.buffer, { flag: 'wx' });
        }
        recruiter.profilePhotoPath = storagePath;
        resetRecruiterVerificationForResubmission(recruiter);
        if (!writeData('recruiters.json', recruiters)) {
            return res.status(500).json({ error: 'Photo was uploaded, but your profile could not be updated.' });
        }
        await syncRecruiterProfileToDatabase(recruiter);
        res.status(201).json({
            profile: {
                ...publicRecruiter(recruiter, await companyLogoUrlFor(recruiter)),
                profilePhotoUrl: await recruiterPhotoUrlFor(recruiter)
            }
        });
    } catch (error) {
        logDatabaseError('recruiter profile photo upload', error);
        res.status(500).json({ error: 'Unable to upload recruiter profile photo.' });
    }
});

app.post('/api/recruiters/me/profile/company-logo', requireRecruiter, companyLogoUpload.single('companyLogo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, or WebP company logo.' });
    if (!validImageContents(req.file)) return res.status(400).json({ error: 'The uploaded company logo is not a valid image file.' });
    const recruiters = readData('recruiters.json');
    const recruiter = recruiters.find(account =>
        account.email.toLowerCase() === req.authenticatedUser.email.toLowerCase()
    );
    if (!recruiter) return res.status(404).json({ error: 'Recruiter profile not found.' });

    const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype];
    const fileName = `${crypto.randomUUID()}${extension}`;
    const storagePath = `company-logos/${fileName}`;
    try {
        if (hasSupabaseConfiguration()) {
            const { error } = await getSupabase().storage.from('results').upload(storagePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });
            if (error) throw error;
        } else {
            const directory = path.join(__dirname, 'uploads', 'company-logos');
            fs.mkdirSync(directory, { recursive: true });
            fs.writeFileSync(path.join(directory, fileName), req.file.buffer, { flag: 'wx' });
        }
        recruiter.companyLogoPath = storagePath;
        resetRecruiterVerificationForResubmission(recruiter);
        if (!writeData('recruiters.json', recruiters)) {
            return res.status(500).json({ error: 'Logo was uploaded, but your profile could not be updated.' });
        }
        await syncRecruiterProfileToDatabase(recruiter);
        res.status(201).json({
            profile: publicRecruiter(recruiter, await companyLogoUrlFor(recruiter))
        });
    } catch (error) {
        logDatabaseError('company logo upload', error);
        res.status(500).json({ error: 'Unable to upload the company logo.' });
    }
});

app.get('/api/admin/recruiter-verifications', requireAdmin, async (req, res) => {
    const allowedStatuses = ['All', 'Pending', 'Approved', 'Rejected'];
    const status = req.query.status || 'All';
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid recruiter verification filter.' });
    }
    try {
        const recruiters = readData('recruiters.json')
            .filter(recruiter => status === 'All' || recruiterVerificationStatus(recruiter) === status)
            .sort((first, second) =>
                (second.verificationSubmittedAt || '').localeCompare(first.verificationSubmittedAt || '')
            );
        const requests = await Promise.all(recruiters.map(async recruiter => ({
            ...publicRecruiter(recruiter, await companyLogoUrlFor(recruiter)),
            profilePhotoUrl: await recruiterPhotoUrlFor(recruiter),
            submittedDate: recruiter.verificationSubmittedAt || recruiter.createdAt || null
        })));
        res.json({ requests });
    } catch (error) {
        logDatabaseError('admin recruiter verification listing', error);
        res.status(500).json({ error: 'Unable to load recruiter verification requests.' });
    }
});

app.patch('/api/admin/recruiter-verifications/:id', requireAdmin, async (req, res) => {
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Choose approve or reject.' });
    }
    if (action === 'reject' && (typeof reason !== 'string' || !reason.trim())) {
        return res.status(400).json({ error: 'A rejection reason is required.' });
    }
    const recruiters = readData('recruiters.json');
    const recruiter = recruiters.find(account => String(account.id) === req.params.id);
    if (!recruiter) return res.status(404).json({ error: 'Recruiter verification request not found.' });
    const decisionAt = new Date().toISOString();
    Object.assign(recruiter, {
        verificationStatus: action === 'approve' ? 'Approved' : 'Rejected',
        verified: action === 'approve',
        verifiedBy: action === 'approve' ? req.authenticatedUser.email : null,
        verifiedAt: action === 'approve' ? decisionAt : null,
        rejectedBy: action === 'reject' ? req.authenticatedUser.email : null,
        rejectedAt: action === 'reject' ? decisionAt : null,
        verificationRejectionReason: action === 'reject' ? reason.trim() : ''
    });
    if (!writeData('recruiters.json', recruiters)) {
        return res.status(500).json({ error: 'Unable to save the recruiter verification decision.' });
    }
    try {
        await syncRecruiterProfileToDatabase(recruiter);
        res.json({
            request: {
                ...publicRecruiter(recruiter, await companyLogoUrlFor(recruiter)),
                profilePhotoUrl: await recruiterPhotoUrlFor(recruiter),
                submittedDate: recruiter.verificationSubmittedAt || recruiter.createdAt || null
            }
        });
    } catch (error) {
        logDatabaseError('admin recruiter verification synchronization', error);
        res.status(500).json({ error: 'Verification was saved locally, but database synchronization failed.' });
    }
});

// Jobs Endpoints
app.get('/api/jobs', async (req, res) => {
    const jobs = readData('jobs.json');
    let visibleJobs = jobs.filter(job =>
        !job.driveStatus || (
            job.approvalStatus === 'Approved'
            && recruiterApprovedForJob(job)
            && isJobOpen(job)
        )
    );
    const accessToken = getBearerToken(req);
    if (accessToken) {
        try {
            const { data: authData, error: authError } = await getSupabaseAuthClient().auth.getUser(accessToken);
            if (!authError && authData.user) {
                const { data: student, error } = await getSupabase()
                    .from('students')
                    .select('course,spi_cgpi,semester,tenth_percentage,twelfth_percentage,skills')
                    .ilike('email', authData.user.email)
                    .maybeSingle();
                if (error) throw error;
                if (student) visibleJobs = visibleJobs.filter(job =>
                    !job.driveStatus || meetsDriveEligibility(student, job)
                );
            }
        } catch (error) {
            logDatabaseError('eligible campus drive listing', error);
            return res.status(500).json({ error: 'Unable to check campus drive eligibility.' });
        }
    }
    res.json(visibleJobs.map(job => {
        const publicJob = { ...job };
        delete publicJob.recruiterEmail;
        delete publicJob.recruiterId;
        return publicJob;
    }));
});

app.post('/api/jobs', requireAdmin, (req, res) => {
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

app.put('/api/jobs/:id', requireAdmin, (req, res) => {
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

app.delete('/api/jobs/:id', requireAdmin, async (req, res) => {
    const jobs = readData('jobs.json');
    const id = parseInt(req.params.id);

    const filteredJobs = jobs.filter(j => j.id !== id);
    if (jobs.length === filteredJobs.length) {
        return res.status(404).json({ error: "Job not found" });
    }

    if (!writeData('jobs.json', filteredJobs)) {
        return res.status(500).json({ error: "Unable to delete job" });
    }
    try {
        if (hasSupabaseConfiguration()) {
            const { error } = await getSupabase()
                .from('placement_interviews')
                .delete()
                .eq('job_id', String(id));
            if (error) throw error;
            const { error: applicationsError } = await getSupabase()
                .from('applications')
                .delete()
                .eq('portal_job_id', String(id));
            if (applicationsError) throw applicationsError;
            const { error: databaseJobError } = await getSupabase()
                .from('jobs')
                .delete()
                .eq('portal_job_id', String(id));
            if (databaseJobError) throw databaseJobError;
        } else {
            const applications = readData('applications.json').filter(application => Number(application.jobId) !== id);
            if (!writeData('applications.json', applications)) {
                return res.status(500).json({ error: 'Job deleted, but its applications could not be removed.' });
            }
        }
    } catch (error) {
        logDatabaseError('placement application cleanup', error);
        return res.status(500).json({ error: 'Job deleted, but its application records could not be removed.' });
    }
    res.json({ message: "Job deleted successfully" });
});

app.get('/api/recruiters/me/placements', requireRecruiter, async (req, res) => {
    const jobs = readData('jobs.json');
    const ownJobs = jobs.filter(job => recruiterOwnsJob(req.authenticatedUser, job));
    let changedOwnership = false;
    ownJobs.forEach(job => {
        if (!job.recruiterId) {
            job.recruiterId = req.authenticatedUser.id;
            job.recruiterEmail = req.authenticatedUser.email;
            changedOwnership = true;
        }
    });
    if (changedOwnership && !writeData('jobs.json', jobs)) {
        return res.status(500).json({ error: 'Unable to update placement ownership.' });
    }

    try {
        const placements = await Promise.all(ownJobs.map(async job => ({
            ...job,
            applicantsCount: (await readWorkflowApplications({ jobId: job.id })).length,
            status: job.approvalStatus && job.approvalStatus !== 'Approved'
                ? job.approvalStatus
                : job.driveStatus === 'Completed' ? 'Completed' : isJobOpen(job) ? 'Open' : 'Closed'
        })));
        res.json({ placements });
    } catch (error) {
        logDatabaseError('recruiter placement listing', error);
        res.status(500).json({ error: 'Unable to load your placements.' });
    }
});

app.post('/api/recruiters/me/placements', requireRecruiter, async (req, res) => {
    if (!recruiterCanCreateDrives(req.authenticatedUser)) {
        return res.status(403).json({
            error: 'Your company profile must be approved by the Placement Cell before you can create a campus drive.',
            verificationStatus: recruiterVerificationStatus(req.authenticatedUser)
        });
    }
    const { title, location, salary, jobType, description, deadline } = req.body;
    if (![title, location, salary, jobType, description].every(value => typeof value === 'string' && value.trim())
        || !isValidDeadline(deadline)) {
        return res.status(400).json({ error: 'Complete every field and provide a valid application deadline.' });
    }

    const jobs = readData('jobs.json');
    const driveStatus = ['Open', 'Closed', 'Completed'].includes(req.body.driveStatus)
        ? req.body.driveStatus
        : 'Open';
    const newJob = {
        id: jobs.reduce((maxId, job) => Math.max(maxId, Number(job.id) || 0), 0) + 1,
        title: title.trim(),
        company: req.authenticatedUser.companyName,
        recruiterId: req.authenticatedUser.id,
        recruiterEmail: req.authenticatedUser.email,
        location: location.trim(),
        salary: salary.trim(),
        jobType: jobType.trim(),
        description: description.trim(),
        deadline,
        driveId: req.body.driveId?.trim() || `CD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        eligibleCourse: req.body.eligibleCourse?.trim() || '',
        eligibleDepartment: req.body.eligibleDepartment?.trim() || '',
        eligibleSemester: req.body.eligibleSemester?.trim() || '',
        minimumSpiCgpa: req.body.minimumSpiCgpa === '' ? '' : Number(req.body.minimumSpiCgpa) || 0,
        minimumTenthPercentage: req.body.minimumTenthPercentage === '' ? '' : Number(req.body.minimumTenthPercentage) || 0,
        minimumTwelfthPercentage: req.body.minimumTwelfthPercentage === '' ? '' : Number(req.body.minimumTwelfthPercentage) || 0,
        backlogAllowed: req.body.backlogAllowed === 'Yes' || req.body.backlogAllowed === true,
        requiredSkills: Array.isArray(req.body.requiredSkills)
            ? req.body.requiredSkills
            : String(req.body.requiredSkills || '').split(',').map(skill => skill.trim()).filter(Boolean),
        applicationStartDate: req.body.applicationStartDate || '',
        vacancies: Math.max(0, Number(req.body.vacancies) || 0),
        selectionProcess: req.body.selectionProcess?.trim() || '',
        driveStatus,
        approvalStatus: 'Pending Admin Approval',
        approvedBy: null,
        approvedAt: null,
        rejectionReason: '',
        adminNotes: '',
        createdAt: new Date().toISOString(),
        applicationsEnabled: driveStatus === 'Open'
    };
    jobs.unshift(newJob);
    if (!writeData('jobs.json', jobs)) {
        return res.status(500).json({ error: 'Unable to save the placement. Please try again.' });
    }
    if (hasSupabaseConfiguration()) {
        try {
            await getOrCreateDatabaseJob(newJob);
        } catch (error) {
            logDatabaseError('campus drive database sync', error);
            return res.status(500).json({ error: 'Campus drive was saved locally, but database synchronization failed.' });
        }
    }
    res.status(201).json({ job: { ...newJob, applicantsCount: 0, status: newJob.approvalStatus } });
});

app.put('/api/recruiters/me/placements/:id', requireRecruiter, async (req, res) => {
    const jobs = readData('jobs.json');
    const job = jobs.find(item => String(item.id) === req.params.id);
    if (!job || !recruiterOwnsJob(req.authenticatedUser, job)) {
        return res.status(404).json({ error: 'Placement not found.' });
    }
    const requestedDriveStatus = ['Open', 'Closed', 'Completed'].includes(req.body.driveStatus)
        ? req.body.driveStatus
        : (job.driveStatus || 'Open');
    if (requestedDriveStatus === 'Open' && !recruiterCanCreateDrives(req.authenticatedUser)) {
        return res.status(403).json({
            error: 'Your company profile must be approved by the Placement Cell before you can create a campus drive.',
            verificationStatus: recruiterVerificationStatus(req.authenticatedUser)
        });
    }

    const { title, location, salary, jobType, description, deadline } = req.body;
    if (![title, location, salary, jobType, description].every(value => typeof value === 'string' && value.trim())
        || !isValidDeadline(deadline)) {
        return res.status(400).json({ error: 'Complete every field and provide a valid application deadline.' });
    }

    const wasChangesRequested = job.approvalStatus === 'Changes Requested';
    Object.assign(job, {
        title: title.trim(),
        location: location.trim(),
        salary: salary.trim(),
        jobType: jobType.trim(),
        description: description.trim(),
        deadline,
        driveId: req.body.driveId?.trim() || job.driveId || `CD-${new Date().getFullYear()}-${String(job.id).padStart(4, '0')}`,
        eligibleCourse: req.body.eligibleCourse?.trim() ?? job.eligibleCourse ?? '',
        eligibleDepartment: req.body.eligibleDepartment?.trim() ?? job.eligibleDepartment ?? '',
        eligibleSemester: req.body.eligibleSemester?.trim() ?? job.eligibleSemester ?? '',
        minimumSpiCgpa: req.body.minimumSpiCgpa === '' ? '' : Number(req.body.minimumSpiCgpa) || 0,
        minimumTenthPercentage: req.body.minimumTenthPercentage === '' ? '' : Number(req.body.minimumTenthPercentage) || 0,
        minimumTwelfthPercentage: req.body.minimumTwelfthPercentage === '' ? '' : Number(req.body.minimumTwelfthPercentage) || 0,
        backlogAllowed: req.body.backlogAllowed === 'Yes' || req.body.backlogAllowed === true,
        requiredSkills: Array.isArray(req.body.requiredSkills)
            ? req.body.requiredSkills
            : String(req.body.requiredSkills || '').split(',').map(skill => skill.trim()).filter(Boolean),
        applicationStartDate: req.body.applicationStartDate || '',
        vacancies: Math.max(0, Number(req.body.vacancies) || 0),
        selectionProcess: req.body.selectionProcess?.trim() || '',
        driveStatus: ['Open', 'Closed', 'Completed'].includes(req.body.driveStatus)
            ? req.body.driveStatus
            : (job.driveStatus || 'Open'),
        recruiterId: req.authenticatedUser.id,
        recruiterEmail: req.authenticatedUser.email
    });
    if (wasChangesRequested && req.body.resubmitForApproval === true) {
        Object.assign(job, {
            approvalStatus: 'Pending Admin Approval',
            approvedBy: null,
            approvedAt: null,
            rejectionReason: '',
            adminNotes: ''
        });
    }
    job.applicationsEnabled = job.driveStatus === 'Open';
    if (!writeData('jobs.json', jobs)) {
        return res.status(500).json({ error: 'Unable to update the placement. Please try again.' });
    }
    try {
        const applicantsCount = (await readWorkflowApplications({ jobId: job.id })).length;
        res.json({ job: { ...job, applicantsCount, status: job.approvalStatus || (isJobOpen(job) ? 'Open' : (job.driveStatus || 'Closed')) } });
    } catch (error) {
        logDatabaseError('recruiter placement update count', error);
        res.status(500).json({ error: 'Placement was updated, but applicant totals could not be loaded.' });
    }
});

app.get('/api/admin/campus-drive-approvals', requireAdmin, (req, res) => {
    const statusFilter = req.query.status;
    const allowedStatuses = ['Pending Admin Approval', 'Approved', 'Rejected', 'Changes Requested'];
    if (statusFilter && !allowedStatuses.includes(statusFilter)) {
        return res.status(400).json({ error: 'Invalid campus drive approval filter.' });
    }
    const recruiters = new Map(readData('recruiters.json').map(recruiter => [
        String(recruiter.id),
        recruiter
    ]));
    const drives = readData('jobs.json')
        .filter(job => job.driveStatus && (job.approvalStatus || 'Approved') !== 'Legacy')
        .filter(job => !statusFilter || (job.approvalStatus || 'Approved') === statusFilter)
        .map(job => {
            const recruiter = recruiters.get(String(job.recruiterId))
                || readData('recruiters.json').find(account =>
                    account.email?.toLowerCase() === job.recruiterEmail?.toLowerCase()
                );
            return {
                ...job,
                approvalStatus: job.approvalStatus || 'Approved',
                recruiterName: recruiter?.fullName || 'Recruiter',
                recruiterEmail: recruiter?.email || job.recruiterEmail || ''
            };
        });
    res.json({ drives });
});

app.patch('/api/admin/campus-drive-approvals/:id', requireAdmin, async (req, res) => {
    const { action, reason, adminNotes } = req.body;
    const approvalUpdates = {
        approve: { approvalStatus: 'Approved' },
        reject: { approvalStatus: 'Rejected' },
        requestChanges: { approvalStatus: 'Changes Requested' }
    };
    if (!approvalUpdates[action]) {
        return res.status(400).json({ error: 'Choose approve, reject, or requestChanges.' });
    }
    if (action === 'reject' && (typeof reason !== 'string' || !reason.trim())) {
        return res.status(400).json({ error: 'A rejection reason is required.' });
    }
    if (action === 'requestChanges' && (typeof adminNotes !== 'string' || !adminNotes.trim())) {
        return res.status(400).json({ error: 'Admin notes are required when requesting changes.' });
    }

    const jobs = readData('jobs.json');
    const drive = jobs.find(job => String(job.id) === req.params.id && job.driveStatus);
    if (!drive) return res.status(404).json({ error: 'Campus drive not found.' });
    const now = new Date().toISOString();
    Object.assign(drive, approvalUpdates[action], {
        approvedBy: action === 'approve' ? req.authenticatedUser.email : null,
        approvedAt: action === 'approve' ? now : null,
        rejectionReason: action === 'reject' ? reason.trim() : '',
        adminNotes: action === 'requestChanges' ? adminNotes.trim() : ''
    });
    if (!writeData('jobs.json', jobs)) {
        return res.status(500).json({ error: 'Unable to save the campus drive approval decision.' });
    }
    if (hasSupabaseConfiguration()) {
        try {
            const { error } = await getSupabase()
                .from('jobs')
                .update({
                    approval_status: drive.approvalStatus,
                    approved_by: drive.approvedBy,
                    approved_at: drive.approvedAt,
                    rejection_reason: drive.rejectionReason,
                    admin_notes: drive.adminNotes
                })
                .eq('portal_job_id', String(drive.id));
            if (error) throw error;
        } catch (error) {
            logDatabaseError('campus drive approval persistence', error);
            return res.status(500).json({ error: 'Approval was saved locally, but database synchronization failed.' });
        }
    }
    res.json({
        drive: {
            ...drive,
            recruiterName: req.authenticatedUser.fullName,
            recruiterEmail: drive.recruiterEmail
        }
    });
});

app.delete('/api/recruiters/me/placements/:id', requireRecruiter, async (req, res) => {
    const jobs = readData('jobs.json');
    const job = jobs.find(item => String(item.id) === req.params.id);
    if (!job || !recruiterOwnsJob(req.authenticatedUser, job)) {
        return res.status(404).json({ error: 'Placement not found.' });
    }

    if (!writeData('jobs.json', jobs.filter(item => String(item.id) !== req.params.id))) {
        return res.status(500).json({ error: 'Unable to delete the placement. Please try again.' });
    }
    try {
        if (hasSupabaseConfiguration()) {
            const { error } = await getSupabase()
                .from('placement_interviews')
                .delete()
                .eq('job_id', req.params.id);
            if (error) throw error;
            const { error: applicationsError } = await getSupabase()
                .from('applications')
                .delete()
                .eq('portal_job_id', req.params.id);
            if (applicationsError) throw applicationsError;
            const { error: databaseJobError } = await getSupabase()
                .from('jobs')
                .delete()
                .eq('portal_job_id', req.params.id);
            if (databaseJobError) throw databaseJobError;
        } else {
            const applications = readData('applications.json')
                .filter(application => String(application.jobId) !== req.params.id);
            if (!writeData('applications.json', applications)) {
                return res.status(500).json({ error: 'Placement deleted, but its application records could not be removed.' });
            }
        }
    } catch (error) {
        logDatabaseError('placement application cleanup', error);
        return res.status(500).json({ error: 'Placement deleted, but its application records could not be removed.' });
    }
    res.json({ message: 'Placement deleted successfully.' });
});

app.get('/api/recruiters/me/placements/:id/applicants', requireRecruiter, async (req, res) => {
    const job = readData('jobs.json').find(item => String(item.id) === req.params.id);
    if (!job || !recruiterOwnsJob(req.authenticatedUser, job)) {
        return res.status(404).json({ error: 'Placement not found.' });
    }

    try {
        const applicants = await readWorkflowApplications({ jobId: req.params.id });
        const applicantsWithOffers = await Promise.all(applicants.map(async application => {
            let offerLetterUrl = application.offerLetterUrl || null;
            if (application.workflow?.offerLetter?.fileName) {
                offerLetterUrl = `/uploads/offer-letters/${encodeURIComponent(application.workflow.offerLetter.fileName)}`;
            }
            return ({
            ...application,
            status: getApplicationStatus(application),
            eligibility: application.eligibility || 'Eligible',
            offerLetterUrl,
            canComplete: getApplicationStatus(application) === 'Interview Scheduled'
                && new Date(`${application.proposedDate}T${application.proposedTime}:00`).getTime() <= Date.now()
            });
        }));
        res.json({ applicants: applicantsWithOffers });
    } catch (error) {
        logDatabaseError('recruiter applicant listing', error);
        res.status(500).json({ error: 'Unable to load applicants.' });
    }
});

app.patch('/api/recruiters/me/applications/:applicationId/status', requireRecruiter, async (req, res) => {
    let application;
    try {
        application = (await readWorkflowApplications()).find(item => String(item.id) === req.params.applicationId);
    } catch (error) {
        logDatabaseError('recruiter application status lookup', error);
        return res.status(500).json({ error: 'Unable to load this student application.' });
    }
    if (!application || String(application.recruiterId) !== String(req.authenticatedUser.id)) {
        return res.status(404).json({ error: 'Student application not found.' });
    }

    const { status, finalStatus, package: packageAmount, joiningDate, remarks } = req.body;
    const validStatuses = ['Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Selected', 'Waitlisted'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Choose a valid placement application status.' });
    }
    if (['Selected', 'Waitlisted'].includes(status)
        && !['Completed', 'Interview Completed', 'Selected', 'Waitlisted'].includes(getApplicationStatus(application))) {
        return res.status(409).json({ error: 'Complete the interview before recording a final selection result.' });
    }
    if (['Selected', 'Waitlisted'].includes(status)
        && (typeof packageAmount !== 'string' || !packageAmount.trim()
            || !isValidDeadline(joiningDate))) {
        return res.status(400).json({ error: 'A package and valid joining date are required for selected or waitlisted students.' });
    }
    const workflow = {
        ...(application.workflow || {}),
        finalStatus: finalStatus || (['Selected', 'Rejected', 'Waitlisted'].includes(status) ? status : null),
        package: typeof packageAmount === 'string' ? packageAmount.trim() : application.workflow?.package || '',
        joiningDate: joiningDate || application.workflow?.joiningDate || '',
        remarks: typeof remarks === 'string' ? remarks.trim() : application.workflow?.remarks || '',
        interviewCancelled: false
    };
    try {
        await saveApplicationStatus(application, status, workflow);
        return res.json({ application: { ...application, ...workflow, status: getApplicationStatus(application) } });
    } catch (error) {
        logDatabaseError('recruiter application status update', error);
        res.status(500).json({ error: 'Unable to save the application status.' });
    }
});

app.post('/api/recruiters/me/applications/:applicationId/offer-letter', requireRecruiter, resultUpload.single('offerLetter'), async (req, res) => {
    if (!req.file || req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Upload an offer letter as a PDF file.' });
    }
    let application;
    try {
        application = (await readWorkflowApplications()).find(item => String(item.id) === req.params.applicationId);
    } catch (error) {
        logDatabaseError('offer letter application lookup', error);
        return res.status(500).json({ error: 'Unable to load the selected student application.' });
    }
    if (!application || String(application.recruiterId) !== String(req.authenticatedUser.id)) {
        return res.status(404).json({ error: 'Student application not found.' });
    }
    if (!['Selected', 'Waitlisted'].includes(application.workflow?.finalStatus || getApplicationStatus(application))) {
        return res.status(409).json({ error: 'Offer letters can only be uploaded for selected students.' });
    }

    const fileName = `${crypto.randomUUID()}.pdf`;
    const directory = path.join(__dirname, 'uploads', 'offer-letters');
    try {
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, fileName), req.file.buffer, { flag: 'wx' });
        const workflow = {
            ...(application.workflow || {}),
            offerLetter: {
                fileName,
                originalName: path.basename(req.file.originalname),
                uploadedAt: new Date().toISOString(),
                status: 'Uploaded'
            }
        };
        const { error } = await writeApplicationWorkflow(application, workflow);
        if (error) throw error;
        return res.status(201).json({
            offerLetter: {
                ...workflow.offerLetter,
                url: `/uploads/offer-letters/${encodeURIComponent(fileName)}`
            }
        });
    } catch (error) {
        logDatabaseError('offer letter upload', error);
        return res.status(500).json({ error: 'Unable to save the offer letter.' });
    }
});

app.post('/api/recruiters/me/applications/:applicationId/interview', requireRecruiter, async (req, res) => {
    let applications;
    let application;
    try {
        applications = await readWorkflowApplications();
        application = applications.find(item => item.id === req.params.applicationId);
    } catch (error) {
        logDatabaseError('recruiter application lookup', error);
        return res.status(500).json({ error: 'Unable to load this application.' });
    }
    if (!application || application.recruiterId !== req.authenticatedUser.id) {
        return res.status(404).json({ error: 'Application not found.' });
    }
    if (!['Applied', 'Under Review', 'Shortlisted', 'Interview', 'Interview Scheduled'].includes(getApplicationStatus(application))) {
        return res.status(409).json({ error: 'This application is not eligible for a new interview proposal.' });
    }

    const { interviewDate, interviewTime, interviewType, locationOrMeetingLink, notes, interviewRound, interviewer } = req.body;
    if (!isValidInterviewDateTime(interviewDate, interviewTime)
        || !['Online', 'In-person', 'Phone'].includes(interviewType)
        || typeof locationOrMeetingLink !== 'string'
        || !locationOrMeetingLink.trim()
        || typeof notes !== 'string') {
        return res.status(400).json({ error: 'Provide a future date and time, interview type, location or meeting link, and valid notes.' });
    }

    Object.assign(application, {
        proposedDate: interviewDate,
        proposedTime: interviewTime,
        interviewType,
        locationOrMeetingLink: locationOrMeetingLink.trim(),
        notes: notes.trim(),
        status: 'Pending Admin Approval',
        adminApprovalStatus: 'Pending',
        adminApprovalBy: null,
        adminApprovalAt: null,
        rejectionReason: null
    });
    application.workflow = {
        ...(application.workflow || {}),
        interviewRound: typeof interviewRound === 'string' ? interviewRound.trim() : '',
        interviewer: typeof interviewer === 'string' ? interviewer.trim() : '',
        interviewCancelled: false,
        workflowStatus: 'Interview'
    };

    try {
        if (!await saveWorkflowApplications(applications, application)) {
            return res.status(500).json({ error: 'Unable to save the interview proposal.' });
        }
        res.status(200).json({ application });
    } catch (error) {
        logDatabaseError('interview proposal persistence', error);
        res.status(500).json({ error: 'Unable to save the interview proposal. Verify the placement_interviews migration is applied.' });
    }
});

app.patch('/api/recruiters/me/applications/:applicationId/interview/complete', requireRecruiter, async (req, res) => {
    let applications;
    let application;
    try {
        applications = await readWorkflowApplications();
        application = applications.find(item => item.id === req.params.applicationId);
    } catch (error) {
        logDatabaseError('recruiter application lookup', error);
        return res.status(500).json({ error: 'Unable to load this application.' });
    }
    if (!application || application.recruiterId !== req.authenticatedUser.id) {
        return res.status(404).json({ error: 'Application not found.' });
    }
    if (getApplicationStatus(application) !== 'Interview Scheduled'
        || new Date(`${application.proposedDate}T${application.proposedTime}:00`).getTime() > Date.now()) {
        return res.status(409).json({ error: 'Only an approved interview that has already started can be marked completed.' });
    }

    application.status = 'Completed';
    application.completedAt = new Date().toISOString();
    application.workflow = { ...(application.workflow || {}), workflowStatus: 'Interview Completed' };
    try {
        if (!await saveWorkflowApplications(applications, application)) {
            return res.status(500).json({ error: 'Unable to update the interview status.' });
        }
        return res.json({ application });
    } catch (error) {
        logDatabaseError('interview completion persistence', error);
        return res.status(500).json({ error: 'Unable to update the interview status.' });
    }
});

app.get('/api/admin/interview-approvals', requireAdmin, async (req, res) => {
    const jobsById = new Map(readData('jobs.json').map(job => [String(job.id), job]));
    const recruitersById = new Map(readData('recruiters.json').map(recruiter => [recruiter.id, recruiter]));
    try {
        const approvals = await readWorkflowApplications({ status: 'Pending Admin Approval' });
        res.json({ approvals: approvals
        .map(application => ({
            ...application,
            jobTitle: jobsById.get(String(application.jobId))?.title || 'Placement no longer available',
            company: jobsById.get(String(application.jobId))?.company || 'Unknown company',
            recruiterName: recruitersById.get(application.recruiterId)?.fullName || 'Recruiter',
            recruiterEmail: application.recruiterEmail
                || recruitersById.get(application.recruiterId)?.email
        })) });
    } catch (error) {
        logDatabaseError('admin interview approval listing', error);
        res.status(500).json({ error: 'Unable to load interview approvals.' });
    }
});

app.patch('/api/admin/interview-approvals/:applicationId', requireAdmin, async (req, res) => {
    let applications;
    let application;
    try {
        applications = await readWorkflowApplications();
        application = applications.find(item => item.id === req.params.applicationId);
    } catch (error) {
        logDatabaseError('admin interview application lookup', error);
        return res.status(500).json({ error: 'Unable to load the interview approval.' });
    }
    if (!application || getApplicationStatus(application) !== 'Pending Admin Approval') {
        return res.status(404).json({ error: 'Pending interview approval not found.' });
    }

    if (req.body.action === 'approve') {
        Object.assign(application, {
            status: 'Interview Scheduled',
            adminApprovalStatus: 'Approved',
            adminApprovalBy: req.authenticatedUser.email,
            adminApprovalAt: new Date().toISOString(),
            rejectionReason: null
        });
    } else if (req.body.action === 'request-change') {
        if (typeof req.body.reason !== 'string' || !req.body.reason.trim()) {
            return res.status(400).json({ error: 'A reason is required when rejecting or requesting an interview change.' });
        }
        Object.assign(application, {
            status: 'Rejected',
            adminApprovalStatus: 'Rejected / Change Requested',
            adminApprovalBy: req.authenticatedUser.email,
            adminApprovalAt: new Date().toISOString(),
            rejectionReason: req.body.reason.trim()
        });
    } else {
        return res.status(400).json({ error: 'Choose approve or request-change.' });
    }

    try {
        if (!await saveWorkflowApplications(applications, application)) {
            return res.status(500).json({ error: 'Unable to save the interview decision.' });
        }
        res.json({ application });
    } catch (error) {
        logDatabaseError('interview approval persistence', error);
        res.status(500).json({ error: 'Unable to save the interview decision. Verify the placement_interviews migration is applied.' });
    }
});

app.post('/api/applications', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: 'Please log in as a student before applying.' });
    }

    const jobId = Number(req.body.jobId);
    if (!Number.isInteger(jobId)) {
        return res.status(400).json({ error: 'A valid placement is required.' });
    }

    const job = readData('jobs.json').find(item => Number(item.id) === jobId);
    if (!job) return res.status(404).json({ error: 'Placement not found.' });
    if (job.driveStatus && job.approvalStatus !== 'Approved') {
        return res.status(403).json({ error: 'This campus drive is not approved for student applications.' });
    }
    if (job.driveStatus && !recruiterApprovedForJob(job)) {
        return res.status(403).json({ error: 'The recruiter company verification is not approved for this campus drive.' });
    }
    if (!isJobOpen(job)) return res.status(400).json({ error: 'This placement is closed for applications.' });

    try {
        const recruiter = getRecruiterForJob(job);
        const authClient = getSupabaseAuthClient();
        const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
        if (authError || !authData.user) {
            return res.status(401).json({ error: 'Your student session is invalid. Please log in again.' });
        }

        const client = getSupabase();
        const { data: student, error: studentError } = await client
            .from('students')
            .select('id,full_name,email,enrollment_no,course,spi_cgpi,semester,tenth_percentage,twelfth_percentage,skills')
            .ilike('email', authData.user.email)
            .maybeSingle();
        if (studentError) throw studentError;
        if (!student) return res.status(403).json({ error: 'A registered student profile is required to apply.' });
        if (!meetsDriveEligibility(student, job)) {
            return res.status(403).json({ error: 'Your academic profile does not meet this campus drive eligibility criteria.' });
        }

        if (hasSupabaseConfiguration()) {
            const client = getSupabase();
            const databaseJobId = await getOrCreateDatabaseJob(job);
            const { data: existingApplication, error: duplicateError } = await client
                .from('applications')
                .select('id')
                .eq('student_id', student.id)
                .eq('job_id', databaseJobId)
                .maybeSingle();
            if (duplicateError) throw duplicateError;
            if (existingApplication) {
                return res.status(409).json({ error: 'You have already applied for this placement.' });
            }

            const { error: insertError } = await client
                .from('applications')
                .insert({
                    student_id: student.id,
                    job_id: databaseJobId,
                    portal_job_id: String(job.id),
                    status: 'applied'
                });
            if (insertError) {
                if (insertError.code === '23505') {
                    return res.status(409).json({ error: 'You have already applied for this placement.' });
                }
                throw insertError;
            }
        } else {
            const applications = await readWorkflowApplications();
            if (applications.some(application => Number(application.jobId) === jobId && application.studentId === student.id)) {
                return res.status(409).json({ error: 'You have already applied for this placement.' });
            }

            const application = {
                id: crypto.randomUUID(),
                jobId,
                studentId: student.id,
                recruiterId: job.recruiterId || recruiter?.id || null,
                recruiterEmail: job.recruiterEmail || recruiter?.email || null,
                fullName: student.full_name,
                email: student.email,
                enrollment: student.enrollment_no,
                department: student.course,
                course: student.course,
                semester: student.semester,
                spiCgpi: student.spi_cgpi,
                tenthPercentage: student.tenth_percentage,
                twelfthPercentage: student.twelfth_percentage,
                skills: student.skills || [],
                appliedAt: new Date().toISOString(),
                status: 'Applied',
                adminApprovalStatus: 'Not Required',
                proposedDate: null,
                proposedTime: null,
                interviewType: null,
                locationOrMeetingLink: null,
                notes: null,
                adminApprovalBy: null,
                adminApprovalAt: null,
                rejectionReason: null
            };
            applications.push(application);
            if (!writeData('applications.json', applications)) {
                return res.status(500).json({ error: 'Unable to save your application. Please try again.' });
            }
        }

        res.status(201).json({ message: 'Application submitted successfully.' });
    } catch (error) {
        logDatabaseError('student job application', error);
        if (['42703', 'PGRST204'].includes(error.code)
            && /tenth_percentage|twelfth_percentage|skills|semester/i.test(error.message || '')) {
            return res.status(503).json({ error: 'Apply the campus placement workflow migration before accepting applications.' });
        }
        res.status(500).json({ error: 'Unable to submit your application.' });
    }
});

app.get('/api/students/me/applications', async (req, res) => {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: 'Please log in as a student to view your applications.' });
    }

    try {
        const authClient = getSupabaseAuthClient();
        const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
        if (authError || !authData.user) {
            return res.status(401).json({ error: 'Your student session is invalid. Please log in again.' });
        }

        const client = getSupabase();
        const { data: student, error: studentError } = await client
            .from('students')
            .select('id')
            .ilike('email', authData.user.email)
            .maybeSingle();
        if (studentError) throw studentError;
        if (!student) return res.status(403).json({ error: 'A registered student profile is required.' });

        const jobsById = new Map(readData('jobs.json').map(job => [Number(job.id), job]));
        const storedApplications = await readWorkflowApplications({ studentId: student.id });
        const applications = storedApplications.map(application => {
                const job = jobsById.get(Number(application.jobId));
                if (!job) return null;
                const interviewApproved = application.adminApprovalStatus === 'Approved';
                return {
                    ...job,
                    applicationId: application.id,
                    appliedAt: application.appliedAt,
                    status: getApplicationStatus(application),
                    rejectionReason: application.rejectionReason || null,
                    interview: interviewApproved ? {
                        date: application.proposedDate,
                        time: application.proposedTime,
                        type: application.interviewType,
                        locationOrMeetingLink: application.locationOrMeetingLink,
                        notes: application.notes,
                        status: application.status
                    } : null
                };
            }).filter(Boolean);
        res.json({ applications });
    } catch (error) {
        logDatabaseError('student application listing', error);
        res.status(500).json({ error: 'Unable to load your applications.' });
    }
});

app.post('/api/recruiters/logout', requireRecruiter, (req, res) => {
    const sessions = readData('recruiter-sessions.json')
        .filter(session => session.tokenHash !== req.sessionTokenHash);
    if (!writeData('recruiter-sessions.json', sessions)) {
        return res.status(500).json({ error: 'Unable to end recruiter session.' });
    }
    res.json({ message: 'Logged out successfully.' });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
    const sessions = readData('recruiter-sessions.json')
        .filter(session => session.tokenHash !== req.sessionTokenHash);
    if (!writeData('recruiter-sessions.json', sessions)) {
        return res.status(500).json({ error: 'Unable to end admin session.' });
    }
    res.json({ message: 'Logged out successfully.' });
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
                sessionToken: authData.session.access_token,
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

    const normalizedEmail = email.trim().toLowerCase();
    const newRecruiter = {
        id: crypto.randomUUID(),
        fullName: fullName.trim(),
        companyName: companyName.trim(),
        email: normalizedEmail,
        officialEmail: normalizedEmail,
        password,
        verificationStatus: 'Pending',
        verified: false,
        verificationSubmittedAt: new Date().toISOString(),
        verifiedBy: null,
        verifiedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        verificationRejectionReason: '',
        createdAt: new Date().toISOString()
    };
    recruiters.push(newRecruiter);
    if (!writeData('recruiters.json', recruiters)) {
        return res.status(500).json({ error: 'Unable to register recruiter. Please try again.' });
    }

    res.status(201).json({
        message: "Recruiter registered successfully",
        recruiter: {
            id: newRecruiter.id,
            fullName: newRecruiter.fullName,
            companyName: newRecruiter.companyName,
            email: normalizedEmail
        }
    });
});

app.post('/api/recruiters/login', (req, res) => {
    const recruiters = readData('recruiters.json');
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    const recruiter = recruiters.find(r => r.email.toLowerCase() === email.trim().toLowerCase() && r.password === password);
    if (!recruiter) {
        return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!recruiter.id) {
        recruiter.id = crypto.randomUUID();
        if (!writeData('recruiters.json', recruiters)) {
            return res.status(500).json({ error: 'Unable to save recruiter identity. Please try again.' });
        }
    }

    const sessionToken = createSession('recruiter', recruiter.email);
    if (!sessionToken) {
        return res.status(500).json({ error: 'Unable to start recruiter session. Please try again.' });
    }

    res.json({
        message: "Login successful",
        sessionToken,
        user: {
            role: 'recruiter',
            id: recruiter.id,
            fullName: recruiter.fullName,
            companyName: recruiter.companyName,
            email: recruiter.email,
            verificationStatus: recruiterVerificationStatus(recruiter)
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
        const admins = readData('admins.json');
        if (!admins.some(admin => admin.email === email)) {
            admins.push({ email, fullName: 'LJ Admin' });
            if (!writeData('admins.json', admins)) {
                return res.status(500).json({ error: 'Unable to start admin session.' });
            }
        }
        const sessionToken = createSession('admin', email);
        if (!sessionToken) {
            return res.status(500).json({ error: 'Unable to start admin session.' });
        }
        return res.json({
            message: "Admin login successful",
            sessionToken,
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
        const isProfileImage = req.path.includes('/recruiters/me/profile/');
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? (isProfileImage ? "Profile images must be 3 MB or less." : "Result files must be 5 MB or less.")
            : "Unable to process the uploaded file.";
        return res.status(400).json({ error: message });
    }

    if (error.message === 'Origin not allowed by CORS') {
        return res.status(403).json({ error: error.message });
    }

    if (error) {
        console.error('Request processing failed:', error);
        const safeUploadError = [
            'Result must be a PDF, JPG, or PNG file',
            'Profile images must be JPG, PNG, or WebP files.'
        ].includes(error.message) ? error.message : 'Unable to process the request.';
        return res.status(400).json({ error: safeUploadError });
    }

    next();
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
