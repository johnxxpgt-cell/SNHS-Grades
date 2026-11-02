-- Require official DepEd email addresses for all new teacher Auth accounts.
create or replace function public.enforce_deped_teacher_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.email, '') !~* '^[^@[:space:]]+@deped[.]gov[.]ph$' then
    raise exception using
      errcode = '23514',
      message = 'Teacher registration requires an @deped.gov.ph email address.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_deped_teacher_email on auth.users;
create trigger enforce_deped_teacher_email
  before insert on auth.users
  for each row execute procedure public.enforce_deped_teacher_email();
revoke all on function public.enforce_deped_teacher_email() from public, anon, authenticated;
