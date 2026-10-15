-- SNHS Gradebook schema. Run once in Supabase SQL Editor before deploying.
create extension if not exists pgcrypto;

create table if not exists public.teacher_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 120),
  email text not null,
  gender text not null default 'Prefer not to say' check (gender in ('Female', 'Male', 'Prefer not to say')),
  avatar_path text,
  -- Legacy data URLs are retained only so existing profile photos remain visible during migration.
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

alter table public.teacher_profiles add column if not exists avatar_path text;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 3 and 120),
  -- HMAC digests let the server detect duplicates and verify access without retaining the LRN.
  lrn_digest char(64) not null unique,
  access_digest char(64) not null unique,
  -- PINs are stored as server-keyed HMAC digests; null supports existing records during upgrade.
  pin_digest char(64),
  date_of_birth_encrypted text not null,
  gender text not null check (gender in ('Female', 'Male', 'Prefer not to say')),
  avatar_path text,
  -- Legacy data URLs are retained only so existing student photos remain visible during migration.
  avatar_webp_data_url text check (avatar_webp_data_url is null or (char_length(avatar_webp_data_url) <= 520000 and avatar_webp_data_url like 'data:image/webp;base64,%')),
  section_id uuid not null references public.teacher_sections (id) on delete restrict,
  privacy_notice_version text,
  privacy_consented_at timestamptz,
  registered_at timestamptz not null default now()
);

alter table public.students add column if not exists privacy_notice_version text;
alter table public.students add column if not exists privacy_consented_at timestamptz;

create table if not exists public.subject_grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject_name text not null check (char_length(subject_name) between 2 and 80),
  term_1 numeric(5,2) constraint subject_grades_term_1_range check (term_1 is null or term_1 between 0 and 100),
  term_2 numeric(5,2) constraint subject_grades_term_2_range check (term_2 is null or term_2 between 0 and 100),
  term_3 numeric(5,2) constraint subject_grades_term_3_range check (term_3 is null or term_3 between 0 and 100),
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint subject_grades_unique_student_subject unique (student_id, subject_name)
);

alter table public.students add column if not exists avatar_path text;

alter table public.subject_grades add column if not exists term_1 numeric(5,2);
alter table public.subject_grades add column if not exists term_2 numeric(5,2);
alter table public.subject_grades add column if not exists term_3 numeric(5,2);
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subject_grades' and column_name = 'quarter_1'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subject_grades' and column_name = 'quarter_2'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subject_grades' and column_name = 'quarter_3'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subject_grades' and column_name = 'quarter_4'
  ) then
    execute $migration$
      update public.subject_grades
      set term_1 = coalesce(term_1, quarter_1),
          term_2 = coalesce(term_2, quarter_2),
          term_3 = coalesce(term_3,
            case
              when quarter_3 is not null and quarter_4 is not null then round((quarter_3 + quarter_4) / 2, 2)
              else coalesce(quarter_3, quarter_4)
            end)
      where term_1 is null or term_2 is null or term_3 is null
    $migration$;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subject_grades_term_1_range') then
    alter table public.subject_grades add constraint subject_grades_term_1_range check (term_1 is null or term_1 between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subject_grades_term_2_range') then
    alter table public.subject_grades add constraint subject_grades_term_2_range check (term_2 is null or term_2 between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subject_grades_term_3_range') then
    alter table public.subject_grades add constraint subject_grades_term_3_range check (term_3 is null or term_3 between 0 and 100);
  end if;
end;
$$;

alter table public.students add column if not exists pin_digest char(64);

create table if not exists public.student_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  category text not null check (category in ('Quiz', 'Activity', 'Exam')),
  assessment_name text not null check (char_length(assessment_name) between 2 and 100),
  score numeric(8,2) not null check (score >= 0),
  max_score numeric(8,2) not null check (max_score > 0),
  assessed_on date not null default current_date,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint student_assessments_score_within_max check (score <= max_score)
);

create table if not exists public.student_teacher_comments (
  student_id uuid primary key references public.students (id) on delete cascade,
  comment text not null check (char_length(btrim(comment)) between 1 and 1000),
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now()
);

create index if not exists students_section_idx on public.students (section_id, full_name);
create index if not exists subject_grades_student_idx on public.subject_grades (student_id, subject_name);
create index if not exists student_assessments_student_date_idx on public.student_assessments (student_id, assessed_on desc);

-- All self-service Auth sign-ups are teacher accounts. Teachers add sections from their own portal.
create or replace function public.handle_new_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.teacher_profiles (id, full_name, email, gender)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Teacher'),
    coalesce(new.email, ''),
    case when new.raw_user_meta_data ->> 'gender' in ('Female', 'Male') then new.raw_user_meta_data ->> 'gender' else 'Prefer not to say' end
  );

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
alter table public.student_assessments enable row level security;
alter table public.student_teacher_comments enable row level security;

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

drop policy if exists "Teachers read assessments in their sections" on public.student_assessments;
create policy "Teachers read assessments in their sections" on public.student_assessments
  for select to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_assessments.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers add assessments in their sections" on public.student_assessments;
create policy "Teachers add assessments in their sections" on public.student_assessments
  for insert to authenticated with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_assessments.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers update assessments in their sections" on public.student_assessments;
create policy "Teachers update assessments in their sections" on public.student_assessments
  for update to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_assessments.student_id and sec.teacher_id = (select auth.uid())
    )
  ) with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_assessments.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers delete assessments in their sections" on public.student_assessments;
create policy "Teachers delete assessments in their sections" on public.student_assessments
  for delete to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_assessments.student_id and sec.teacher_id = (select auth.uid())
    )
  );

drop policy if exists "Teachers read comments in their sections" on public.student_teacher_comments;
create policy "Teachers read comments in their sections" on public.student_teacher_comments
  for select to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_teacher_comments.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers add comments in their sections" on public.student_teacher_comments;
create policy "Teachers add comments in their sections" on public.student_teacher_comments
  for insert to authenticated with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_teacher_comments.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers update comments in their sections" on public.student_teacher_comments;
create policy "Teachers update comments in their sections" on public.student_teacher_comments
  for update to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_teacher_comments.student_id and sec.teacher_id = (select auth.uid())
    )
  ) with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_teacher_comments.student_id and sec.teacher_id = (select auth.uid())
    )
  );
drop policy if exists "Teachers delete comments in their sections" on public.student_teacher_comments;
create policy "Teachers delete comments in their sections" on public.student_teacher_comments
  for delete to authenticated using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_teacher_comments.student_id and sec.teacher_id = (select auth.uid())
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

-- Profile photos are stored as private WebP objects. The database keeps only their storage paths.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2097152, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/webp'];

drop policy if exists "Teachers read their own and roster photos" on storage.objects;
create policy "Teachers read their own and roster photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'profile-photos' and (
      ((storage.foldername(name))[1] = 'teachers' and (storage.foldername(name))[2] = (select auth.uid())::text)
      or (
        (storage.foldername(name))[1] = 'students' and exists (
          select 1 from public.students st
          join public.teacher_sections sec on sec.id = st.section_id
          where st.id::text = (storage.foldername(name))[2] and sec.teacher_id = (select auth.uid())
        )
      )
    )
  );
drop policy if exists "Teachers upload their own photos" on storage.objects;
create policy "Teachers upload their own photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = 'teachers'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
drop policy if exists "Teachers update their own photos" on storage.objects;
create policy "Teachers update their own photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = 'teachers'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  ) with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = 'teachers'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
drop policy if exists "Teachers delete their own photos" on storage.objects;
create policy "Teachers delete their own photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = 'teachers'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- RLS policies remain the data-access boundary for teacher sessions.
revoke usage on schema public from public, anon;
grant usage on schema public to authenticated, service_role;
revoke all on public.teacher_profiles, public.teacher_sections, public.students, public.subject_grades, public.student_assessments, public.student_teacher_comments
  from public, anon, authenticated, service_role;
grant select, update on public.teacher_profiles to authenticated;
grant select, insert, update, delete on public.teacher_sections to authenticated;
grant select (id, full_name, gender, avatar_path, avatar_webp_data_url, section_id, registered_at) on public.students to authenticated;
grant select, insert, update, delete on public.subject_grades to authenticated;
grant select, insert, update, delete on public.student_assessments to authenticated;
grant select, insert, update, delete on public.student_teacher_comments to authenticated;
-- Server routes use a secret key and need explicit table grants on newer Supabase projects.
grant select, insert, update, delete on public.teacher_profiles to service_role;
grant select, insert, update, delete on public.teacher_sections to service_role;
grant select, insert, update, delete on public.students to service_role;
grant select, insert, update, delete on public.subject_grades to service_role;
grant select, insert, update, delete on public.student_assessments to service_role;
grant select, insert, update, delete on public.student_teacher_comments to service_role;
revoke all on public.request_limits from public, anon, authenticated, service_role;


-- Encrypted public contact messages. Only server-side service_role may read/write this table.
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
create index if not exists contact_submissions_created_at_idx on public.contact_submissions (created_at desc);
alter table public.contact_submissions enable row level security;
revoke all on public.contact_submissions from public, anon, authenticated;
grant all on public.contact_submissions to service_role;

-- Class-wide scorebook schema. Kept in schema.sql for fresh installs; existing
-- projects should apply supabase/migrations/20261015_class_scorebook.sql.
-- Class-wide E-Class Record style scorebook.
-- Apply after the existing SNHS Gradebook schema/migrations.

create table if not exists public.gradebook_assessments (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.teacher_sections (id) on delete cascade,
  subject_name text not null check (char_length(btrim(subject_name)) between 2 and 80),
  term_number smallint not null check (term_number between 1 and 3),
  category text not null check (category in ('Written Works', 'Performance Tasks', 'Summative Test/Exam')),
  assessment_name text not null check (char_length(btrim(assessment_name)) between 2 and 100),
  max_score numeric(8,2) not null check (max_score > 0 and max_score <= 100000),
  assessed_on date not null default current_date,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint gradebook_assessments_unique_name unique (section_id, subject_name, term_number, category, assessment_name)
);

create table if not exists public.gradebook_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.gradebook_assessments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  -- NULL means no score has been entered; zero is a valid score.
  score numeric(8,2) check (score is null or score >= 0),
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint gradebook_scores_unique_student_assessment unique (assessment_id, student_id)
);

create index if not exists gradebook_assessments_section_subject_idx
  on public.gradebook_assessments (section_id, subject_name, term_number, category, created_at);
create index if not exists gradebook_scores_assessment_idx
  on public.gradebook_scores (assessment_id, student_id);

alter table public.gradebook_assessments enable row level security;
alter table public.gradebook_scores enable row level security;

-- A score must belong to the same section as the assessment and cannot exceed its maximum.
create or replace function public.validate_gradebook_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment_section uuid;
  v_student_section uuid;
  v_max_score numeric;
begin
  select a.section_id, a.max_score
    into v_assessment_section, v_max_score
    from public.gradebook_assessments as a
   where a.id = new.assessment_id;

  select s.section_id
    into v_student_section
    from public.students as s
   where s.id = new.student_id;

  if v_assessment_section is null or v_student_section is null then
    raise exception 'Assessment and student must exist';
  end if;

  if v_assessment_section <> v_student_section then
    raise exception 'Student must belong to the assessment class section';
  end if;

  if new.score is not null and (new.score < 0 or new.score > v_max_score) then
    raise exception 'Score must be between zero and the assessment maximum';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_gradebook_score() from public, anon, authenticated;
drop trigger if exists gradebook_scores_validate_before_write on public.gradebook_scores;
create trigger gradebook_scores_validate_before_write
before insert or update on public.gradebook_scores
for each row execute function public.validate_gradebook_score();

-- Assessment policies: a teacher can manage only records for sections they own.
drop policy if exists "Teachers read own class scorebook assessments" on public.gradebook_assessments;
create policy "Teachers read own class scorebook assessments"
  on public.gradebook_assessments for select to authenticated
  using (exists (
    select 1 from public.teacher_sections sec
    where sec.id = gradebook_assessments.section_id and sec.teacher_id = (select auth.uid())
  ));

drop policy if exists "Teachers create own class scorebook assessments" on public.gradebook_assessments;
create policy "Teachers create own class scorebook assessments"
  on public.gradebook_assessments for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.teacher_sections sec
    where sec.id = gradebook_assessments.section_id and sec.teacher_id = (select auth.uid())
  ));

drop policy if exists "Teachers delete own class scorebook assessments" on public.gradebook_assessments;
create policy "Teachers delete own class scorebook assessments"
  on public.gradebook_assessments for delete to authenticated
  using (exists (
    select 1 from public.teacher_sections sec
    where sec.id = gradebook_assessments.section_id and sec.teacher_id = (select auth.uid())
  ));

-- Score policies repeat both ownership and section-membership checks.
drop policy if exists "Teachers read own class scorebook scores" on public.gradebook_scores;
create policy "Teachers read own class scorebook scores"
  on public.gradebook_scores for select to authenticated
  using (exists (
    select 1
      from public.gradebook_assessments a
      join public.teacher_sections sec on sec.id = a.section_id
      join public.students st on st.section_id = sec.id
     where a.id = gradebook_scores.assessment_id
       and st.id = gradebook_scores.student_id
       and sec.teacher_id = (select auth.uid())
  ));

drop policy if exists "Teachers insert own class scorebook scores" on public.gradebook_scores;
create policy "Teachers insert own class scorebook scores"
  on public.gradebook_scores for insert to authenticated
  with check (updated_by = (select auth.uid()) and exists (
    select 1
      from public.gradebook_assessments a
      join public.teacher_sections sec on sec.id = a.section_id
      join public.students st on st.section_id = sec.id
     where a.id = gradebook_scores.assessment_id
       and st.id = gradebook_scores.student_id
       and sec.teacher_id = (select auth.uid())
  ));

drop policy if exists "Teachers update own class scorebook scores" on public.gradebook_scores;
create policy "Teachers update own class scorebook scores"
  on public.gradebook_scores for update to authenticated
  using (exists (
    select 1
      from public.gradebook_assessments a
      join public.teacher_sections sec on sec.id = a.section_id
      join public.students st on st.section_id = sec.id
     where a.id = gradebook_scores.assessment_id
       and st.id = gradebook_scores.student_id
       and sec.teacher_id = (select auth.uid())
  ))
  with check (updated_by = (select auth.uid()) and exists (
    select 1
      from public.gradebook_assessments a
      join public.teacher_sections sec on sec.id = a.section_id
      join public.students st on st.section_id = sec.id
     where a.id = gradebook_scores.assessment_id
       and st.id = gradebook_scores.student_id
       and sec.teacher_id = (select auth.uid())
  ));

drop policy if exists "Teachers delete own class scorebook scores" on public.gradebook_scores;
create policy "Teachers delete own class scorebook scores"
  on public.gradebook_scores for delete to authenticated
  using (exists (
    select 1
      from public.gradebook_assessments a
      join public.teacher_sections sec on sec.id = a.section_id
     where a.id = gradebook_scores.assessment_id
       and sec.teacher_id = (select auth.uid())
  ));

grant select, insert, delete on public.gradebook_assessments to authenticated;
grant select, insert, update, delete on public.gradebook_scores to authenticated;
grant select, insert, delete on public.gradebook_assessments to service_role;
grant select, insert, update, delete on public.gradebook_scores to service_role;


-- Subject catalogue, one-click grade roster seeding, and encrypted parent feedback.
-- Reusable subject catalogue, one-click subject roster seeding, and private parent feedback.
-- Apply after 20261015_class_scorebook.sql and the existing SNHS schema/migrations.

create table if not exists public.gradebook_subjects (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.teacher_sections(id) on delete cascade,
  subject_name text not null check (char_length(btrim(subject_name)) between 2 and 80),
  subject_key text generated always as (lower(btrim(subject_name))) stored,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint gradebook_subjects_unique_section_subject unique (section_id, subject_key)
);

create index if not exists gradebook_subjects_section_idx
  on public.gradebook_subjects(section_id, subject_key);

-- Backfill names already in the assessment scorebook and per-student grade records.
with candidates as (
  select a.section_id, btrim(a.subject_name) as subject_name, a.created_by, a.created_at as created_at
    from public.gradebook_assessments a
  union all
  select st.section_id, btrim(g.subject_name) as subject_name, sec.teacher_id as created_by, g.updated_at as created_at
    from public.subject_grades g
    join public.students st on st.id = g.student_id
    join public.teacher_sections sec on sec.id = st.section_id
), canonical as (
  select distinct on (section_id, lower(btrim(subject_name)))
         section_id, subject_name, created_by
    from candidates
   where char_length(btrim(subject_name)) between 2 and 80
   order by section_id, lower(btrim(subject_name)), created_at asc nulls last, subject_name asc
)
insert into public.gradebook_subjects(section_id, subject_name, created_by)
select section_id, subject_name, created_by from canonical
on conflict (section_id, subject_key) do nothing;

alter table public.gradebook_subjects enable row level security;
revoke all on public.gradebook_subjects from public, anon, authenticated, service_role;
grant select on public.gradebook_subjects to authenticated, service_role;

drop policy if exists "Teachers read subjects for own sections" on public.gradebook_subjects;
create policy "Teachers read subjects for own sections"
  on public.gradebook_subjects for select to authenticated
  using (exists (
    select 1 from public.teacher_sections sec
    where sec.id = gradebook_subjects.section_id and sec.teacher_id = (select auth.uid())
  ));

create or replace function public.create_gradebook_subject(p_section_id uuid, p_subject_name text)
returns table(id uuid, subject_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_id uuid;
  v_canonical text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.teacher_sections sec
    where sec.id = p_section_id and sec.teacher_id = (select auth.uid())
  ) then
    raise exception 'Not authorized for this class section' using errcode = '42501';
  end if;

  v_name := regexp_replace(btrim(coalesce(p_subject_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Subject name must be 2 to 80 characters' using errcode = '22023';
  end if;

  insert into public.gradebook_subjects(section_id, subject_name, created_by)
  values (p_section_id, v_name, (select auth.uid()))
  on conflict (section_id, subject_key) do nothing;

  select s.id, s.subject_name into v_id, v_canonical
    from public.gradebook_subjects s
   where s.section_id = p_section_id and s.subject_key = lower(v_name)
   limit 1;

  return query select v_id, v_canonical;
end;
$$;

revoke all on function public.create_gradebook_subject(uuid, text) from public, anon;
grant execute on function public.create_gradebook_subject(uuid, text) to authenticated;

-- Adds a subject row to each student's traditional grade record without replacing existing marks.
create or replace function public.add_subject_to_section_roster(p_section_id uuid, p_subject_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
  v_inserted integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.teacher_sections sec
    where sec.id = p_section_id and sec.teacher_id = (select auth.uid())
  ) then
    raise exception 'Not authorized for this class section' using errcode = '42501';
  end if;

  select subj.subject_name into v_subject
    from public.gradebook_subjects subj
   where subj.section_id = p_section_id
     and subj.subject_key = lower(regexp_replace(btrim(coalesce(p_subject_name, '')), '\s+', ' ', 'g'))
   limit 1;
  if v_subject is null then
    raise exception 'Create the subject before adding it to the roster' using errcode = '22023';
  end if;

  insert into public.subject_grades(student_id, subject_name, term_1, term_2, term_3, updated_by, updated_at)
  select st.id, v_subject, null, null, null, (select auth.uid()), now()
    from public.students st
   where st.section_id = p_section_id
     and not exists (
       select 1 from public.subject_grades existing
        where existing.student_id = st.id
          and lower(btrim(existing.subject_name)) = lower(v_subject)
     )
  on conflict (student_id, subject_name) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.add_subject_to_section_roster(uuid, text) from public, anon;
grant execute on function public.add_subject_to_section_roster(uuid, text) to authenticated;

-- New students automatically receive blank legacy subject-grade rows for subjects already saved for their section.
-- The class scorebook itself derives its student roster from students.section_id; this trigger keeps the traditional
-- three-term grade table in sync without overwriting any existing marks.
create or replace function public.seed_student_gradebook_subjects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
begin
  select sec.teacher_id into v_teacher_id
    from public.teacher_sections sec
   where sec.id = new.section_id;

  if v_teacher_id is null then
    return new;
  end if;

  insert into public.subject_grades(student_id, subject_name, term_1, term_2, term_3, updated_by, updated_at)
  select new.id, subj.subject_name, null, null, null, v_teacher_id, now()
    from public.gradebook_subjects subj
   where subj.section_id = new.section_id
  on conflict (student_id, subject_name) do nothing;

  return new;
end;
$$;

revoke all on function public.seed_student_gradebook_subjects() from public, anon, authenticated;
drop trigger if exists students_seed_gradebook_subjects_after_insert on public.students;
create trigger students_seed_gradebook_subjects_after_insert
after insert on public.students
for each row execute function public.seed_student_gradebook_subjects();

-- Parent/guardian feedback is encrypted before insert and decrypted only in the assigned teacher's server inbox.
create table if not exists public.student_parent_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  section_id uuid not null references public.teacher_sections(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  guardian_name_encrypted text not null,
  message_encrypted text not null,
  subject_name text,
  status text not null default 'new' check (status in ('new', 'in_review', 'resolved')),
  privacy_notice_version text not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_parent_feedback_teacher_created_idx
  on public.student_parent_feedback(teacher_id, created_at desc);

alter table public.student_parent_feedback enable row level security;
revoke all on public.student_parent_feedback from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.student_parent_feedback to service_role;
-- Intentionally no authenticated/anon policies or table grants: all message content passes through server routes.
