-- Workshop Inventory SaaS — run in Supabase SQL editor (or supabase db push)
-- Multi-tenant: organizations + members; data_batches (Excel JSON); scan_events (QR audit)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizations & membership
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_org_members_user on public.organization_members (user_id);
create index if not exists idx_org_members_org on public.organization_members (organization_id);

-- Create org + owner membership (callable right after signUp when session exists)
create or replace function public.create_organization_with_owner (org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  base_slug text;
  final_slug text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  base_slug := lower(regexp_replace(trim(org_name), '[^a-zA-Z0-9]+', '-', 'g'));
  if base_slug = '' or base_slug is null then
    base_slug := 'workshop';
  end if;

  final_slug := base_slug || '-' || substr(replace(gen_random_uuid ()::text, '-', ''), 1, 8);

  insert into public.organizations (name, slug)
  values (trim(org_name), final_slug)
  returning id into new_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_id, auth.uid (), 'owner');

  return new_id;
end;
$$;

revoke all on function public.create_organization_with_owner (text) from public;
grant execute on function public.create_organization_with_owner (text) to authenticated;

-- ---------------------------------------------------------------------------
-- Excel batches (JSON payload matches app DashboardPayload without id)
-- ---------------------------------------------------------------------------

create table if not exists public.data_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_filename text not null,
  period_label text not null,
  exported_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, source_filename)
);

create index if not exists idx_data_batches_org on public.data_batches (organization_id);

-- ---------------------------------------------------------------------------
-- QR scan audit (received = on premises; installed = fitted)
-- ---------------------------------------------------------------------------

create table if not exists public.scan_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type text not null check (event_type in ('received', 'installed')),
  qr_raw text not null,
  part_code text,
  truck_trailer text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index if not exists idx_scan_events_org on public.scan_events (organization_id);
create index if not exists idx_scan_events_created on public.scan_events (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.data_batches enable row level security;
alter table public.scan_events enable row level security;

-- Helper: orgs current user belongs to
-- Organizations: visible if member
create policy "orgs_select_member"
on public.organizations for select
using (
  id in (
    select organization_id from public.organization_members
    where user_id = auth.uid ()
  )
);

-- Members: each user reads only their own membership rows (avoids RLS recursion)
drop policy if exists "org_members_select_self" on public.organization_members;
drop policy if exists "org_members_select_same_org" on public.organization_members;
drop policy if exists "org_members_select" on public.organization_members;

create policy "org_members_select_own"
on public.organization_members for select
using (user_id = auth.uid ());

-- data_batches
create policy "data_batches_select"
on public.data_batches for select
using (
  organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid ()
  )
);

create policy "data_batches_insert"
on public.data_batches for insert
with check (
  organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid ()
  )
);

create policy "data_batches_update"
on public.data_batches for update
using (
  organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid ()
  )
);

create policy "data_batches_delete"
on public.data_batches for delete
using (
  organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid ()
  )
);

-- scan_events
create policy "scan_events_select"
on public.scan_events for select
using (
  organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid ()
  )
);

create policy "scan_events_insert"
on public.scan_events for insert
with check (
  organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid ()
  )
);

create policy "scan_events_delete"
on public.scan_events for delete
using (
  organization_id in (
    select organization_id from public.organization_members
    where user_id = auth.uid ()
  )
);
