-- Recovery question text is needed to prompt the student after their LRN and exact birthday match.
-- The answer is stored only as a server-keyed HMAC digest.
alter table public.students add column if not exists recovery_question text;
alter table public.students add column if not exists recovery_answer_digest text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass and conname = 'students_recovery_question_pair'
  ) then
    alter table public.students add constraint students_recovery_question_pair check (
      (recovery_question is null and recovery_answer_digest is null)
      or (recovery_question is not null and char_length(btrim(recovery_question)) between 8 and 160
          and recovery_answer_digest is not null
          and char_length(recovery_answer_digest) = 64
          and recovery_answer_digest ~ '^[0-9a-f]{64}$')
    );
  end if;
end $$;
