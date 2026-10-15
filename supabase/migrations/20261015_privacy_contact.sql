-- Privacy acknowledgements and encrypted contact inbox for SNHS Gradebook.
-- Safe to apply more than once to an existing Supabase project.
alter table public.students add column if not exists privacy_notice_version text;
alter table public.students add column if not exists privacy_consented_at timestamptz;

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name_encrypted text not null,
  email_encrypted text not null,
  subject_encrypted text not null,
  message_encrypted text not null,
  privacy_notice_version text not null,
  consented_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'in_review', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists contact_submissions_created_at_idx
  on public.contact_submissions (created_at desc);

alter table public.contact_submissions enable row level security;
revoke all on public.contact_submissions from public, anon, authenticated;
grant all on public.contact_submissions to service_role;
-- The trusted server-side Supabase client uses the service role to insert/read the table.
