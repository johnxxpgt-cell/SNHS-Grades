-- Class-wide E-Class Record style scorebook.
-- Apply after the existing SNHS Gradebook schema/migrations.

create table if not exists public.gradebook_assessments (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.teacher_sections (id) on delete cascade,
  subject_name text not null check (char_length(btrim(subject_name)) between 2 and 80),
  grading_period smallint not null check (grading_period between 1 and 4),
  category text not null check (category in ('Written Works', 'Performance Tasks', 'Summative Test/Exam')),
  assessment_name text not null check (char_length(btrim(assessment_name)) between 2 and 100),
  max_score numeric(8,2) not null check (max_score > 0 and max_score <= 100000),
  assessed_on date not null default current_date,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint gradebook_assessments_unique_name unique (section_id, subject_name, grading_period, category, assessment_name)
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
  on public.gradebook_assessments (section_id, subject_name, grading_period, category, created_at);
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
