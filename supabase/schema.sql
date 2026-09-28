create extension if not exists pgcrypto;

create table if not exists public.students (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    enrollment text not null unique,
    email text not null unique,
    department text not null,
    spi_cgpi numeric(5, 2) not null check (spi_cgpi >= 0 and spi_cgpi <= 100),
    password_hash text not null,
    result_path text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.recruiters (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    company_name text not null,
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.jobs (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    company text not null,
    location text not null,
    salary text not null,
    job_type text not null,
    description text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.applications (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    status text not null default 'applied' check (status in ('applied', 'shortlisted', 'rejected', 'selected')),
    created_at timestamptz not null default now(),
    unique (student_id, job_id)
);

alter table public.students enable row level security;
alter table public.recruiters enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;

insert into storage.buckets (id, name, public)
values ('results', 'results', false)
on conflict (id) do update set public = false;

drop policy if exists "Service role manages result files" on storage.objects;
create policy "Service role manages result files"
on storage.objects
for all
to service_role
using (bucket_id = 'results')
with check (bucket_id = 'results');
