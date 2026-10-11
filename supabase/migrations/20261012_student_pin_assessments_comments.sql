-- Add student PIN access, assessment scores, and teacher comments without dropping existing records.
-- Run this once in the Supabase SQL Editor for an already-installed gradebook.

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

create index if not exists student_assessments_student_date_idx
  on public.student_assessments (student_id, assessed_on desc);

alter table public.student_assessments enable row level security;
alter table public.student_teacher_comments enable row level security;

drop policy if exists "Teachers manage assessments in their sections" on public.student_assessments;
create policy "Teachers manage assessments in their sections" on public.student_assessments
  for all to authenticated
  using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_assessments.student_id and sec.teacher_id = (select auth.uid())
    )
  )
  with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_assessments.student_id and sec.teacher_id = (select auth.uid())
    )
  );

drop policy if exists "Teachers manage comments in their sections" on public.student_teacher_comments;
create policy "Teachers manage comments in their sections" on public.student_teacher_comments
  for all to authenticated
  using (
    exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_teacher_comments.student_id and sec.teacher_id = (select auth.uid())
    )
  )
  with check (
    updated_by = (select auth.uid()) and exists (
      select 1 from public.students st
      join public.teacher_sections sec on sec.id = st.section_id
      where st.id = student_teacher_comments.student_id and sec.teacher_id = (select auth.uid())
    )
  );

revoke all on public.student_assessments, public.student_teacher_comments
  from public, anon, authenticated, service_role;
revoke select on public.students from authenticated;
grant select (id, full_name, gender, avatar_webp_data_url, section_id, registered_at) on public.students to authenticated;
grant select, insert, update, delete on public.student_assessments to authenticated, service_role;
grant select, insert, update, delete on public.student_teacher_comments to authenticated, service_role;
