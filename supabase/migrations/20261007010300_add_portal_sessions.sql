create table if not exists public.portal_sessions (
    token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
    email text not null,
    role text not null check (role in ('recruiter', 'admin')),
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists portal_sessions_expires_at_idx
    on public.portal_sessions (expires_at);

alter table public.portal_sessions enable row level security;
revoke all on public.portal_sessions from anon, authenticated;
grant all on public.portal_sessions to service_role;
