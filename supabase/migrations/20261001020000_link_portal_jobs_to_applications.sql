alter table public.jobs
    add column if not exists portal_job_id text;

create unique index if not exists jobs_portal_job_id_unique
    on public.jobs (portal_job_id);

alter table public.applications
    add column if not exists portal_job_id text;

grant all on public.jobs, public.applications to service_role;
revoke all on public.applications from anon, authenticated;
