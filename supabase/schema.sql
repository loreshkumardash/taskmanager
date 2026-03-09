create table if not exists public.tasks (
  id bigserial primary key,
  text text not null,
  status text not null default 'pending',
  priority text not null default 'medium',
  due_date date null,
  attachment_url text null,
  created_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists priority text,
  add column if not exists due_date date;

alter table public.tasks
  alter column status set default 'pending',
  alter column priority set default 'medium';

update public.tasks
set priority = 'medium'
where priority is null;

alter table public.tasks
  alter column priority set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_status_allowed'
  ) then
    alter table public.tasks
      add constraint tasks_status_allowed
      check (status in ('pending', 'completed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_priority_allowed'
  ) then
    alter table public.tasks
      add constraint tasks_priority_allowed
      check (priority in ('high', 'medium', 'low'));
  end if;
end $$;
