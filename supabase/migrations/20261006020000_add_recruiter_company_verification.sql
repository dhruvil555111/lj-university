alter table public.recruiters
    add column if not exists designation text,
    add column if not exists hr_talent_acquisition text,
    add column if not exists official_email text,
    add column if not exists phone text,
    add column if not exists linkedin_profile text,
    add column if not exists location text,
    add column if not exists industry text,
    add column if not exists company_type text,
    add column if not exists company_size text,
    add column if not exists founded_year integer,
    add column if not exists website text,
    add column if not exists linkedin_url text,
    add column if not exists company_description text,
    add column if not exists company_logo_path text,
    add column if not exists profile_photo_path text,
    add column if not exists verification_status text not null default 'Pending',
    add column if not exists verification_submitted_at timestamptz,
    add column if not exists verified boolean not null default false,
    add column if not exists verified_by text,
    add column if not exists verified_at timestamptz,
    add column if not exists verification_rejection_reason text,
    add column if not exists rejected_by text,
    add column if not exists rejected_at timestamptz;

update public.recruiters
set verified = (verification_status = 'Approved');

comment on column public.recruiters.verified_by is
    'Placement Cell approver when verification_status is Approved (approved_by equivalent).';
comment on column public.recruiters.verified_at is
    'Placement Cell approval timestamp when verification_status is Approved (approved_at equivalent).';
comment on column public.recruiters.verification_rejection_reason is
    'Placement Cell rejection reason (rejection_reason equivalent).';
comment on column public.recruiters.verification_submitted_at is
    'Latest recruiter company-profile submission time (submitted_at equivalent).';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'recruiters_verification_status_check'
            and conrelid = 'public.recruiters'::regclass
    ) then
        alter table public.recruiters
            add constraint recruiters_verification_status_check
            check (verification_status in ('Pending', 'Approved', 'Rejected'));
    end if;
end
$$;

create index if not exists recruiters_verification_status_idx
    on public.recruiters (verification_status);
