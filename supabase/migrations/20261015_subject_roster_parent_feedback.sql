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

  insert into public.subject_grades(student_id, subject_name, semester_1, semester_2, semester_3, updated_by, updated_at)
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
-- three-semester grade table in sync without overwriting any existing marks.
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

  insert into public.subject_grades(student_id, subject_name, semester_1, semester_2, semester_3, updated_by, updated_at)
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
