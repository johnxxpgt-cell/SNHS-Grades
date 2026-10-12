-- Upgrade an existing gradebook to three semesters and private WebP photo storage.
-- Existing quarter values are retained. Q1 -> semester 1, Q2 -> semester 2,
-- and the mean of Q3/Q4 (or whichever one exists) -> semester 3.

alter table public.teacher_profiles add column if not exists avatar_path text;
alter table public.students add column if not exists avatar_path text;

alter table public.subject_grades add column if not exists semester_1 numeric(5,2);
alter table public.subject_grades add column if not exists semester_2 numeric(5,2);
alter table public.subject_grades add column if not exists semester_3 numeric(5,2);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subject_grades' and column_name = 'quarter_1')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subject_grades' and column_name = 'quarter_2')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subject_grades' and column_name = 'quarter_3')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'subject_grades' and column_name = 'quarter_4') then
    execute $migration$
      update public.subject_grades
      set semester_1 = coalesce(semester_1, quarter_1),
          semester_2 = coalesce(semester_2, quarter_2),
          semester_3 = coalesce(semester_3,
            case
              when quarter_3 is not null and quarter_4 is not null then round((quarter_3 + quarter_4) / 2, 2)
              else coalesce(quarter_3, quarter_4)
            end)
      where semester_1 is null or semester_2 is null or semester_3 is null
    $migration$;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subject_grades_semester_1_range') then
    alter table public.subject_grades add constraint subject_grades_semester_1_range check (semester_1 is null or semester_1 between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subject_grades_semester_2_range') then
    alter table public.subject_grades add constraint subject_grades_semester_2_range check (semester_2 is null or semester_2 between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subject_grades_semester_3_range') then
    alter table public.subject_grades add constraint subject_grades_semester_3_range check (semester_3 is null or semester_3 between 0 and 100);
  end if;
end;
$$;

-- New sign-ups create a teacher profile only. Sections are added after sign-in.
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
revoke all on function public.handle_new_teacher() from public, anon, authenticated;

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

grant select (avatar_path) on public.students to authenticated;

-- Teacher section ownership was already enforced by the installed RLS policies;
-- keep those policies in place while the account flow changes.
