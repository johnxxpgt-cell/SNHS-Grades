-- SNHS Gradebook: standardize the three grading periods as Term 1, Term 2, and Term 3.
-- Apply once to existing projects after the earlier class-scorebook and subject/feedback migrations.
-- This migration preserves existing marks and assessment scores. Existing scorebook period 4
-- records are remapped to Term 3; colliding assessment names are made unique before remapping.

begin;

-- Rename the legacy semester columns to the canonical term keys without discarding any values.
do $$
declare
  v_pair record;
  v_old_exists boolean;
  v_new_exists boolean;
begin
  for v_pair in
    select * from (values
      ('semester_1', 'term_1'),
      ('semester_2', 'term_2'),
      ('semester_3', 'term_3')
    ) as pairs(old_name, new_name)
  loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'subject_grades' and column_name = v_pair.old_name
    ) into v_old_exists;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'subject_grades' and column_name = v_pair.new_name
    ) into v_new_exists;

    if v_old_exists and not v_new_exists then
      execute format('alter table public.subject_grades rename column %I to %I', v_pair.old_name, v_pair.new_name);
    elsif v_old_exists and v_new_exists then
      execute format('update public.subject_grades set %I = coalesce(%I, %I)', v_pair.new_name, v_pair.new_name, v_pair.old_name);
      execute format('alter table public.subject_grades drop column %I', v_pair.old_name);
    end if;
  end loop;
end;
$$;

alter table public.subject_grades drop constraint if exists subject_grades_semester_1_range;
alter table public.subject_grades drop constraint if exists subject_grades_semester_2_range;
alter table public.subject_grades drop constraint if exists subject_grades_semester_3_range;
alter table public.subject_grades drop constraint if exists subject_grades_term_1_range;
alter table public.subject_grades drop constraint if exists subject_grades_term_2_range;
alter table public.subject_grades drop constraint if exists subject_grades_term_3_range;
alter table public.subject_grades
  add constraint subject_grades_term_1_range check (term_1 is null or term_1 between 0 and 100),
  add constraint subject_grades_term_2_range check (term_2 is null or term_2 between 0 and 100),
  add constraint subject_grades_term_3_range check (term_3 is null or term_3 between 0 and 100);

-- Rename the scorebook period key. The old column is only used here to migrate existing installations.
do $$
declare
  v_old_exists boolean;
  v_new_exists boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gradebook_assessments' and column_name = 'grading_period'
  ) into v_old_exists;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gradebook_assessments' and column_name = 'term_number'
  ) into v_new_exists;

  if v_old_exists and not v_new_exists then
    alter table public.gradebook_assessments rename column grading_period to term_number;
  elsif v_old_exists and v_new_exists then
    update public.gradebook_assessments set term_number = coalesce(term_number, grading_period);
    alter table public.gradebook_assessments drop column grading_period;
  end if;
end;
$$;

alter table public.gradebook_assessments drop constraint if exists gradebook_assessments_unique_name;
alter table public.gradebook_assessments drop constraint if exists gradebook_assessments_grading_period_check;
alter table public.gradebook_assessments drop constraint if exists gradebook_assessments_term_number_check;
drop index if exists public.gradebook_assessments_section_subject_idx;

-- Two previously separate fourth-period assessments can collide with a third-period assessment
-- once both are represented as Term 3. Rename only those collisions; retain all scores and dates.
do $$
declare
  v_row record;
  v_name text;
  v_suffix text;
  v_counter integer;
begin
  for v_row in
    select old_item.id, old_item.section_id, old_item.subject_name, old_item.category, old_item.assessment_name
      from public.gradebook_assessments old_item
     where old_item.term_number = 4
       and exists (
         select 1
           from public.gradebook_assessments existing_item
          where existing_item.term_number = 3
            and existing_item.section_id = old_item.section_id
            and lower(btrim(existing_item.subject_name)) = lower(btrim(old_item.subject_name))
            and existing_item.category = old_item.category
            and lower(btrim(existing_item.assessment_name)) = lower(btrim(old_item.assessment_name))
       )
     order by old_item.created_at, old_item.id
  loop
    v_suffix := ' (Earlier record)';
    v_name := left(v_row.assessment_name, 100 - char_length(v_suffix)) || v_suffix;
    v_counter := 1;
    while exists (
      select 1 from public.gradebook_assessments existing_item
       where existing_item.id <> v_row.id
         and existing_item.section_id = v_row.section_id
         and lower(btrim(existing_item.subject_name)) = lower(btrim(v_row.subject_name))
         and existing_item.category = v_row.category
         and lower(btrim(existing_item.assessment_name)) = lower(btrim(v_name))
         and existing_item.term_number in (3, 4)
    ) loop
      v_suffix := ' (Earlier ' || left(v_row.id::text, 8) || '-' || v_counter::text || ')';
      v_name := left(v_row.assessment_name, 100 - char_length(v_suffix)) || v_suffix;
      v_counter := v_counter + 1;
    end loop;

    update public.gradebook_assessments
       set assessment_name = v_name
     where id = v_row.id;
  end loop;
end;
$$;

-- Term 3 contains any legacy third- and fourth-period assessment rows, retaining all saved marks.
update public.gradebook_assessments set term_number = 3 where term_number = 4;

alter table public.gradebook_assessments
  add constraint gradebook_assessments_term_number_check check (term_number between 1 and 3),
  add constraint gradebook_assessments_unique_name unique (section_id, subject_name, term_number, category, assessment_name);

create index if not exists gradebook_assessments_section_subject_term_idx
  on public.gradebook_assessments (section_id, subject_name, term_number, category, created_at);

-- Recreate the roster helper against the canonical term keys. Existing values are never replaced.
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

commit;
