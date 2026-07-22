create table public.agency_notes (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  author_id  uuid not null references auth.users(id),
  content    text not null,
  note_type  text not null default 'general',
  created_at timestamptz not null default now()
);

alter table public.agency_notes enable row level security;

create policy "platform_staff_all_agency_notes" on public.agency_notes
  for all to authenticated
  using (is_platform_staff())
  with check (is_platform_staff());
