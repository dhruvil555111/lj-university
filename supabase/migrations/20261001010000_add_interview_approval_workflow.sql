create table if not exists public.placement_interviews (
    application_id text primary key,
    recruiter_id text,
    student_id text not null,
    job_id text not null,
    proposed_date date,
    proposed_time time,
    interview_type text check (interview_type is null or interview_type in ('Online', 'In-person', 'Phone')),
    location_or_meeting_link text,
    notes text,
    status text not null default 'Applied'
        check (status in ('Applied', 'Pending Admin Approval', 'Interview Scheduled', 'Rejected', 'Completed')),
    admin_approval_status text not null default 'Not Required'
        check (admin_approval_status in ('Not Required', 'Pending', 'Approved', 'Rejected / Change Requested')),
    admin_approval_by text,
    admin_approval_at timestamptz,
    rejection_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint placement_interviews_approval_consistency check (
        (status = 'Interview Scheduled' and admin_approval_status = 'Approved')
        or (status = 'Pending Admin Approval' and admin_approval_status = 'Pending')
        or (status = 'Rejected' and admin_approval_status = 'Rejected / Change Requested')
        or (status in ('Applied', 'Completed') and admin_approval_status in ('Not Required', 'Approved'))
    )
);

create index if not exists placement_interviews_pending_approval_idx
    on public.placement_interviews (status, proposed_date, proposed_time);

alter table public.placement_interviews enable row level security;

revoke all on public.placement_interviews from anon, authenticated;
grant all on public.placement_interviews to service_role;
