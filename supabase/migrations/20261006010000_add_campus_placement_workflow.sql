alter table public.students
    add column if not exists semester integer,
    add column if not exists tenth_percentage numeric(5, 2),
    add column if not exists twelfth_percentage numeric(5, 2),
    add column if not exists skills text[] not null default '{}';

alter table public.jobs
    add column if not exists approval_status text,
    add column if not exists approved_by text,
    add column if not exists approved_at timestamptz,
    add column if not exists rejection_reason text,
    add column if not exists admin_notes text;

create index if not exists jobs_campus_drive_approval_idx
    on public.jobs (approval_status)
    where approval_status is not null;

create table if not exists public.recruiter_application_workflows (
    application_id text primary key,
    recruiter_id text not null,
    job_id text not null,
    workflow jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create index if not exists recruiter_application_workflows_recruiter_idx
    on public.recruiter_application_workflows (recruiter_id, job_id);

alter table public.recruiter_application_workflows enable row level security;
revoke all on public.recruiter_application_workflows from anon, authenticated;
grant all on public.recruiter_application_workflows to service_role;
