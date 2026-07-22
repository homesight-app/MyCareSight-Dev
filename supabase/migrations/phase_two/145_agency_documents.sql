create table public.agency_documents (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  document_name text not null,
  file_url      text not null,
  file_name     text,
  document_type text,
  description   text,
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

alter table public.agency_documents enable row level security;

create policy "platform_staff_all_agency_documents" on public.agency_documents
  for all to authenticated
  using (is_platform_staff())
  with check (is_platform_staff());
