-- Fix workshop list not loading after create (RLS recursion on organization_members).
-- Run in Supabase SQL Editor if workshop creation "succeeds" but app stays on setup.

drop policy if exists "org_members_select" on public.organization_members;
drop policy if exists "org_members_select_self" on public.organization_members;
drop policy if exists "org_members_select_same_org" on public.organization_members;

create policy "org_members_select_own"
on public.organization_members for select
using (user_id = auth.uid ());
