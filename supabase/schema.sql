-- SNHS Gradebook schema. Run once in Supabase SQL Editor before deploying.
create extension if not exists pgcrypto;

create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 120),
  email text not null,
  gender text not null default 'Prefer not to say' check (gender in ('Female', 'Male', 'Prefer not to say')),
  avatar_webp_data_url text check (avatar_webp_data_url is null or (char_length(avatar_webp_data_url) <= 520000 and avatar_webp_data_url like 'data:image/webp;base64,%')),
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_sections (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  grade_level smallint not null check (grade_level between 7 and 12),
  section_name text not null check (char_length(section_name) between 1 and 40),
  academic_year text not null check (char_length(academic_year) between 7 and 12),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint teacher_sections_unique_class unique (grade_level, section_name, academic_year)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 3 and 120),
  -- HMAC digests let the server detect duplicates and verify access without retaining the LRN.
  lrn_digest char(64) not null unique,
  access_digest char(64) not null unique,
  date_of_birth_encrypted text not null,
  gender text not null check (gender in ('Female', 'Male', 'Prefer not to say')),
  avatar_webp_data_url text check (avatar_webp_data_url is null or (char_length(avatar_webp_data_url) <= 520000 and avatar_webp_data_url like 'data:image/webp;base64,%')),
  section_id uuid not null references public.teacher_sections (id) on delete restrict,
  registered_at timestamptz not null default now()
);

create table if not exists public.subject_grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject_name text not null check (char_length(subject_name) between 2 and 80),
  quarter_1 numeric(5,2) check (quarter_1 is null or quarter_1 between 0 and 100),
  quarter_2 numeric(5,2) check (quarter_2 is null or quarter_2 between 0 and 100),
  quarter_3 numeric(5,2) check (quarter_3 is null or quarter_3 between 0 and 100),
  quarter_4 numeric(5,2) check (quarter_4 is null or quarter_4 between 0 and 100),
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint subject_grades_unique_student_subject unique (student_id, subject_name)
);

create index if not exists students_section_idx on public.students (section_id, full_name);
create index if not exists subject_grades_student_idx on public.subject_grades (student_id, subject_name);

-- All self-service Auth sign-ups are teacher accounts. Their first class is created inactive;
-- after email verification and sign-in, the teacher can activate it from the portal.
create or replace function public.handle_new_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grade_text text;
  grade_number smallint;
  section_text text;
  year_text text;
begin
  insert into public.teacher_profiles (id, full_name, email, gender)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Teacher'),
    coalesce(new.email, ''),
    case when new.raw_user_meta_data ->> 'gender' in ('Female', 'Male') then new.raw_user_meta_data ->> 'gender' else 'Prefer not to say' end
  );

  grade_text := new.raw_user_meta_data ->> 'grade_level';
  section_text := btrim(coalesce(new.raw_user_meta_data ->> 'section_name', ''));
  year_text := btrim(coalesce(new.raw_user_meta_data ->> 'academic_year', ''));
  if grade_text ~ '^(7|8|9|10|11|12)$' and char_length(section_text) between 1 and 40
     and char_length(year_text) between 7 and 12 then
    grade_number := grade_text::smallint;
    insert into public.teacher_sections (teacher_id, grade_level, section_name, academic_year, is_active)
    values (new.id, grade_number, section_text, year_text, false);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_snhs on auth.users;
create trigger on_auth_user_created_snhs
  after insert on auth.users
  for each row execute procedure public.handle_new_teacher();
revoke all on function public.handle_new_teacher() from public, anon, authenticated;

alter table public.teacher_profiles enable row level security;
alter table public.teacher_sections enable row level security;
alter table public.students enable row level security;
alter table public.subject_grades enable row level security;

drop policy if exists "Teachers read own profile" on public.teacher_profiles;
create policy "Teachers read own profile" on public.teacher_profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "Teachers update own profile" on public.teacher_profiles;
create policy "Teachers update own profile" on public.teacher_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "Teachers read own sections" on public.teacher_sections;
create policy "Teachers read own sections" on public.teacher_sections
  for select to authenticated using (teacher_id = (select auth.uid()));
drop policy if exists "Teachers create own sections" on public.teacher_sections;
create policy "Teachers create own sections" on public.teacher_sections
  for insert to authenticated with check (teacher_id = (select auth.uid()));
drop policy if exists "Teachers update own sections" on public.teacher_sections;
create policy "Teachers update own sections" on public.teacher_sections
  for update to authenticated using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
drop policy if exists "Teachers delete own sections" on public.teacher_sections;
create policy "Teachers delete own sections" on public.teacher_sections
  for delete to authenticated using (teacher_id = (select auth.uid()));

drop policy if exists "Teachers read students in their sections" on public.students;
create policy "Teachers read students in their sections" on public.students
  for select to authenticated using (
    exists (
      select 1 from public.teacher_sections s
      where s.id = students.section_id and s.teacher_id = (select auth.uid())
    )
  );

drop policy if exists "Teachers read grades in their sections" on public.subject_grades;
create policy "Teachers read grades in their sections" on public.subject_grades
  for select to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = subject_grades.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers add grades in their sections" on public.subject_grades;
create policy "Teachers add grades in their sections" on public.subject_grades
  for insert to authenticated with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = subject_grades.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers update grades in their sections" on public.subject_grades;
create policy "Teachers update grades in their sections" on public.subject_grades
  for update to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = subject_grades.student_id and sec.teacher_id = (select auth.uid())
    )
  ) with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = subject_grades.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers delete grades in their sections" on public.subject_grades;
create policy "Teachers delete grades in their sections" on public.subject_grades
  for delete to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = subject_grades.student_id and sec.teacher_id = (select auth.uid())
    )
  );

-- A server-only, atomic per-IP limiter for registration and public grade lookup.
create table if not exists public.request_limits (
  id uuid primary key default gen_random_uuid(),
  ip_digest char(64) not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists request_limits_lookup_idx on public.request_limits (ip_digest, action, created_at desc);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from public, anon, authenticated;

create or replace function public.consume_request_limit(
  p_ip_digest text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or char_length(p_action) > 60 then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_ip_digest), pg_catalog.hashtext(p_action));
  delete from public.request_limits where created_at < now() - interval '1 day';
  select count(*) into request_count
  from public.request_limits
  where ip_digest = p_ip_digest and action = p_action
    and created_at > now() - make_interval(secs => p_window_seconds);
  if request_count >= p_limit then
    return false;
  end if;
  insert into public.request_limits (ip_digest, action) values (p_ip_digest, p_action);
  return true;
end;
$$;

revoke all on function public.consume_request_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_request_limit(text, text, integer, integer) to service_role;

-- RLS policies remain the data-access boundary for teacher sessions.
revoke usage on schema public from public, anon;
grant usage on schema public to authenticated, service_role;
revoke all on public.teacher_profiles, public.teacher_sections, public.students, public.subject_grades
  from public, anon, authenticated, service_role;
grant select, update on public.teacher_profiles to authenticated;
grant select, insert, update, delete on public.teacher_sections to authenticated;
grant select on public.students to authenticated;
grant select, insert, update, delete on public.subject_grades to authenticated;
-- Server routes use a secret key and need explicit table grants on newer Supabase projects.
grant select, insert, update, delete on public.teacher_profiles to service_role;
grant select, insert, update, delete on public.teacher_sections to service_role;
grant select, insert, update, delete on public.students to service_role;
grant select, insert, update, delete on public.subject_grades to service_role;
revoke all on public.request_limits from public, anon, authenticated, service_role;
