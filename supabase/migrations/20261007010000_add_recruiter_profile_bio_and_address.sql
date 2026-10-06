alter table public.recruiters
    add column if not exists short_bio text,
    add column if not exists full_address text;

alter table public.recruiters
    drop constraint if exists recruiters_verification_status_check,
    add constraint recruiters_verification_status_check
        check (verification_status in ('Pending', 'Approved', 'Rejected', 'Changes Requested'));
